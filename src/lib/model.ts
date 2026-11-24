// Volledig projectmodel in één snapshot (alle verdiepingen + alle elementen).
// Gebruikt door de "Model"-module: IFC-export, botsingscontrole en
// bouwfysica. Pure data, geen React — zo blijft het testbaar.

import type {
  Project,
  Level,
  Wall,
  Opening,
  Room,
  ElectricalItem,
  PlumbingItem,
  HvacItem,
  Furniture,
  Staircase,
  Column,
  Beam,
  Roof,
  Dormer,
  Phase,
} from "./domain/types";
import type { BouwDB } from "./db/db";

export interface LevelModel {
  level: Level;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  hvac: HvacItem[];
  furniture: Furniture[];
  stairs: Staircase[];
  columns: Column[];
  beams: Beam[];
  roofs: Roof[];
  dormers: Dormer[];
}

export interface ProjectModel {
  project: Project;
  levels: LevelModel[]; // gesorteerd op `order`
  phases: Phase[];
}

const alive = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

export async function loadProjectModel(db: BouwDB): Promise<ProjectModel | null> {
  const project = alive(await db.projects.toArray())[0];
  if (!project) return null;

  const [levels, walls, openings, rooms, electrical, plumbing, hvac, furniture, stairs, columns, beams, roofs, dormers, phases] =
    await Promise.all([
      db.levels.where("projectId").equals(project.id).toArray(),
      db.walls.toArray(),
      db.openings.toArray(),
      db.rooms.toArray(),
      db.electrical.toArray(),
      db.plumbing.toArray(),
      db.hvac.toArray(),
      db.furniture.toArray(),
      db.stairs.toArray(),
      db.columns.toArray(),
      db.beams.toArray(),
      db.roofs.toArray(),
      db.dormers.toArray(),
      db.phases.where("projectId").equals(project.id).toArray(),
    ]);

  return buildProjectModel(project, {
    levels: alive(levels),
    walls: alive(walls),
    openings: alive(openings),
    rooms: alive(rooms),
    electrical: alive(electrical),
    plumbing: alive(plumbing),
    hvac: alive(hvac),
    furniture: alive(furniture),
    stairs: alive(stairs),
    columns: alive(columns),
    beams: alive(beams),
    roofs: alive(roofs),
    dormers: alive(dormers),
    phases: alive(phases),
  });
}

export function buildProjectModel(
  project: Project,
  t: {
    levels: Level[];
    walls: Wall[];
    openings: Opening[];
    rooms: Room[];
    electrical: ElectricalItem[];
    plumbing: PlumbingItem[];
    hvac: HvacItem[];
    furniture: Furniture[];
    stairs: Staircase[];
    columns: Column[];
    beams: Beam[];
    roofs: Roof[];
    dormers: Dormer[];
    phases: Phase[];
  },
): ProjectModel {
  const byLevel = <T extends { levelId: string }>(rows: T[], id: string) =>
    rows.filter((r) => r.levelId === id);

  const levels = [...t.levels].sort((a, b) => a.order - b.order).map((level): LevelModel => {
    const walls = byLevel(t.walls, level.id);
    const wallIds = new Set(walls.map((w) => w.id));
    const roofs = byLevel(t.roofs, level.id);
    const roofIds = new Set(roofs.map((r) => r.id));
    return {
      level,
      walls,
      openings: t.openings.filter((o) => wallIds.has(o.wallId)),
      rooms: byLevel(t.rooms, level.id),
      electrical: byLevel(t.electrical, level.id),
      plumbing: byLevel(t.plumbing, level.id),
      hvac: byLevel(t.hvac, level.id),
      furniture: byLevel(t.furniture, level.id),
      stairs: byLevel(t.stairs, level.id),
      columns: byLevel(t.columns, level.id),
      beams: byLevel(t.beams, level.id),
      roofs,
      dormers: t.dormers.filter((d) => roofIds.has(d.roofId)),
    };
  });

  return {
    project,
    levels,
    phases: [...t.phases].sort((a, b) => a.order - b.order),
  };
}

// ── Entiteit terugvinden (voor "toon op plattegrond") ─────────────────────────

export type ModelEntityKind =
  | "wall"
  | "opening"
  | "room"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "furniture"
  | "staircase"
  | "column"
  | "beam"
  | "roof"
  | "level";

export function findEntity(model: ProjectModel, id: string): { kind: ModelEntityKind; levelId: string } | null {
  for (const lm of model.levels) {
    const levelId = lm.level.id;
    if (lm.level.id === id) return { kind: "level", levelId };
    const lists: [ModelEntityKind, { id: string }[]][] = [
      ["wall", lm.walls],
      ["opening", lm.openings],
      ["room", lm.rooms],
      ["electrical", lm.electrical],
      ["plumbing", lm.plumbing],
      ["hvac", lm.hvac],
      ["furniture", lm.furniture],
      ["staircase", lm.stairs],
      ["column", lm.columns],
      ["beam", lm.beams],
      ["roof", lm.roofs],
    ];
    for (const [kind, rows] of lists) if (rows.some((r) => r.id === id)) return { kind, levelId };
  }
  return null;
}
