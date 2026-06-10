// NEN 1010, NEN 2580 en Bouwbesluit 2012 validatie-regels.
// Geeft waarschuwingen + fouten terug als leesbare meldingen.

import type {
  ElectricalItem,
  HvacItem,
  PlumbingItem,
  Room,
  Wall,
  Level,
} from "./domain/types";
import { pointInPolygon, polygonArea, projectOnSegment } from "./geometry";
import { roomWalls } from "./roomWalls";

export interface ValidationIssue {
  severity: "error" | "warn" | "info";
  message: string;
  entityId?: string;
}

// ── NEN 1010 elektra-controles ────────────────────────────────────────────────

export function validateElectrical(items: ElectricalItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Groepeer per groep
  const byGroup = new Map<string, ElectricalItem[]>();
  for (const it of items) {
    if (!it.group) continue;
    const list = byGroup.get(it.group) ?? [];
    list.push(it);
    byGroup.set(it.group, list);
  }

  for (const [group, list] of byGroup) {
    // NEN 1010: aanbeveling max 12 verbruikers per 16A-groep
    const outlets = list.filter(
      (i) => i.type === "socket" || i.type === "socket-double" || i.type === "data",
    );
    if (outlets.length > 12) {
      issues.push({
        severity: "warn",
        message: `Groep ${group}: ${outlets.length} stopcontacten — aanbeveling is max 12 (NEN 1010)`,
      });
    }
  }

  // Schakelaars zonder gekoppeld lichtpunt
  const switches = items.filter((i) => i.type === "switch");
  for (const sw of switches) {
    if (!sw.linkedIds || sw.linkedIds.length === 0) {
      issues.push({
        severity: "info",
        message: `Schakelaar${sw.label ? ` "${sw.label}"` : ""} is nog niet gekoppeld aan een lichtpunt`,
        entityId: sw.id,
      });
    }
  }

  return issues;
}

// ── Constructieve veiligheid: dragende muren ─────────────────────────────────

export function validateWalls(walls: Wall[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const wall of walls) {
    if (wall.loadBearing && wall.status === "demolish") {
      issues.push({
        severity: "error",
        message:
          "Dragende muur staat gepland voor sloop — laat eerst een constructeur rekenen (staalbalk/portaal) en check vergunningsplicht bij het Omgevingsloket",
        entityId: wall.id,
      });
    }
  }

  return issues;
}

// ── Bouwbesluit 2012 ruimte-controles ─────────────────────────────────────────

const FUNC_WOONRUIMTE = ["woonkamer", "slaapkamer", "kamer", "woon", "slaap", "bedroom", "living"];
const FUNC_BADKAMER = ["badkamer", "bathroom", "bad", "douche"];
const FUNC_TOILET = ["toilet", "wc"];

function isFuncMatch(room: Room, keywords: string[]): boolean {
  const text = ((room.func ?? "") + " " + room.name).toLowerCase();
  return keywords.some((k) => text.includes(k));
}

export function validateRooms(rooms: Room[], levels: Level[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const room of rooms) {
    if (room.polygon.length < 3) continue;
    const area = polygonArea(room.polygon);

    // Bouwbesluit 2012 - woonruimtes
    if (isFuncMatch(room, FUNC_WOONRUIMTE)) {
      if (area < 7.5) {
        issues.push({
          severity: "warn",
          message: `"${room.name}" is ${area.toFixed(1)} m² — Bouwbesluit vereist minimaal 7,5 m² voor woonruimte`,
          entityId: room.id,
        });
      }
    }

    // Badkamer
    if (isFuncMatch(room, FUNC_BADKAMER)) {
      if (area < 1.6) {
        issues.push({
          severity: "warn",
          message: `"${room.name}" is ${area.toFixed(1)} m² — badkamer moet minimaal 1,6 m² zijn (Bouwbesluit)`,
          entityId: room.id,
        });
      }
    }

    // Toilet
    if (isFuncMatch(room, FUNC_TOILET)) {
      if (area < 0.9 * 1.2) {
        issues.push({
          severity: "warn",
          message: `"${room.name}" is ${area.toFixed(1)} m² — toiletruimte minimaal 0,9×1,2 m (Bouwbesluit)`,
          entityId: room.id,
        });
      }
    }
  }

  // Wandhoogtes
  for (const level of levels) {
    if (level.height < 2.6) {
      issues.push({
        severity: "warn",
        message: `Verdieping "${level.name}": hoogte ${(level.height * 100).toFixed(0)} cm — Bouwbesluit vereist 260 cm voor woonruimtes`,
        entityId: level.id,
      });
    }
  }

  return issues;
}

// ── Aansluitingen per ruimte ─────────────────────────────────────────────────
// Controleert per ruimtefunctie of de benodigde water-, afvoer-, elektra- en
// ventilatie-aansluitingen aanwezig zijn (keuken → warm/koud + kookgroep, etc.).

const FUNC_KEUKEN = ["keuken", "kitchen"];
const FUNC_WASRUIMTE = ["wasruimte", "washok", "bijkeuken"];

export function validateRoomServices(
  rooms: Room[],
  plumbing: PlumbingItem[],
  electrical: ElectricalItem[],
  hvac: HvacItem[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const inRoom = (room: Room, p?: { x: number; y: number }) =>
    !!p && pointInPolygon(p, room.polygon);

  for (const room of rooms) {
    if (room.polygon.length < 3) continue;

    const fixtures = plumbing.filter((it) => it.type === "fixture" && inRoom(room, it.position));
    const hasFixture = (kind: string) => fixtures.some((f) => f.fixture === kind);
    // Leiding "raakt" de ruimte als een traject-punt binnen de polygon ligt.
    const hasPipe = (type: string) =>
      plumbing.some((it) => it.type === type && it.path?.some((p) => pointInPolygon(p, room.polygon)));
    const elec = electrical.filter((it) => inRoom(room, it.position));
    const hasVent = hvac.some(
      (it) =>
        (it.type === "ventilation" || it.type === "wtw") &&
        (inRoom(room, it.position) || it.path?.some((p) => pointInPolygon(p, room.polygon))),
    );

    // Keuken: warm + koud water, afvoer en kookgroep (Perilex 2-fase).
    if (isFuncMatch(room, FUNC_KEUKEN)) {
      if (!hasFixture("kitchen-tap") && !hasFixture("sink")) {
        issues.push({
          severity: "warn",
          message: `"${room.name}": nog geen kraan/tappunt — keuken heeft warm én koud water nodig`,
          entityId: room.id,
        });
      } else {
        if (!hasPipe("supply-hot")) {
          issues.push({
            severity: "info",
            message: `"${room.name}": teken de warmwater-aanvoer (rode leiding) naar de keukenkraan`,
            entityId: room.id,
          });
        }
        if (!hasPipe("supply-cold")) {
          issues.push({
            severity: "info",
            message: `"${room.name}": teken de koudwater-aanvoer (blauwe leiding) naar de keukenkraan`,
            entityId: room.id,
          });
        }
        if (!hasPipe("drain")) {
          issues.push({
            severity: "warn",
            message: `"${room.name}": afvoer ontbreekt nog (spoelbak/vaatwasser)`,
            entityId: room.id,
          });
        }
      }
      if (!elec.some((e) => e.type === "perilex")) {
        issues.push({
          severity: "warn",
          message: `"${room.name}": elektrisch koken vereist een Perilex-aansluiting (2-fase kookgroep) — plaats deze via Installatie → Elektra`,
          entityId: room.id,
        });
      }
      if (elec.filter((e) => e.type === "socket" || e.type === "socket-double").length < 2) {
        issues.push({
          severity: "info",
          message: `"${room.name}": reken op aparte groepen voor vaatwasser, oven en combimagnetron (NEN 1010)`,
          entityId: room.id,
        });
      }
    }

    // Badkamer: warm + koud water, afvoer, ventilatie, elektra-zones.
    if (isFuncMatch(room, FUNC_BADKAMER)) {
      const wetFixtures = fixtures.filter((f) =>
        ["shower", "bath", "sink"].includes(f.fixture ?? ""),
      );
      if (wetFixtures.length > 0) {
        if (!hasPipe("supply-hot")) {
          issues.push({
            severity: "info",
            message: `"${room.name}": warmwater-aanvoer naar douche/bad/wastafel nog niet getekend`,
            entityId: room.id,
          });
        }
        if (!hasPipe("drain")) {
          issues.push({
            severity: "warn",
            message: `"${room.name}": afvoerleiding ontbreekt nog`,
            entityId: room.id,
          });
        }
      }
      if (!hasVent) {
        issues.push({
          severity: "warn",
          message: `"${room.name}": badkamer vereist mechanische ventilatie (Bouwbesluit, min. 14 dm³/s)`,
          entityId: room.id,
        });
      }
      if (elec.some((e) => e.type === "socket" || e.type === "socket-double")) {
        issues.push({
          severity: "info",
          message: `"${room.name}": stopcontacten in badkamer — let op zone-indeling NEN 1010 (min. 60 cm van bad/douche, 30 mA aardlek)`,
          entityId: room.id,
        });
      }
    }

    // Toilet: koud water, afvoer, ventilatie.
    if (isFuncMatch(room, FUNC_TOILET)) {
      if (hasFixture("toilet")) {
        if (!hasPipe("supply-cold")) {
          issues.push({
            severity: "info",
            message: `"${room.name}": koudwater-aanvoer naar het toilet nog niet getekend`,
            entityId: room.id,
          });
        }
        if (!hasPipe("drain")) {
          issues.push({
            severity: "warn",
            message: `"${room.name}": afvoer (110 mm standleiding) ontbreekt nog`,
            entityId: room.id,
          });
        }
      }
      if (!hasVent) {
        issues.push({
          severity: "info",
          message: `"${room.name}": toiletruimte heeft ventilatie nodig (Bouwbesluit, min. 7 dm³/s)`,
          entityId: room.id,
        });
      }
    }

    // Wasruimte / wasmachine-opstelplaats.
    const wm = fixtures.find((f) => f.fixture === "washing-machine");
    if (wm || isFuncMatch(room, FUNC_WASRUIMTE)) {
      if (wm) {
        if (!hasPipe("drain")) {
          issues.push({
            severity: "warn",
            message: `"${room.name}": wasmachine heeft een afvoer nodig`,
            entityId: room.id,
          });
        }
        if (!elec.some((e) => e.type === "socket" || e.type === "socket-double")) {
          issues.push({
            severity: "info",
            message: `"${room.name}": wasmachine vereist een eigen eindgroep met stopcontact (NEN 1010)`,
            entityId: room.id,
          });
        }
      }
    }

    // CV-ketel / boiler: condensafvoer.
    if (fixtures.some((f) => f.fixture === "boiler") && !hasPipe("drain")) {
      issues.push({
        severity: "info",
        message: `"${room.name}": CV-ketel heeft een condensafvoer nodig`,
        entityId: room.id,
      });
    }
  }

  return issues;
}

// ── NEN 2580: netto vloeroppervlak ────────────────────────────────────────────
// Benadering: bruto polygoon-oppervlak min de halve dikte van de werkelijk
// aangrenzende muren langs de omtrek (polygon ligt op de muur-hartlijnen).

export function nvoArea(room: Room, walls: Wall[]): number {
  const bruto = polygonArea(room.polygon);
  if (room.polygon.length < 3) return bruto;

  const adjacent = roomWalls(room.polygon, walls);
  let inset = 0;
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i];
    const b = room.polygon[(i + 1) % room.polygon.length];
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    // Dikte van de muur op deze zijde; val terug op 10 cm binnenwand.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let thickness = 0.1;
    for (const w of adjacent) {
      const { dist: d } = projectOnSegment(mid, w.start, w.end);
      if (d < 0.8) {
        thickness = w.thickness;
        break;
      }
    }
    inset += edgeLen * (thickness / 2);
  }
  return Math.max(0, bruto - inset);
}
