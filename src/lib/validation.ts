// NEN 1010, NEN 2580 en Bouwbesluit 2012 validatie-regels.
// Geeft waarschuwingen + fouten terug als leesbare meldingen.

import type { ElectricalItem, Room, Wall, Level } from "./domain/types";
import { polygonArea } from "./geometry";

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

// ── NEN 2580: netto vloeroppervlak ────────────────────────────────────────────
// Eenvoudige benadering: bruto polygoon-oppervlak verminderd met muurdikte-correctie.

export function nvoArea(room: Room, walls: Wall[]): number {
  const bruto = polygonArea(room.polygon);
  // Vind muren die de kamer omhullen (snelle benadering: muren op hetzelfde niveau)
  const wallInset = walls.reduce((sum, w) => sum + w.thickness * 0.1, 0);
  return Math.max(0, bruto - wallInset);
}
