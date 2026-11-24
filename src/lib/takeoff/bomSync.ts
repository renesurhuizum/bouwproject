// Synchroniseert de berekende hoeveelheden met de materiaallijst.
//
// De oude overzet matchte op naam en maakte altijd nieuwe regels aan: na een
// hertekening stonden er dubbele posten, en aangepaste aantallen liepen achter.
// Deze sync matcht op sourceId en is idempotent — twee keer draaien verandert
// niets.
//
// Regels die de gebruiker zelf heeft aangepast of al besteld heeft, worden nooit
// overschreven: die beslissing is van de gebruiker, niet van de berekening.

import { mBatch, mCreate, mUpdate, mRemove } from "../db/mutate";
import type { MaterialItem } from "../domain/types";
import type { TakeoffLine } from "./engine";

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

export async function syncTakeoffToBom(
  projectId: string,
  lines: TakeoffLine[],
  existing: MaterialItem[],
  phaseIdByOrder?: Map<number, string>,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, removed: 0, skipped: 0 };
  const bySourceId = new Map(
    existing.filter((m) => m.sourceId).map((m) => [m.sourceId!, m]),
  );
  const seen = new Set<string>();

  await mBatch(async () => {
    for (const line of lines) {
      seen.add(line.sourceId);
      const current = bySourceId.get(line.sourceId);

      if (!current) {
        await mCreate<MaterialItem>("materials", {
          projectId,
          name: line.name,
          quantity: line.buyQty,
          unit: line.unit,
          unitPrice: line.unitPrice,
          status: "needed",
          sourceId: line.sourceId,
          articleKey: line.articleKey,
          packName: line.packName,
          phaseId: line.phaseOrder ? phaseIdByOrder?.get(line.phaseOrder) : undefined,
        });
        result.created += 1;
        continue;
      }

      // Al besteld of geleverd, of handmatig aangepast: niet aanraken.
      if (current.status !== "needed" || current.quantityOverridden) {
        result.skipped += 1;
        continue;
      }

      if (current.quantity !== line.buyQty || current.name !== line.name) {
        await mUpdate("materials", current.id, {
          name: line.name,
          quantity: line.buyQty,
          unit: line.unit,
          unitPrice: current.unitPrice ?? line.unitPrice,
          packName: line.packName,
        });
        result.updated += 1;
      }
    }

    // Regels die uit het plan verdwenen zijn en nog niet besteld: opruimen.
    for (const [sourceId, item] of bySourceId) {
      if (seen.has(sourceId)) continue;
      if (item.status !== "needed" || item.quantityOverridden) {
        result.skipped += 1;
        continue;
      }
      await mRemove("materials", item.id);
      result.removed += 1;
    }
  });

  return result;
}
