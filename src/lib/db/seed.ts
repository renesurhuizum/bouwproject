// Zorgt dat er een actief project met standaard verdiepingen en de NL-fasering is.

import { getDB } from "./db";
import { create } from "./repo";
import { DEFAULT_LEVELS, DEFAULT_PHASES } from "../domain/constants";
import type { Level, Phase, Project } from "../domain/types";

// Maakt het eerste project + verdiepingen + fasering aan als de db leeg is.
// Geeft het actieve project-id terug.
export async function ensureSeed(): Promise<Project> {
  const db = getDB();
  const existing = await db.projects
    .filter((p) => !p.deleted)
    .first();
  if (existing) return existing;

  const project = await create<Project>("projects", {
    name: "Woonboerderij",
    description: "Complete renovatie van een oude woonboerderij.",
  });

  // Verdiepingen
  for (const lvl of DEFAULT_LEVELS) {
    await create<Level>("levels", {
      projectId: project.id,
      name: lvl.name,
      elevation: lvl.elevation,
      height: lvl.height,
      order: lvl.order,
    });
  }

  // Fasering met afhankelijkheden. Eerst aanmaken, daarna dependsOn koppelen
  // op basis van order → id.
  const orderToId = new Map<number, string>();
  for (const tpl of DEFAULT_PHASES) {
    const phase = await create<Phase>("phases", {
      projectId: project.id,
      name: tpl.name,
      order: tpl.order,
      status: "todo",
      dependsOn: [],
      color: tpl.color,
      note: tpl.note,
    });
    orderToId.set(tpl.order, phase.id);
  }
  for (const tpl of DEFAULT_PHASES) {
    const id = orderToId.get(tpl.order)!;
    const dependsOn = tpl.dependsOnOrders
      .map((o) => orderToId.get(o))
      .filter((x): x is string => Boolean(x));
    if (dependsOn.length > 0) {
      await db.phases.update(id, { dependsOn, updatedAt: Date.now() });
    }
  }

  return project;
}
