// Botsingscontrole (clash detection) — de BIM-controle die op de bouwplaats
// de duurste fouten voorkomt: een afvoer die dwars door een stalen balk moet,
// een stopcontact in een kozijn, een balk zonder oplegging.
//
// Alles werkt in plan-coördinaten (m) + hoogte boven vloer (m). Pure functies.

import type { Beam, Column, ElectricalItem, Opening, Point, Wall } from "./domain/types";
import type { LevelModel, ProjectModel } from "./model";
import { BEAM_PROFILE_DIMS, FIXTURE_LABEL } from "./domain/constants";
import { dist, distToSegment, projectOnSegment } from "./geometry";

export type ClashCategory = "structuur" | "leidingen" | "elektra" | "kozijnen";

export interface Clash {
  severity: "error" | "warn" | "info";
  category: ClashCategory;
  message: string;
  levelId: string;
  levelName: string;
  entityIds: string[];
  at?: Point; // locatie op de plattegrond (voor "toon op plan")
}

// ── Geometrie-helpers ─────────────────────────────────────────────────────────

/** Snijpunt van twee segmenten (exclusief eindpunten-raken), of null. */
export function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null; // parallel
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function segments(path?: Point[]): [Point, Point][] {
  if (!path || path.length < 2) return [];
  const out: [Point, Point][] = [];
  for (let i = 0; i < path.length - 1; i++) out.push([path[i], path[i + 1]]);
  return out;
}

const fmtCm = (m: number) => `${Math.round(m * 100)} cm`;

// ── Leidingtrajecten verzamelen (water, afvoer, cv, ventilatie) ───────────────

interface Run {
  id: string;
  label: string;
  path: Point[];
  z?: number; // hoogte boven vloer (m), onbekend = undefined
  radius: number; // m (halve diameter)
  isDrain: boolean;
}

function collectRuns(lm: LevelModel): Run[] {
  const runs: Run[] = [];
  const label = {
    "supply-cold": "Koudwaterleiding",
    "supply-hot": "Warmwaterleiding",
    drain: "Afvoer",
    "cv-pipe": "CV-leiding",
  } as const;
  for (const p of lm.plumbing) {
    if (p.type === "fixture" || !p.path || p.path.length < 2) continue;
    const d = (p.diameter ?? (p.type === "drain" ? 50 : 16)) / 1000;
    runs.push({ id: p.id, label: label[p.type], path: p.path, z: p.heightZ, radius: d / 2, isDrain: p.type === "drain" });
  }
  for (const h of lm.hvac) {
    if (!h.path || h.path.length < 2) continue;
    const isDuct = h.type === "ventilation";
    runs.push({
      id: h.id,
      label: isDuct ? "Ventilatiekanaal" : h.type === "cv-pipe" ? "CV-leiding" : "Leiding",
      path: h.path,
      z: h.heightZ,
      radius: isDuct ? 0.0625 : 0.011,
      isDrain: false,
    });
  }
  return runs;
}

// ── Controles ─────────────────────────────────────────────────────────────────

function checkRunsVsStructure(lm: LevelModel, runs: Run[], push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  for (const run of runs) {
    for (const [a, b] of segments(run.path)) {
      // Kolommen: een leiding mag nooit door een kolom.
      for (const col of lm.columns) {
        const d = distToSegment(col.position, a, b);
        if (d < col.size / 2 + run.radius) {
          push({
            severity: "error",
            category: "leidingen",
            message: `${run.label} loopt door een kolom — verleg het traject (min. ${fmtCm(col.size / 2 + run.radius + 0.05)} uit hart kolom)`,
            entityIds: [run.id, col.id],
            at: col.position,
          });
        }
      }

      // Stalen balken: botsing in plan + overlappende hoogte.
      for (const beam of lm.beams) {
        const p = segmentIntersection(a, b, beam.start, beam.end);
        if (!p) continue;
        const h = BEAM_PROFILE_DIMS[beam.profile].h;
        if (run.z == null) {
          push({
            severity: "info",
            category: "leidingen",
            message: `${run.label} kruist stalen balk (${beam.profile}) in bovenaanzicht — geef de leiding een hoogte om te controleren of hij eronder/erboven past`,
            entityIds: [run.id, beam.id],
            at: p,
          });
          continue;
        }
        const gap = Math.abs(run.z - beam.height) - h / 2 - run.radius;
        if (gap < 0) {
          push({
            severity: "error",
            category: "leidingen",
            message: `${run.label} op ${fmtCm(run.z)} botst met stalen balk ${beam.profile} (op ${fmtCm(beam.height)}) — boren in een stalen ligger mag niet zonder constructeur`,
            entityIds: [run.id, beam.id],
            at: p,
          });
        } else if (gap < 0.03) {
          push({
            severity: "warn",
            category: "leidingen",
            message: `${run.label} passeert stalen balk met slechts ${Math.round(gap * 1000)} mm speling — reken op isolatie/beugels`,
            entityIds: [run.id, beam.id],
            at: p,
          });
        }
      }

      // Muren: doorvoer door dragende muur → sparing in overleg met constructeur.
      for (const wall of lm.walls) {
        if (wall.status === "demolish") continue;
        const p = segmentIntersection(a, b, wall.start, wall.end);
        if (!p) continue;
        // Raken aan het eind telt niet als doorvoer (leiding stopt bij de muur).
        if (dist(p, a) < 0.05 || dist(p, b) < 0.05) continue;
        if (run.z != null && run.z > wall.height) continue;
        // Gaat de leiding door een bestaande opening? Dan geen sparing nodig.
        const { t } = projectOnSegment(p, wall.start, wall.end);
        const along = t * dist(wall.start, wall.end);
        const throughOpening = lm.openings.some(
          (o) =>
            o.wallId === wall.id &&
            Math.abs(o.offset - along) < o.width / 2 &&
            (run.z == null || (run.z >= o.sillHeight && run.z <= o.sillHeight + o.height)),
        );
        if (throughOpening) {
          push({
            severity: "warn",
            category: "leidingen",
            message: `${run.label} loopt door een deur- of raamopening`,
            entityIds: [run.id, wall.id],
            at: p,
          });
          continue;
        }
        if (wall.loadBearing) {
          const sparing = Math.round((run.radius * 2 + 0.02) * 1000);
          push({
            severity: run.radius * 2 > 0.1 ? "warn" : "info",
            category: "leidingen",
            message: `${run.label} gaat door een dragende muur — sparing ±Ø${sparing} mm${run.radius * 2 > 0.1 ? "; bij grote sparingen constructeur laten toetsen" : ""}`,
            entityIds: [run.id, wall.id],
            at: p,
          });
        }
      }
    }
  }
}

function checkRunsVsRuns(runs: Run[], push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const A = runs[i];
      const B = runs[j];
      if (A.z == null || B.z == null) continue; // zonder hoogte: kruisen is normaal (over/onder)
      for (const [a, b] of segments(A.path)) {
        for (const [c, d] of segments(B.path)) {
          const p = segmentIntersection(a, b, c, d);
          if (!p) continue;
          if (Math.abs(A.z - B.z) < A.radius + B.radius) {
            push({
              severity: "error",
              category: "leidingen",
              message: `${A.label} en ${B.label} kruisen op dezelfde hoogte (${fmtCm(A.z)}) — één van beide moet over/onder`,
              entityIds: [A.id, B.id],
              at: p,
            });
          }
        }
      }
    }
  }
}

function checkDrains(lm: LevelModel, runs: Run[], push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  const drains = runs.filter((r) => r.isDrain);
  for (const fx of lm.plumbing) {
    if (fx.type !== "fixture" || !fx.position || !fx.fixture) continue;
    const near = drains.filter((d) => d.path.some((p) => dist(p, fx.position!) < 0.6));
    if (fx.fixture === "toilet") {
      for (const d of near) {
        if (d.radius * 2 < 0.09) {
          push({
            severity: "error",
            category: "leidingen",
            message: `Toilet aangesloten op afvoer Ø${Math.round(d.radius * 2000)} mm — een closetafvoer moet Ø90–110 mm zijn`,
            entityIds: [fx.id, d.id],
            at: fx.position,
          });
        }
      }
    }
    // Lange horizontale afvoer → afschot kost hoogte.
    for (const d of near) {
      let len = 0;
      for (const [a, b] of segments(d.path)) len += dist(a, b);
      const drop = len * 0.01; // min. 1 cm/m afschot
      if (len > 6) {
        push({
          severity: "info",
          category: "leidingen",
          message: `Afvoer van ${FIXTURE_LABEL[fx.fixture]} is ${len.toFixed(1)} m lang — met 1 cm/m afschot zakt hij ${fmtCm(drop)}; check of dit in vloer/kruipruimte past`,
          entityIds: [fx.id, d.id],
          at: fx.position,
        });
      }
    }
  }
}

function wallOf(item: ElectricalItem, walls: Wall[]): Wall | undefined {
  if (item.wallId) return walls.find((w) => w.id === item.wallId);
  let best: Wall | undefined;
  let bestD = Infinity;
  for (const w of walls) {
    const d = distToSegment(item.position, w.start, w.end);
    if (d < w.thickness / 2 + 0.06 && d < bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

const WALL_MOUNTED: ElectricalItem["type"][] = ["socket", "socket-double", "switch", "data", "perilex", "wall-light", "outdoor", "panel"];

function checkElectrical(lm: LevelModel, push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  const wetFixtures = lm.plumbing.filter(
    (p) => p.type === "fixture" && p.position && (p.fixture === "shower" || p.fixture === "bath"),
  );

  for (const it of lm.electrical) {
    const w = wallOf(it, lm.walls);
    if (w && WALL_MOUNTED.includes(it.type)) {
      if (w.status === "demolish") {
        push({
          severity: "warn",
          category: "elektra",
          message: `${labelOf(it)} zit op een muur die gesloopt wordt — verplaatsen of vervallen`,
          entityIds: [it.id, w.id],
          at: it.position,
        });
      }
      const { t } = projectOnSegment(it.position, w.start, w.end);
      const along = t * dist(w.start, w.end);
      for (const o of lm.openings) {
        if (o.wallId !== w.id) continue;
        const inX = Math.abs(along - o.offset) < o.width / 2 + 0.05;
        const inZ = it.heightZ >= o.sillHeight - 0.05 && it.heightZ <= o.sillHeight + o.height + 0.05;
        if (inX && inZ) {
          push({
            severity: "error",
            category: "kozijnen",
            message: `${labelOf(it)} op ${fmtCm(it.heightZ)} valt in een ${o.type === "door" ? "deur" : o.type === "window" ? "raam" : "doorgang"}opening`,
            entityIds: [it.id, o.id],
            at: it.position,
          });
        } else if (it.type === "switch" && o.type === "door" && !inX) {
          // Schakelaar handig naast de deur (krukzijde): ≤ 30 cm van de dagkant is ideaal.
          const fromEdge = Math.abs(along - o.offset) - o.width / 2;
          if (fromEdge >= 0 && fromEdge < 0.06) {
            push({
              severity: "warn",
              category: "kozijnen",
              message: `Schakelaar zit ${Math.round(fromEdge * 100)} cm naast de deuropening — de kozijnstijl/architraaf is ±7 cm; schuif hem iets op`,
              entityIds: [it.id, o.id],
              at: it.position,
            });
          }
        }
      }
    }

    // NEN 1010 badkamerzones: geen stopcontacten binnen 60 cm van bad/douche.
    if (it.type === "socket" || it.type === "socket-double" || it.type === "perilex") {
      for (const fx of wetFixtures) {
        const d = dist(it.position, fx.position!);
        if (d < 0.6 + 0.45) {
          push({
            severity: d < 0.6 ? "error" : "warn",
            category: "elektra",
            message: `${labelOf(it)} op ${Math.round(d * 100)} cm van ${FIXTURE_LABEL[fx.fixture!].toLowerCase()} — NEN 1010 zone 1/2: min. 60 cm vanaf de rand`,
            entityIds: [it.id, fx.id],
            at: it.position,
          });
        }
      }
    }
  }
}

function labelOf(it: ElectricalItem): string {
  const names: Record<ElectricalItem["type"], string> = {
    socket: "Stopcontact",
    "socket-double": "Dubbel stopcontact",
    switch: "Schakelaar",
    light: "Lichtpunt",
    spot: "Spot",
    "wall-light": "Wandlamp",
    data: "Datapunt",
    panel: "Meterkast",
    perilex: "Perilex",
    outdoor: "Buitenpunt",
  };
  return names[it.type] + (it.label ? ` "${it.label}"` : "");
}

function checkOpenings(lm: LevelModel, push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  const byWall = new Map<string, Opening[]>();
  for (const o of lm.openings) {
    const list = byWall.get(o.wallId) ?? [];
    list.push(o);
    byWall.set(o.wallId, list);
  }
  for (const [wallId, ops] of byWall) {
    const w = lm.walls.find((x) => x.id === wallId);
    if (!w) continue;
    const L = dist(w.start, w.end);
    const sorted = [...ops].sort((a, b) => a.offset - b.offset);
    const at = (o: Opening) => {
      const t = Math.max(0, Math.min(1, o.offset / L));
      return { x: w.start.x + (w.end.x - w.start.x) * t, y: w.start.y + (w.end.y - w.start.y) * t };
    };
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i];
      if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > L + 0.001) {
        push({ severity: "error", category: "kozijnen", message: `Opening (${fmtCm(o.width)} breed) steekt buiten de muur uit`, entityIds: [o.id, w.id], at: at(o) });
      }
      if (o.sillHeight + o.height > w.height + 0.001) {
        push({ severity: "error", category: "kozijnen", message: `Opening is hoger dan de muur (${fmtCm(o.sillHeight + o.height)} > ${fmtCm(w.height)})`, entityIds: [o.id, w.id], at: at(o) });
      }
      const next = sorted[i + 1];
      if (next) {
        const gap = next.offset - next.width / 2 - (o.offset + o.width / 2);
        if (gap < 0) {
          push({ severity: "error", category: "kozijnen", message: "Twee openingen in dezelfde muur overlappen elkaar", entityIds: [o.id, next.id], at: at(o) });
        } else if (gap < 0.2 && w.material !== "gypsum" && w.material !== "timber-frame") {
          push({
            severity: "warn",
            category: "kozijnen",
            message: `Slechts ${fmtCm(gap)} metselwerk tussen twee openingen — te smal voor een stabiel penant; overweeg één latei/kozijn`,
            entityIds: [o.id, next.id],
            at: at(o),
          });
        }
      }
      // Grote opening in dragende muur zonder balk erboven → latei nodig.
      if (w.loadBearing && w.status !== "demolish" && o.width > 1.0 && o.type !== "passage") {
        const p = at(o);
        const hasBeam = lm.beams.some((b) => distToSegment(p, b.start, b.end) < w.thickness + 0.1);
        if (!hasBeam) {
          push({
            severity: "info",
            category: "structuur",
            message: `Opening van ${fmtCm(o.width)} in dragende muur — vergeet de latei niet (staal of prefab beton, oplegging ≥ 10 cm per zijde)`,
            entityIds: [o.id, w.id],
            at: p,
          });
        }
      }
    }
  }
}

function supported(p: Point, lm: LevelModel, self: Beam): boolean {
  const wallSupport = lm.walls.some(
    (w) => w.status !== "demolish" && (w.loadBearing || w.material !== "gypsum") && distToSegment(p, w.start, w.end) < w.thickness / 2 + 0.15,
  );
  const colSupport = lm.columns.some((c: Column) => dist(p, c.position) < c.size / 2 + 0.15);
  const beamSupport = lm.beams.some((b) => b.id !== self.id && distToSegment(p, b.start, b.end) < 0.15);
  return wallSupport || colSupport || beamSupport;
}

function checkStructure(lm: LevelModel, push: (c: Omit<Clash, "levelId" | "levelName">) => void) {
  for (const b of lm.beams) {
    for (const [end, name] of [[b.start, "begin"], [b.end, "eind"]] as const) {
      if (!supported(end, lm, b)) {
        push({
          severity: "warn",
          category: "structuur",
          message: `Stalen balk ${b.profile} heeft aan het ${name} geen oplegging (muur, kolom of balk) — controleer met constructeur`,
          entityIds: [b.id],
          at: end,
        });
      }
    }
    // Vuistregel overspanning: h ≈ L/20 voor vloerbelasting.
    const L = dist(b.start, b.end);
    const h = BEAM_PROFILE_DIMS[b.profile].h;
    if (b.profile !== "custom" && L > h * 25) {
      push({
        severity: "warn",
        category: "structuur",
        message: `${b.profile} over ${L.toFixed(1)} m is fors (vuistregel h ≈ L/20 → ±${Math.round((L / 20) * 1000)} mm) — laat de constructeur het profiel bepalen`,
        entityIds: [b.id],
        at: { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 },
      });
    }
  }
  // Kolom op een te slopen muur.
  for (const c of lm.columns) {
    for (const w of lm.walls) {
      if (w.status === "demolish" && distToSegment(c.position, w.start, w.end) < w.thickness / 2 + c.size / 2) {
        push({
          severity: "warn",
          category: "structuur",
          message: "Kolom staat op/in een muur die gesloopt wordt — kolom moet vóór de sloop geplaatst en gefundeerd zijn",
          entityIds: [c.id, w.id],
          at: c.position,
        });
      }
    }
  }
}

/** Stapelt verdiepingen: dragende muren boven die nergens op rusten. */
function checkStacking(model: ProjectModel, push: (lm: LevelModel, c: Omit<Clash, "levelId" | "levelName">) => void) {
  for (let i = 1; i < model.levels.length; i++) {
    const below = model.levels[i - 1];
    const above = model.levels[i];
    for (const w of above.walls) {
      if (!w.loadBearing || w.status === "demolish") continue;
      const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
      const onWall = below.walls.some(
        (b) => b.status !== "demolish" && b.material !== "gypsum" && distToSegment(mid, b.start, b.end) < Math.max(b.thickness, w.thickness),
      );
      const onBeam = below.beams.some((b) => distToSegment(mid, b.start, b.end) < 0.2);
      if (!onWall && !onBeam) {
        push(above, {
          severity: "warn",
          category: "structuur",
          message: `Dragende muur op ${above.level.name} staat niet boven een muur of balk van ${below.level.name} — waar gaat de last naartoe?`,
          entityIds: [w.id],
          at: mid,
        });
      }
    }
    // Een dragende muur onder die gesloopt wordt terwijl erboven nog een dragende muur staat.
    for (const b of below.walls) {
      if (b.status !== "demolish" || !b.loadBearing) continue;
      const mid = { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 };
      const carries = above.walls.some((w) => w.status !== "demolish" && w.loadBearing && distToSegment(mid, w.start, w.end) < Math.max(b.thickness, w.thickness));
      const replaced = below.beams.some((bm) => distToSegment(mid, bm.start, bm.end) < 0.3);
      if (carries && !replaced) {
        push(below, {
          severity: "error",
          category: "structuur",
          message: `Te slopen dragende muur op ${below.level.name} draagt een muur op ${above.level.name} — teken eerst de vervangende stalen balk`,
          entityIds: [b.id],
          at: mid,
        });
      }
    }
  }
}

export function detectClashes(model: ProjectModel): Clash[] {
  const out: Clash[] = [];
  const pusher = (lm: LevelModel) => (c: Omit<Clash, "levelId" | "levelName">) =>
    out.push({ ...c, levelId: lm.level.id, levelName: lm.level.name });

  for (const lm of model.levels) {
    const push = pusher(lm);
    const runs = collectRuns(lm);
    checkRunsVsStructure(lm, runs, push);
    checkRunsVsRuns(runs, push);
    checkDrains(lm, runs, push);
    checkElectrical(lm, push);
    checkOpenings(lm, push);
    checkStructure(lm, push);
  }
  checkStacking(model, (lm, c) => pusher(lm)(c));

  // Dubbele meldingen (zelfde elementen + tekst) samenvoegen.
  const seen = new Set<string>();
  const order = { error: 0, warn: 1, info: 2 } as const;
  return out
    .filter((c) => {
      const k = c.message + "|" + [...c.entityIds].sort().join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Alleen de botsingen van één verdieping (voor de banner in de editor). */
export function detectLevelClashes(model: ProjectModel, levelId: string): Clash[] {
  return detectClashes(model).filter((c) => c.levelId === levelId);
}
