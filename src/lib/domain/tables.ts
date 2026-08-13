// Welke Dexie-tabel hoort bij welk selectie-soort. Stond eerder gedupliceerd in
// PlanEditor en SelectionPanel; de sleep-laag heeft hem ook nodig.

import type { TableName } from "../db/repo";
import type { SelKind } from "../store/editor";

export const TABLE_FOR_KIND: Record<SelKind, TableName> = {
  wall: "walls",
  opening: "openings",
  room: "rooms",
  electrical: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  furniture: "furniture",
  staircase: "stairs",
  column: "columns",
  beam: "beams",
  roof: "roofs",
  dormer: "dormers",
  section: "sections",
};
