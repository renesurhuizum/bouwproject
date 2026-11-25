// Dak-mesh generatie. Pure berekening op basis van de bounding box van de
// dakvoet (W = breedte langs X, D = diepte langs Z). Geeft losse driehoeken
// terug (positions + indices); normalen worden door three berekend, materiaal
// rendert dubbelzijdig zodat winding er niet toe doet.
//
// Coördinaten: gecentreerd op de oorsprong, y=0 op de dakvoet (eaves),
// +y omhoog. De nok loopt langs de X-as (ridgeDirection draait het geheel
// in de 3D-scene).

import type { RoofType } from "./domain/types";

export interface RoofMesh {
  positions: number[];
  indices: number[];
  ridgeHeight: number;
  ridgeStart: number; // lokale x van het begin van de nok
  ridgeEnd: number; // lokale x van het einde van de nok
}

// Wolfseind / schild aan een kopse kant: `run` = horizontale afstand van de
// dakrand (incl. overstek) tot het begin van de nok, `foot` = hoogte van de
// onderrand van het schildvlak boven de dakvoet (0 = volledig schild).
export interface HipEnd {
  run: number;
  foot: number;
}

export interface RoofOptions {
  gableEnds?: boolean;
  hipStart?: HipEnd; // kant x-
  hipEnd?: HipEnd; // kant x+
}

function builder() {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number) => indices.push(a, b, c);
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  return { positions, indices, v, tri, quad };
}

export function buildRoof(
  type: RoofType,
  W: number,
  D: number,
  pitchDeg: number,
  overhang: number,
  opts: RoofOptions = {},
): RoofMesh {
  const gableEnds = opts.gableEnds ?? true;
  const b = builder();
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const pitch = (pitchDeg * Math.PI) / 180;

  if (type === "flat") {
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, 0, hd);
    const e = b.v(-hw, 0, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, ridgeHeight: 0, ridgeStart: -hw, ridgeEnd: hw };
  }

  if (type === "shed") {
    const h = Math.tan(pitch) * (2 * hd);
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, h, hd);
    const e = b.v(-hw, h, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, ridgeHeight: h, ridgeStart: -hw, ridgeEnd: hw };
  }

  if (type === "hip") {
    const h = Math.tan(pitch) * (D / 2);
    const rx = Math.max(0, hw - hd); // 45° heupen
    const r0 = b.v(-rx, h, 0);
    const r1 = b.v(rx, h, 0);
    const A = b.v(-hw, 0, -hd);
    const B = b.v(hw, 0, -hd);
    const C = b.v(hw, 0, hd);
    const Dd = b.v(-hw, 0, hd);
    b.quad(A, B, r1, r0); // lange schuine vlak (z-)
    b.quad(Dd, r0, r1, C); // lange schuine vlak (z+)
    b.tri(A, r0, Dd); // heupvlak x-
    b.tri(B, C, r1); // heupvlak x+
    return { positions: b.positions, indices: b.indices, ridgeHeight: h, ridgeStart: -rx, ridgeEnd: rx };
  }

  // gable (zadeldak) + mansard (benaderd als steil zadeldak), optioneel met
  // wolfseind/schild aan één of beide kopse kanten.
  const tan = Math.tan(pitch);
  const h = tan * hd;
  const footZ = (foot: number) => Math.max(0, hd - foot / tan); // |z| waar het dakvlak `foot` bereikt
  const hs = opts.hipStart;
  const he = opts.hipEnd;
  const r0 = b.v(-hw + (hs ? hs.run : 0), h, 0);
  const r1 = b.v(hw - (he ? he.run : 0), h, 0);
  const A = b.v(-hw, 0, -hd);
  const B = b.v(hw, 0, -hd);
  const C = b.v(hw, 0, hd);
  const Dd = b.v(-hw, 0, hd);
  const Ps = hs && hs.foot > 0.001 ? [b.v(-hw, hs.foot, -footZ(hs.foot)), b.v(-hw, hs.foot, footZ(hs.foot))] : null;
  const Pe = he && he.foot > 0.001 ? [b.v(hw, he.foot, -footZ(he.foot)), b.v(hw, he.foot, footZ(he.foot))] : null;
  const fan = (pts: number[]) => {
    for (let i = 1; i < pts.length - 1; i++) b.tri(pts[0], pts[i], pts[i + 1]);
  };
  // dakvlak z-  en  z+
  fan([A, B, ...(Pe ? [Pe[0]] : []), r1, r0, ...(Ps ? [Ps[0]] : [])]);
  fan([Dd, C, ...(Pe ? [Pe[1]] : []), r1, r0, ...(Ps ? [Ps[1]] : [])]);
  // kopse kant x-
  if (hs) b.tri(Ps ? Ps[0] : A, r0, Ps ? Ps[1] : Dd);
  if ((!hs || Ps) && gableEnds) {
    if (Ps) b.quad(A, Ps[0], Ps[1], Dd);
    else b.tri(A, r0, Dd);
  }
  // kopse kant x+
  if (he) b.tri(Pe ? Pe[0] : B, r1, Pe ? Pe[1] : C);
  if ((!he || Pe) && gableEnds) {
    if (Pe) b.quad(B, Pe[0], Pe[1], C);
    else b.tri(B, C, r1);
  }
  return {
    positions: b.positions,
    indices: b.indices,
    ridgeHeight: h,
    ridgeStart: -hw + (hs ? hs.run : 0),
    ridgeEnd: hw - (he ? he.run : 0),
  };
}

// Hoogte van het dakvlak (boven de dakvoet) op lokaal punt (x, z) voor een
// zadeldak met optionele wolfseinden. Buiten het dak: 0.
export function gableRoofHeightAt(W: number, D: number, pitchDeg: number, overhang: number, x: number, z: number, opts: RoofOptions = {}): number {
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const tan = Math.tan((pitchDeg * Math.PI) / 180);
  const H = tan * hd;
  let y = tan * (hd - Math.abs(z));
  if (opts.hipStart) y = Math.min(y, opts.hipStart.foot + ((x + hw) * (H - opts.hipStart.foot)) / opts.hipStart.run);
  if (opts.hipEnd) y = Math.min(y, opts.hipEnd.foot + ((hw - x) * (H - opts.hipEnd.foot)) / opts.hipEnd.run);
  return Math.max(0, y);
}
