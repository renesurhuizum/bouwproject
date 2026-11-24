// Minimale STEP Physical File (ISO 10303-21) writer voor IFC.
// Houdt entiteiten bij als regels "#n=IFCXXX(...);" en levert hulpjes voor
// correcte waarde-codering (reals, strings met \X2\-escapes, enums, refs).

export type Ref = { readonly ref: number };

/** Ruwe STEP-waarde die ongewijzigd wordt weggeschreven (bv. IFCLABEL('x')). */
export class Raw {
  constructor(readonly text: string) {}
}

export type StepValue =
  | null // $
  | undefined // $
  | "*" // afgeleid attribuut
  | boolean
  | number // altijd als REAL
  | string // STRING
  | Ref
  | Raw
  | StepValue[];

export const DERIVED = "*" as const;

export function enumv(name: string): Raw {
  return new Raw(`.${name.toUpperCase()}.`);
}

export function int(n: number): Raw {
  return new Raw(String(Math.round(n)));
}

/** Getypeerde waarde voor een SELECT, bv. typed("IFCLABEL", "abc"). */
export function typed(type: string, v: StepValue): Raw {
  return new Raw(`${type}(${encode(v)})`);
}

export function real(n: number): string {
  if (!Number.isFinite(n)) n = 0;
  // Afronden op 1e-6 (µm) — ruim genoeg voor bouwmaten, en voorkomt "1e-7".
  const r = Math.round(n * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return "0.";
  let s = r.toFixed(6).replace(/0+$/, "");
  if (s.endsWith(".")) return s;
  if (!s.includes(".")) s += ".";
  return s;
}

export function str(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (code >= 0x20 && code < 0x7f) out += ch;
    else if (code <= 0xffff) out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    else out += `\\X4\\${code.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
  }
  return `'${out}'`;
}

export function encode(v: StepValue): string {
  if (v === null || v === undefined) return "$";
  if (v === "*") return "*";
  if (typeof v === "boolean") return v ? ".T." : ".F.";
  if (typeof v === "number") return real(v);
  if (typeof v === "string") return str(v);
  if (v instanceof Raw) return v.text;
  if (Array.isArray(v)) return `(${v.map(encode).join(",")})`;
  return `#${v.ref}`;
}

export class StepWriter {
  private lines: string[] = [];
  private next = 1;

  add(entity: string, ...attrs: StepValue[]): Ref {
    const id = this.next++;
    this.lines.push(`#${id}=${entity.toUpperCase()}(${attrs.map(encode).join(",")});`);
    return { ref: id };
  }

  toString(header: { description: string; name: string; author: string; organization: string; app: string; schema: string }): string {
    const ts = new Date().toISOString().slice(0, 19);
    return [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION((${str(header.description)}),'2;1');`,
      `FILE_NAME(${str(header.name)},${str(ts)},(${str(header.author)}),(${str(header.organization)}),${str(header.app)},${str(header.app)},'');`,
      `FILE_SCHEMA((${str(header.schema)}));`,
      "ENDSEC;",
      "DATA;",
      ...this.lines,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n");
  }
}

// ── IFC GlobalId (22 tekens, IFC-base64) ──────────────────────────────────────

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function bytesToIfcGuid(bytes: Uint8Array): string {
  const enc = (num: number, chars: number) => {
    let s = "";
    for (let i = 0; i < chars; i++) {
      s = B64[num % 64] + s;
      num = Math.floor(num / 64);
    }
    return s;
  };
  let out = enc(bytes[0], 2);
  for (let i = 1; i < 16; i += 3) out += enc((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2], 4);
  return out;
}

/** 128-bit hash (4× FNV-1a met verschillende seeds) — deterministisch. */
function hash128(s: string): Uint8Array {
  const out = new Uint8Array(16);
  for (let k = 0; k < 4; k++) {
    let h = (0x811c9dc5 ^ (k * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // extra mixing
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    out[k * 4] = h >>> 24;
    out[k * 4 + 1] = (h >>> 16) & 0xff;
    out[k * 4 + 2] = (h >>> 8) & 0xff;
    out[k * 4 + 3] = h & 0xff;
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stabiele IFC GlobalId. Een UUID wordt 1-op-1 omgezet (zodat dezelfde muur
 * bij een volgende export dezelfde GUID houdt — belangrijk voor BIM-viewers
 * en wijzigingsvergelijking); andere sleutels worden gehasht.
 */
export function ifcGuid(key: string): string {
  let bytes: Uint8Array;
  if (UUID_RE.test(key)) {
    const hex = key.replace(/-/g, "");
    bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  } else {
    bytes = hash128(key);
  }
  return bytesToIfcGuid(bytes);
}
