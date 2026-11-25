"use client";

// Spring vanuit een melding naar het betreffende element op de plattegrond:
// juiste verdieping activeren, element selecteren, naar /plattegrond.

import { useRouter } from "next/navigation";
import { useEditor, type Selection } from "@/lib/store/editor";
import { findEntity, type ProjectModel } from "@/lib/model";

const KIND_TO_SEL: Partial<Record<string, Selection["kind"]>> = {
  wall: "wall",
  opening: "opening",
  room: "room",
  electrical: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  furniture: "furniture",
  staircase: "staircase",
  column: "column",
  beam: "beam",
  roof: "roof",
};

export function useShowOnPlan(model: ProjectModel | null | undefined) {
  const router = useRouter();
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const select = useEditor((s) => s.select);

  return (ids: string[], levelId?: string) => {
    if (!model) return;
    let target: { kind: string; levelId: string } | null = null;
    for (const id of ids) {
      target = findEntity(model, id);
      if (target && KIND_TO_SEL[target.kind]) {
        setActiveLevel(target.levelId);
        select({ kind: KIND_TO_SEL[target.kind]!, id });
        router.push("/plattegrond");
        return;
      }
    }
    const lvl = target?.levelId ?? levelId;
    if (lvl) setActiveLevel(lvl);
    router.push("/plattegrond");
  };
}
