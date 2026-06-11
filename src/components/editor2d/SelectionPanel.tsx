"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Trash2, X } from "lucide-react";
import { getDB } from "@/lib/db/db";
import { create, update, remove } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { useProject, useFurniture } from "@/lib/hooks";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import type { Photo } from "@/lib/domain/types";
import { dist, polygonArea } from "@/lib/geometry";
import { formatLength, formatArea } from "@/lib/format";
import {
  WALL_MATERIAL_LABEL,
  WALL_STATUS_LABEL,
  WALL_STATUS_COLOR,
  ELECTRICAL_LABEL,
  ELECTRICAL_HEIGHT_PRESETS,
  OPENING_LABEL,
  OPENING_COLOR,
  FIXTURE_LABEL,
  HVAC_LABEL,
} from "@/lib/domain/constants";
import type { Wall, WallMaterial, WallStatus, OpeningType, FloorMaterial } from "@/lib/domain/types";
import { polygonArea as polyArea } from "@/lib/geometry";
import { nvoArea } from "@/lib/validation";

const STATUSES: WallStatus[] = ["new", "existing", "demolish"];
const MATERIALS = Object.keys(WALL_MATERIAL_LABEL) as WallMaterial[];
const OPENING_TYPES: OpeningType[] = ["door", "window", "passage"];

export function SelectionPanel() {
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const multiSelection = useEditor((s) => s.multiSelection);
  const setMultiSelection = useEditor((s) => s.setMultiSelection);
  const clipboard = useEditor((s) => s.clipboard);
  const setClipboard = useEditor((s) => s.setClipboard);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const project = useProject();
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const furnitureItems = useFurniture(activeLevelId) ?? [];
  const selectedFurniture = furnitureItems.find((f) => f.id === selection?.id) ?? null;
  const walls = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().walls.where("levelId").equals(activeLevelId).toArray()).filter((w) => !w.deleted);
    },
    [activeLevelId],
    [],
  );

  const photos = useLiveQuery(
    async () => {
      if (selection?.kind !== "room") return [];
      const rows = await getDB().photos.where("roomId").equals(selection.id).toArray();
      return rows.filter((p) => !p.deleted);
    },
    [selection?.kind, selection?.id],
    [] as Photo[],
  );

  async function addPhoto(file: File) {
    if (!project?.id || !selection?.id) return;
    await create<Photo>("photos", {
      projectId: project.id,
      roomId: selection.id,
      blob: file,
      caption: file.name,
    });
  }

  const wall = useLiveQuery(
    async () => (selection?.kind === "wall" ? await getDB().walls.get(selection.id) : null),
    [selection?.kind, selection?.id],
  );
  const elec = useLiveQuery(
    async () =>
      selection?.kind === "electrical" ? await getDB().electrical.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );
  // Alle elektra op de verdieping — voor het koppelen van schakelaar → lichtpunt.
  const allElec = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().electrical.where("levelId").equals(activeLevelId).toArray()).filter(
        (e) => !e.deleted,
      );
    },
    [activeLevelId],
    [],
  );
  const opening = useLiveQuery(
    async () =>
      selection?.kind === "opening" ? await getDB().openings.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );
  const room = useLiveQuery(
    async () => (selection?.kind === "room" ? await getDB().rooms.get(selection.id) : null),
    [selection?.kind, selection?.id],
  );
  const plumb = useLiveQuery(
    async () =>
      selection?.kind === "plumbing" ? await getDB().plumbing.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );
  const hvacItem = useLiveQuery(
    async () =>
      selection?.kind === "hvac" ? await getDB().hvac.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );

  const tool = useEditor((s) => s.tool);
  const isPlacementMode = tool === "place" || tool === "draw-pipe";
  const walls_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().walls.where("levelId").equals(activeLevelId).toArray()).filter((w) => !w.deleted);
    },
    [activeLevelId],
    [],
  );
  const electrical_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().electrical.where("levelId").equals(activeLevelId).toArray()).filter((e) => !e.deleted);
    },
    [activeLevelId],
    [],
  );
  const furniture_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().furniture.where("levelId").equals(activeLevelId).toArray()).filter((f) => !f.deleted);
    },
    [activeLevelId],
    [],
  );
  const plumbing_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().plumbing.where("levelId").equals(activeLevelId).toArray()).filter((p) => !p.deleted);
    },
    [activeLevelId],
    [],
  );
  const hvac_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().hvac.where("levelId").equals(activeLevelId).toArray()).filter((h) => !h.deleted);
    },
    [activeLevelId],
    [],
  );
  const rooms_sel = useLiveQuery(
    async () => {
      if (!activeLevelId) return [];
      return (await getDB().rooms.where("levelId").equals(activeLevelId).toArray()).filter((r) => !r.deleted);
    },
    [activeLevelId],
    [],
  );

  if (isPlacementMode) return null;

  // Multi-select panel
  if (multiSelection.length > 1) {
    const wallCount = multiSelection.filter((s) => s.kind === "wall").length;
    const roomCount = multiSelection.filter((s) => s.kind === "room").length;
    const otherCount = multiSelection.length - wallCount - roomCount;
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-[76px] z-10 px-3">
        <div className="mx-auto max-w-md rounded-xl border border-line bg-paper-raised/97 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">
              {multiSelection.length} items geselecteerd
              {wallCount > 0 ? ` · ${wallCount} muren` : ""}
              {roomCount > 0 ? ` · ${roomCount} ruimtes` : ""}
              {otherCount > 0 ? ` · ${otherCount} overig` : ""}
            </h2>
            <button
              onClick={() => setMultiSelection([])}
              className="rounded-lg p-1 text-ink-500 hover:bg-paper-sunken"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                import("@/lib/clipboard").then(({ buildClipboard }) => {
                  const allEnt = {
                    walls: walls_sel ?? [],
                    openings: [],
                    rooms: rooms_sel ?? [],
                    electrical: electrical_sel ?? [],
                    plumbing: plumbing_sel ?? [],
                    hvac: hvac_sel ?? [],
                    furniture: furniture_sel ?? [],
                  };
                  const clip = buildClipboard(multiSelection, allEnt);
                  setClipboard(clip);
                });
              }}
              className="rounded-md bg-paper-sunken px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-line"
            >
              Kopiëren
            </button>
            {wallCount > 0 && (
              <>
                {(["new", "existing", "demolish"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      for (const s of multiSelection) {
                        if (s.kind === "wall") void update("walls", s.id, { status: st });
                      }
                    }}
                    className="rounded-md bg-paper-sunken px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-line"
                  >
                    {st === "new" ? "Nieuw" : st === "existing" ? "Bestaand" : "Slopen"}
                  </button>
                ))}
              </>
            )}
            <button
              onClick={async () => {
                for (const s of multiSelection) {
                  const tbl = s.kind === "wall" ? "walls" : s.kind === "room" ? "rooms" : s.kind === "electrical" ? "electrical" : s.kind === "furniture" ? "furniture" : s.kind === "plumbing" ? "plumbing" : s.kind === "hvac" ? "hvac" : null;
                  if (tbl) await remove(tbl as Parameters<typeof remove>[0], s.id);
                }
                setMultiSelection([]);
              }}
              className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/20"
            >
              Verwijder alles
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selection) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[76px] z-10 px-3">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-paper-raised/97 p-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">
            {selection.kind === "wall"
              ? "Muur"
              : selection.kind === "opening"
                ? "Deur / raam"
                : selection.kind === "room"
                  ? "Ruimte"
                  : selection.kind === "plumbing"
                    ? "Water"
                    : selection.kind === "furniture"
                      ? (selectedFurniture ? FURNITURE_DEFAULTS[selectedFurniture.kind].label : "Meubel")
                      : selection.kind === "hvac"
                        ? "Verwarming"
                        : "Elektra"}
          </h2>
          <button
            onClick={() => select(null)}
            className="rounded-lg p-1 text-ink-500 hover:bg-paper-sunken"
            aria-label="Sluiten"
          >
            <X size={16} />
          </button>
        </div>

        {wall && (
          <div className="space-y-2.5">
            <Row label="Lengte">
              <WallLengthField wall={wall} />
            </Row>

            <Row label="Status">
              <div className="flex gap-1">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    onClick={() => update("walls", wall.id, { status: st })}
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: wall.status === st ? WALL_STATUS_COLOR[st] : "#ece8df",
                      color: wall.status === st ? "#fff" : "#44403c",
                    }}
                  >
                    {WALL_STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Materiaal">
              <select
                value={wall.material}
                onChange={(e) =>
                  update("walls", wall.id, { material: e.target.value as WallMaterial })
                }
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {WALL_MATERIAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Dikte">
              <NumberField
                value={Math.round(wall.thickness * 100)}
                unit="cm"
                onChange={(v) => update("walls", wall.id, { thickness: v / 100 })}
              />
            </Row>

            <Row label="Hoogte">
              <NumberField
                value={Math.round(wall.height * 100)}
                unit="cm"
                onChange={(v) => update("walls", wall.id, { height: v / 100 })}
              />
            </Row>

            <Row label="Dragend">
              <button
                onClick={() => update("walls", wall.id, { loadBearing: !wall.loadBearing })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  wall.loadBearing ? "bg-danger text-white" : "bg-paper-sunken text-ink-700"
                }`}
              >
                {wall.loadBearing ? "Ja" : "Nee"}
              </button>
            </Row>

            {wall.loadBearing && wall.status === "demolish" && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] leading-snug text-danger">
                <strong>Let op:</strong> dragende muur slopen vereist een constructeursberekening
                (staalbalk of portaal) en is vaak vergunningsplichtig. Check het Omgevingsloket
                vóór je begint.
              </div>
            )}

            <DeleteButton onClick={() => removeAnd("walls", wall.id, () => select(null))} />
          </div>
        )}

        {elec && (
          <div className="space-y-2.5">
            <Row label="Type">
              <span className="text-xs font-medium text-ink-900">
                {ELECTRICAL_LABEL[elec.type]}
              </span>
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round(elec.heightZ * 100)}
                unit="cm"
                onChange={(v) => update("electrical", elec.id, { heightZ: v / 100 })}
              />
            </Row>
            <div className="flex flex-wrap gap-1">
              {ELECTRICAL_HEIGHT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => update("electrical", elec.id, { heightZ: p.value })}
                  className="rounded-md bg-paper-sunken px-2 py-1 text-[10px] text-ink-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Row label="Groep">
              <input
                type="text"
                defaultValue={elec.group ?? ""}
                placeholder="bv. 3"
                onBlur={(e) => update("electrical", elec.id, { group: e.target.value })}
                className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              />
            </Row>

            {/* Schakelaar → lichtpunt koppelen */}
            {(elec.type === "switch" || elec.type === "data") && (
              <div>
                <span className="mb-1.5 block text-xs text-ink-500">
                  Bedient (tik om te koppelen)
                </span>
                <div className="flex flex-wrap gap-1">
                  {(allElec ?? [])
                    .filter((c) => ["light", "spot", "wall-light", "outdoor"].includes(c.type))
                    .map((c) => {
                      const linked = (elec.linkedIds ?? []).includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            const cur = elec.linkedIds ?? [];
                            const next = linked
                              ? cur.filter((x) => x !== c.id)
                              : [...cur, c.id];
                            void update("electrical", elec.id, { linkedIds: next });
                          }}
                          className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                            linked ? "bg-blueprint text-white" : "bg-paper-sunken text-ink-700"
                          }`}
                        >
                          {ELECTRICAL_LABEL[c.type]}
                          {c.group ? ` ·${c.group}` : ""}
                        </button>
                      );
                    })}
                  {(allElec ?? []).filter((c) =>
                    ["light", "spot", "wall-light", "outdoor"].includes(c.type),
                  ).length === 0 && (
                    <span className="text-[10px] text-ink-400">
                      Nog geen lichtpunten geplaatst.
                    </span>
                  )}
                </div>
              </div>
            )}

            <DeleteButton onClick={() => removeAnd("electrical", elec.id, () => select(null))} />
          </div>
        )}

        {opening && (
          <div className="space-y-2.5">
            <Row label="Type">
              <div className="flex gap-1">
                {OPENING_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => update("openings", opening.id, { type: t })}
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: opening.type === t ? OPENING_COLOR[t] : "#ece8df",
                      color: opening.type === t ? "#fff" : "#44403c",
                    }}
                  >
                    {OPENING_LABEL[t]}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Breedte">
              <NumberField
                value={Math.round(opening.width * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { width: v / 100 })}
              />
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round(opening.height * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { height: v / 100 })}
              />
            </Row>
            <Row label="Borsthoogte">
              <NumberField
                value={Math.round(opening.sillHeight * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { sillHeight: v / 100 })}
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("openings", opening.id, () => select(null))} />
          </div>
        )}

        {room && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span>Oppervlak (bruto)</span>
              <span className="tabular text-ink-900">{formatArea(polygonArea(room.polygon))}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span>NVO (NEN 2580)</span>
              <span className="tabular text-ink-900">{formatArea(nvoArea(room, walls ?? []))}</span>
            </div>
            <Row label="Naam">
              <input
                type="text"
                defaultValue={room.name}
                onBlur={(e) => update("rooms", room.id, { name: e.target.value })}
                className="w-40 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              />
            </Row>
            <Row label="Functie">
              <input
                type="text"
                defaultValue={room.func ?? ""}
                placeholder="bv. badkamer"
                onBlur={(e) => update("rooms", room.id, { func: e.target.value })}
                className="w-40 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900 placeholder:text-ink-300"
              />
            </Row>
            <Row label="Kleur (plan)">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={room.color ?? "#fef3c7"}
                  onChange={(e) => update("rooms", room.id, { color: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-paper p-0.5"
                />
                {room.color && (
                  <button
                    onClick={() => update("rooms", room.id, { color: undefined })}
                    className="text-[10px] text-ink-400 hover:text-ink-700"
                  >
                    Wis
                  </button>
                )}
              </div>
            </Row>
            <Row label="Wandkleur (3D)">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={room.wallColor ?? "#f5f0e8"}
                  onChange={(e) => update("rooms", room.id, { wallColor: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-paper p-0.5"
                />
                {room.wallColor && (
                  <button
                    onClick={() => update("rooms", room.id, { wallColor: undefined })}
                    className="text-[10px] text-ink-400 hover:text-ink-700"
                  >
                    Wis
                  </button>
                )}
              </div>
            </Row>
            <Row label="Vloer (3D)">
              <select
                value={room.floorMaterial ?? ""}
                onChange={(e) =>
                  update("rooms", room.id, {
                    floorMaterial: e.target.value ? (e.target.value as FloorMaterial) : undefined,
                  })
                }
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              >
                <option value="">Standaard</option>
                <option value="tile">Tegels</option>
                <option value="wood">Hout</option>
                <option value="carpet">Tapijt</option>
                <option value="stone">Steen</option>
                <option value="concrete">Beton</option>
              </select>
            </Row>
            <DeleteButton onClick={() => removeAnd("rooms", room.id, () => select(null))} />

            {/* Foto's sectie */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-ink-500">Foto&apos;s</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 rounded-md bg-paper-sunken px-2 py-1 text-[11px] text-ink-700 hover:bg-line"
                >
                  <Camera size={11} /> Toevoegen
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void addPhoto(file);
                  e.target.value = "";
                }}
              />
              {photos && photos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {photos.map((ph) => (
                    <PhotoThumb key={ph.id} photo={ph} onClick={() => setLightboxPhoto(ph)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hvacItem && (
          <div className="space-y-2.5">
            <Row label="Type">
              <span className="text-xs font-medium text-ink-900">{HVAC_LABEL[hvacItem.type]}</span>
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round((hvacItem.heightZ ?? 0) * 100)}
                unit="cm"
                onChange={(v) => update("hvac", hvacItem.id, { heightZ: v / 100 })}
              />
            </Row>
            <Row label="Notitie">
              <input
                type="text"
                defaultValue={hvacItem.note ?? ""}
                placeholder="bv. 1000W radiator"
                onBlur={(e) => update("hvac", hvacItem.id, { note: e.target.value })}
                className="w-40 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900 placeholder:text-ink-300"
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("hvac", hvacItem.id, () => select(null))} />
          </div>
        )}

        {lightboxPhoto && (
          <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
        )}

        {selection?.kind === "furniture" && selectedFurniture && (
          <div className="space-y-2.5">
            <Row label="Rotatie">
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {([0, 90, 180, 270] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => void update("furniture", selectedFurniture.id, { rotation: deg })}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        Math.round(selectedFurniture.rotation) === deg
                          ? "bg-accent text-white"
                          : "bg-paper-sunken text-ink-700"
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={Math.round(selectedFurniture.rotation)}
                  min={0}
                  max={359}
                  onChange={(e) => void update("furniture", selectedFurniture.id, { rotation: Number(e.target.value) % 360 })}
                  className="tabular w-16 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
                />
                <span className="text-[11px] text-ink-500">°</span>
              </div>
            </Row>
            <Row label="Kleur">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedFurniture.color ?? FURNITURE_DEFAULTS[selectedFurniture.kind].color}
                  onChange={(e) => void update("furniture", selectedFurniture.id, { color: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-paper p-0.5"
                />
                {selectedFurniture.color && (
                  <button
                    onClick={() => void update("furniture", selectedFurniture.id, { color: undefined })}
                    className="text-[10px] text-ink-400 hover:text-ink-700"
                  >
                    Wis
                  </button>
                )}
              </div>
            </Row>
            <DeleteButton
              onClick={() => void removeAnd("furniture", selectedFurniture.id, () => select(null))}
            />
          </div>
        )}

        {plumb && plumb.fixture && (
          <div className="space-y-2.5">
            <Row label="Type">
              <span className="text-xs font-medium text-ink-900">{FIXTURE_LABEL[plumb.fixture]}</span>
            </Row>
            <Row label="Aansluithoogte">
              <NumberField
                value={Math.round((plumb.heightZ ?? 0) * 100)}
                unit="cm"
                onChange={(v) => update("plumbing", plumb.id, { heightZ: v / 100 })}
              />
            </Row>
            <Row label="Notitie">
              <input
                type="text"
                defaultValue={plumb.note ?? ""}
                placeholder="bv. 40mm afvoer"
                onBlur={(e) => update("plumbing", plumb.id, { note: e.target.value })}
                className="w-40 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900 placeholder:text-ink-300"
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("plumbing", plumb.id, () => select(null))} />
          </div>
        )}

        {plumb && !plumb.fixture && plumb.path && (
          <div className="space-y-2.5">
            <Row label="Type">
              <span className="text-xs font-medium text-ink-900">
                {plumb.type === "supply-cold" ? "Koud water"
                  : plumb.type === "supply-hot" ? "Warm water"
                  : plumb.type === "drain" ? "Afvoer"
                  : plumb.type === "cv-pipe" ? "CV-leiding"
                  : plumb.type}
              </span>
            </Row>
            <Row label="Punten">
              <span className="text-xs text-ink-900">{plumb.path.length}</span>
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round((plumb.heightZ ?? 0) * 100)}
                unit="cm"
                onChange={(v) => update("plumbing", plumb.id, { heightZ: v / 100 })}
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("plumbing", plumb.id, () => select(null))} />
          </div>
        )}
      </div>
    </div>
  );
}

async function removeAnd(
  table: "walls" | "electrical" | "openings" | "rooms" | "plumbing" | "furniture" | "hvac",
  id: string,
  after: () => void,
) {
  await remove(table, id);
  after();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function NumberField({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular w-20 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
      />
      <span className="text-[11px] text-ink-500">{unit}</span>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger/10 py-2 text-xs font-medium text-danger"
    >
      <Trash2 size={14} /> Verwijderen
    </button>
  );
}

function WallLengthField({ wall }: { wall: Wall }) {
  const currentLenM = dist(wall.start, wall.end);
  const currentCm = Math.round(currentLenM * 100);

  function applyLength(cm: number) {
    if (cm < 1) return;
    const newLenM = cm / 100;
    const len = dist(wall.start, wall.end);
    if (len === 0) return;
    const dx = (wall.end.x - wall.start.x) / len;
    const dy = (wall.end.y - wall.start.y) / len;
    void update("walls", wall.id, {
      end: { x: wall.start.x + dx * newLenM, y: wall.start.y + dy * newLenM },
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        defaultValue={currentCm}
        key={currentCm}
        onBlur={(e) => applyLength(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyLength(Number((e.target as HTMLInputElement).value));
        }}
        className="tabular w-20 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
      />
      <span className="text-[11px] text-ink-500">cm</span>
    </div>
  );
}

function PhotoThumb({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  // Object-URL tijdens render aanmaken; cleanup via effect (geen setState-cascade).
  const src = useMemo(
    () => (photo.blob ? URL.createObjectURL(photo.blob) : null),
    [photo.blob],
  );
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  if (!src) return null;
  return (
    <button
      onClick={onClick}
      className="h-14 w-14 overflow-hidden rounded-lg border border-line bg-paper-sunken"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={photo.caption ?? ""} className="h-full w-full object-cover" />
    </button>
  );
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const src = useMemo(
    () => (photo.blob ? URL.createObjectURL(photo.blob) : null),
    [photo.blob],
  );
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={photo.caption ?? ""}
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        />
      )}
    </div>
  );
}
