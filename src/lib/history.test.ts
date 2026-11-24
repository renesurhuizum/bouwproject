// @vitest-environment jsdom
//
// Tests voor de undo/redo-stack en de mutatielaag.
//
// De belangrijkste regressie die hier bewaakt wordt: vóór deze laag registreerde
// de app alleen create/remove, waardoor Ctrl+Z ná een verplaatsing stilletjes een
// oudere aanmaak ongedaan maakte. Dat scenario staat expliciet in de tests.

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "./db/db";
import { create } from "./db/repo";
import { mBatch, mCreate, mRemove, mUpdate } from "./db/mutate";
import { useHistory } from "./history";
import type { Wall } from "./domain/types";

const baseWall = {
  levelId: "lvl",
  start: { x: 0, y: 0 },
  end: { x: 4, y: 0 },
  thickness: 0.1,
  height: 2.6,
  material: "brick" as const,
  loadBearing: false,
  status: "new" as const,
};

async function getWall(id: string) {
  return (await getDB().walls.get(id)) as Wall | undefined;
}

beforeEach(async () => {
  await resetDB();
  useHistory.getState().clear();
});

describe("mCreate", () => {
  it("maakt aan en draait terug met undo, redo herstelt", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    expect((await getWall(wall.id))?.deleted).toBeFalsy();

    await useHistory.getState().undo();
    expect((await getWall(wall.id))?.deleted).toBe(true);

    await useHistory.getState().redo();
    expect((await getWall(wall.id))?.deleted).toBe(false);
  });
});

describe("mUpdate", () => {
  it("zet bij undo de oude waarde terug en bij redo de nieuwe", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    await mUpdate("walls", wall.id, { end: { x: 9, y: 0 } });
    expect((await getWall(wall.id))?.end).toEqual({ x: 9, y: 0 });

    await useHistory.getState().undo();
    expect((await getWall(wall.id))?.end).toEqual({ x: 4, y: 0 });

    // Regressie: redo van een update was een gedocumenteerde no-op.
    await useHistory.getState().redo();
    expect((await getWall(wall.id))?.end).toEqual({ x: 9, y: 0 });
  });

  it("maakt ná een verplaatsing niet de aanmaak ongedaan", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    await mUpdate("walls", wall.id, { end: { x: 9, y: 0 } });

    await useHistory.getState().undo();

    const after = await getWall(wall.id);
    expect(after?.deleted).toBeFalsy(); // muur bestaat nog
    expect(after?.end).toEqual({ x: 4, y: 0 }); // alleen de verplaatsing is terug
  });

  it("legt alleen de daadwerkelijk gewijzigde velden vast", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    await mUpdate("walls", wall.id, { height: 2.8, thickness: 0.1 });

    const action = useHistory.getState().past.at(-1);
    expect(action).toMatchObject({ type: "update" });
    if (action?.type !== "update") throw new Error("verwachtte een update-actie");
    expect(Object.keys(action.after)).toEqual(["height"]);
    expect(action.before).toEqual({ height: 2.6 });
  });

  it("negeert een bewerking die niets verandert", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    const stackSize = useHistory.getState().past.length;

    await mUpdate("walls", wall.id, { height: 2.6 });

    expect(useHistory.getState().past.length).toBe(stackSize);
  });

  it("doet niets bij een onbekende id", async () => {
    await expect(mUpdate("walls", "bestaat-niet", { height: 3 })).resolves.toBeUndefined();
    expect(useHistory.getState().past).toHaveLength(0);
  });
});

describe("mRemove", () => {
  it("herstelt de entiteit met undo en verwijdert opnieuw met redo", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    await mRemove("walls", wall.id);
    expect((await getWall(wall.id))?.deleted).toBe(true);

    await useHistory.getState().undo();
    const restored = await getWall(wall.id);
    expect(restored?.deleted).toBe(false);
    expect(restored?.end).toEqual({ x: 4, y: 0 });

    await useHistory.getState().redo();
    expect((await getWall(wall.id))?.deleted).toBe(true);
  });
});

describe("mBatch", () => {
  it("maakt meerdere mutaties in één stap ongedaan", async () => {
    const a = await mCreate<Wall>("walls", baseWall);
    const b = await mCreate<Wall>("walls", { ...baseWall, start: { x: 0, y: 3 }, end: { x: 4, y: 3 } });
    useHistory.getState().clear();

    await mBatch(async () => {
      await mUpdate("walls", a.id, { height: 3 });
      await mUpdate("walls", b.id, { height: 3 });
    });
    expect(useHistory.getState().past).toHaveLength(1);

    await useHistory.getState().undo();
    expect((await getWall(a.id))?.height).toBe(2.6);
    expect((await getWall(b.id))?.height).toBe(2.6);

    await useHistory.getState().redo();
    expect((await getWall(a.id))?.height).toBe(3);
    expect((await getWall(b.id))?.height).toBe(3);
  });

  it("draait een batch in omgekeerde volgorde terug", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    useHistory.getState().clear();

    await mBatch(async () => {
      await mUpdate("walls", wall.id, { height: 3.0 });
      await mUpdate("walls", wall.id, { height: 3.5 });
    });

    await useHistory.getState().undo();
    expect((await getWall(wall.id))?.height).toBe(2.6);
  });

  it("zet geen lege batch op de stack", async () => {
    await mBatch(async () => {});
    expect(useHistory.getState().past).toHaveLength(0);
  });

  it("vlakt een enkele mutatie af tot een gewone stap", async () => {
    await mBatch(async () => {
      await mCreate<Wall>("walls", baseWall);
    });
    expect(useHistory.getState().past.at(-1)?.type).toBe("create");
  });

  it("voegt een geneste batch samen met de buitenste", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    useHistory.getState().clear();

    await mBatch(async () => {
      await mUpdate("walls", wall.id, { height: 3 });
      await mBatch(async () => {
        await mUpdate("walls", wall.id, { thickness: 0.2 });
      });
    });

    expect(useHistory.getState().past).toHaveLength(1);
    await useHistory.getState().undo();
    const after = await getWall(wall.id);
    expect(after?.height).toBe(2.6);
    expect(after?.thickness).toBe(0.1);
  });
});

describe("stack-gedrag", () => {
  it("wist de redo-tak zodra er een nieuwe actie volgt", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    await mUpdate("walls", wall.id, { height: 3 });
    await useHistory.getState().undo();
    expect(useHistory.getState().future).toHaveLength(1);

    await mUpdate("walls", wall.id, { thickness: 0.3 });
    expect(useHistory.getState().future).toHaveLength(0);
  });

  it("undo en redo doen niets bij een lege stack", async () => {
    await expect(useHistory.getState().undo()).resolves.toBeUndefined();
    await expect(useHistory.getState().redo()).resolves.toBeUndefined();
  });

  it("bewaart maximaal 50 stappen", async () => {
    const wall = await mCreate<Wall>("walls", baseWall);
    for (let i = 0; i < 60; i++) {
      await mUpdate("walls", wall.id, { height: 2 + i / 100 });
    }
    expect(useHistory.getState().past).toHaveLength(50);
  });

  it("negeert schrijfacties buiten de mutatielaag (repo.create)", async () => {
    await create<Wall>("walls", baseWall);
    expect(useHistory.getState().past).toHaveLength(0);
  });
});
