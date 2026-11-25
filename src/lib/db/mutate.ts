// Mutatielaag bovenop repo.ts die élke wijziging in de undo-stack zet.
//
// Waarom een aparte laag: repo.ts blijft de kale CRUD (nodig voor dingen die
// juist NIET ongedaan gemaakt moeten kunnen worden, zoals instellingen, import
// en de undo-uitvoering zelf). Alles wat de gebruiker in de editor doet, hoort
// via mCreate/mUpdate/mRemove/mBatch te lopen — dan werkt Ctrl+Z overal.

import { getDB } from "./db";
import { create, remove, update, type TableName } from "./repo";
import { useHistory, type HistoryAction } from "../history";
import type { Entity } from "../domain/types";

// Tijdens een mBatch verzamelen we acties hier i.p.v. ze los te pushen.
let batchBuffer: HistoryAction[] | null = null;

function record(action: HistoryAction) {
  if (batchBuffer) batchBuffer.push(action);
  else useHistory.getState().pushAction(action);
}

function tableRef(name: TableName) {
  return getDB()[name] as unknown as import("dexie").Table<Entity, string>;
}

// Aanmaken + vastleggen. Geeft de nieuwe entiteit terug.
export async function mCreate<T extends Entity>(
  name: TableName,
  data: Omit<T, "id" | "updatedAt"> & { id?: string },
): Promise<T> {
  const entity = await create<T>(name, data);
  record({ type: "create", table: name, id: entity.id });
  return entity;
}

// Bijwerken + vastleggen. Leest eerst de oude waarden van precies de velden
// die veranderen, zodat undo ze exact terugzet en redo ze opnieuw toepast.
export async function mUpdate(
  name: TableName,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = (await tableRef(name).get(id)) as Record<string, unknown> | undefined;
  if (!current) return;

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    // Ongewijzigde velden slaan we niet op — anders wordt een "no-op"-bewerking
    // toch een undo-stap.
    if (Object.is(current[key], patch[key])) continue;
    before[key] = current[key];
    after[key] = patch[key];
  }
  if (Object.keys(after).length === 0) return;

  await update(name, id, patch);
  record({ type: "update", table: name, id, before, after });
}

// Soft-delete + vastleggen, met snapshot zodat undo de entiteit terugzet.
export async function mRemove(name: TableName, id: string): Promise<void> {
  const snapshot = await tableRef(name).get(id);
  await remove(name, id);
  if (snapshot) record({ type: "remove", table: name, snapshot });
}

// Voer meerdere mutaties uit als één undo-stap. Nesten is toegestaan: de
// binnenste batch voegt zich bij de buitenste, zodat er nooit halve stappen
// op de stack belanden.
export async function mBatch<T>(fn: () => Promise<T>): Promise<T> {
  if (batchBuffer) return fn(); // al in een batch: gewoon meeliften

  const buffer: HistoryAction[] = [];
  batchBuffer = buffer;
  try {
    return await fn();
  } finally {
    batchBuffer = null;
    if (buffer.length === 1) useHistory.getState().pushAction(buffer[0]);
    else if (buffer.length > 1) {
      useHistory.getState().pushAction({ type: "batch", actions: buffer });
    }
  }
}

// Leg een reeds uitgevoerde create vast (voor helpers die zelf via repo.create
// schrijven, zoals pasteClipboard). Liever mCreate gebruiken waar dat kan.
export function recordCreate(name: TableName, id: string): void {
  record({ type: "create", table: name, id });
}
