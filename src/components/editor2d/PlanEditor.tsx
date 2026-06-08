"use client";

// Hart van de app: de 2D plattegrond-editor.
// - Touch: 1 vinger pannen (select) of tekenen (wall/place); 2 vingers pinch-zoom + pan.
// - Muis: slepen pant (select), scrollwiel zoomt.
// - Muren tekenen met snapping op raster en bestaande eindpunten.

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Label, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  Point,
  Wall,
  ElectricalItem,
  PlumbingItem,
  Opening,
  Room,
} from "@/lib/domain/types";
import { create, remove, update } from "@/lib/db/repo";
import { useEditor, type SelKind } from "@/lib/store/editor";
import { useWalls, useRooms, useElectrical, useOpenings, usePlumbing } from "@/lib/hooks";
import {
  ELECTRICAL_DEFAULT_HEIGHT,
  FIXTURE_DEFAULT_HEIGHT,
  OPENING_DEFAULTS,
  OPENING_SNAP_M,
} from "@/lib/domain/constants";
import { dist, snapToGrid, snapToPoints, projectOnSegment } from "@/lib/geometry";
import { GRID_SNAP_M } from "@/lib/store/editor";
import { formatLength } from "@/lib/format";
import {
  screenToMeters,
  metersToScreen,
  zoomAround,
  pxToMeters,
  SNAP_RADIUS_PX,
  type ViewState,
} from "./viewport";
import { GridLayer } from "./GridLayer";
import { WallsLayer } from "./WallsLayer";
import { OpeningsLayer } from "./OpeningsLayer";
import { RoomsLayer } from "./RoomsLayer";
import { ElectricalLayer } from "./ElectricalLayer";
import { PlumbingLayer } from "./PlumbingLayer";
import { RoomDivider } from "./RoomDivider";
import type { LayoutRect } from "@/lib/roomDivider";

export function PlanEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ x: 60, y: 90, scale: 1 });

  const tool = useEditor((s) => s.tool);
  const placeKind = useEditor((s) => s.placeKind);
  const wallDefaults = useEditor((s) => s.wallDefaults);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const showGrid = useEditor((s) => s.showGrid);
  const gridSnap = useEditor((s) => s.gridSnap);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);

  const walls = useWalls(activeLevelId) ?? [];
  const rooms = useRooms(activeLevelId) ?? [];
  const electrical = useElectrical(activeLevelId) ?? [];
  const plumbing = usePlumbing(activeLevelId) ?? [];
  const openings = useOpenings(activeLevelId) ?? [];

  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [roomDraft, setRoomDraft] = useState<Point[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: SelKind; id: string } | null>(null);
  const [divideRect, setDivideRect] = useState<LayoutRect | null>(null);
  const divideStartRef = useRef<Point | null>(null);

  // Gebaar-refs.
  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef<{ lastDist?: number; lastCenter?: Point }>({});
  const panPointer = useRef<{ id: number; last: Point } | null>(null);
  const tapRef = useRef<
    { id: number; start: Point; time: number; moved: boolean; onStage: boolean } | null
  >(null);

  // Containergrootte volgen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tool wisselt → tekening afbreken.
  useEffect(() => {
    setDraftStart(null);
    setRoomDraft([]);
    setMenu(null);
    if (tool !== "divide") {
      setDivideRect(null);
      divideStartRef.current = null;
    }
  }, [tool, activeLevelId]);

  // Sneltoetsen: Delete = selectie weg, Escape = annuleren/deselecteren.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection) {
          e.preventDefault();
          void deleteEntity(selection.kind, selection.id);
        }
      } else if (e.key === "Escape") {
        setDraftStart(null);
        setRoomDraft([]);
        setMenu(null);
        select(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const TABLE_FOR: Record<SelKind, "walls" | "openings" | "electrical" | "rooms" | "plumbing" | "hvac"> = {
    wall: "walls",
    opening: "openings",
    electrical: "electrical",
    room: "rooms",
    plumbing: "plumbing",
    hvac: "hvac",
  };

  async function deleteEntity(kind: SelKind, id: string) {
    await remove(TABLE_FOR[kind], id);
    setMenu(null);
    if (selection?.id === id) select(null);
  }

  const endpoints = useMemo<Point[]>(
    () => walls.flatMap((w) => [w.start, w.end]),
    [walls],
  );

  function posFromEvent(evt: PointerEvent | WheelEvent, stage: { container(): HTMLElement }): Point {
    const rect = stage.container().getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function snapPoint(m: Point): Point {
    const near = snapToPoints(m, endpoints, pxToMeters(SNAP_RADIUS_PX, view));
    return near ?? snapToGrid(m, GRID_SNAP_M[gridSnap]);
  }

  async function handleMoveEndpoint(wallId: string, which: "start" | "end", screenX: number, screenY: number) {
    const worldM = screenToMeters({ x: screenX, y: screenY }, view);
    const snapped = snapPoint(worldM);
    await update("walls", wallId, { [which]: snapped });
  }

  async function createWall(start: Point, end: Point) {
    if (!activeLevelId) return;
    if (dist(start, end) < 0.01) return;
    await create<Wall>("walls", {
      levelId: activeLevelId,
      start,
      end,
      thickness: wallDefaults.thickness,
      height: wallDefaults.height,
      material: wallDefaults.material,
      loadBearing: wallDefaults.loadBearing,
      status: wallDefaults.status,
    });
  }

  async function placeElectrical(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "electrical") return;
    const item = await create<ElectricalItem>("electrical", {
      levelId: activeLevelId,
      type: placeKind.type,
      position: at,
      heightZ: ELECTRICAL_DEFAULT_HEIGHT[placeKind.type],
    });
    select({ kind: "electrical", id: item.id });
  }

  async function placePlumbing(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "plumbing") return;
    const item = await create<PlumbingItem>("plumbing", {
      levelId: activeLevelId,
      type: "fixture",
      fixture: placeKind.fixture,
      position: at,
      heightZ: FIXTURE_DEFAULT_HEIGHT[placeKind.fixture],
    });
    select({ kind: "plumbing", id: item.id });
  }

  // Plaats een deur/raam op de dichtstbijzijnde muur (binnen tolerantie).
  async function placeOpening(at: Point) {
    if (!placeKind || placeKind.domain !== "opening") return;
    let best: { wall: Wall; t: number; d: number } | null = null;
    for (const w of walls) {
      const { t, dist: d } = projectOnSegment(at, w.start, w.end);
      if (!best || d < best.d) best = { wall: w, t, d };
    }
    if (!best || best.d > OPENING_SNAP_M) return; // niet op een muur getikt
    const len = dist(best.wall.start, best.wall.end);
    const def = OPENING_DEFAULTS[placeKind.type];
    // Houd de opening binnen de muur.
    const half = def.width / 2;
    const offset = Math.min(Math.max(best.t * len, half), Math.max(half, len - half));
    const op = await create<Opening>("openings", {
      wallId: best.wall.id,
      type: placeKind.type,
      width: def.width,
      height: def.height,
      sillHeight: def.sillHeight,
      offset,
    });
    select({ kind: "opening", id: op.id });
  }

  async function finalizeRoom(points: Point[]) {
    if (!activeLevelId || points.length < 3) return;
    const room = await create<Room>("rooms", {
      levelId: activeLevelId,
      name: `Ruimte ${rooms.length + 1}`,
      polygon: points,
    });
    setRoomDraft([]);
    select({ kind: "room", id: room.id });
  }

  function handleTap(screenPos: Point, onStage: boolean) {
    const worldM = screenToMeters(screenPos, view);
    const snapped = snapPoint(worldM);

    if (tool === "wall") {
      if (!draftStart) {
        setDraftStart(snapped);
      } else {
        void createWall(draftStart, snapped);
        setDraftStart(snapped); // doortekenen
      }
      return;
    }
    if (tool === "room") {
      // Tik dicht bij het beginpunt (en ≥3 punten) = ruimte sluiten.
      if (
        roomDraft.length >= 3 &&
        dist(snapped, roomDraft[0]) < pxToMeters(SNAP_RADIUS_PX * 1.6, view)
      ) {
        void finalizeRoom(roomDraft);
      } else {
        setRoomDraft((d) => [...d, snapped]);
      }
      return;
    }
    if (tool === "place") {
      if (placeKind?.domain === "opening") void placeOpening(worldM);
      else if (placeKind?.domain === "plumbing") void placePlumbing(snapped);
      else void placeElectrical(snapped);
      return;
    }
    // select: tik op leeg vlak = deselecteren
    if (tool === "select" && onStage) {
      select(null);
    }
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  function onPointerDown(e: KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const evt = e.evt;
    if (evt.button === 2) return; // rechtermuisknop = contextmenu, geen tekenen
    setMenu(null);
    const pos = posFromEvent(evt, stage);
    pointers.current.set(evt.pointerId, pos);

    if (pointers.current.size === 1) {
      tapRef.current = {
        id: evt.pointerId,
        start: pos,
        time: Date.now(),
        moved: false,
        onStage: e.target === stage,
      };
      if (tool === "select") panPointer.current = { id: evt.pointerId, last: pos };
      if (tool === "divide") {
        divideStartRef.current = screenToMeters(pos, view);
        setCursor(screenToMeters(pos, view));
      }
    } else {
      // tweede vinger: geen tap, geen 1-vinger-pan
      tapRef.current = null;
      panPointer.current = null;
      gesture.current = {};
    }
  }

  function onPointerMove(e: KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const evt = e.evt;
    if (!pointers.current.has(evt.pointerId)) {
      // cursor voor rubber-band tonen ook zonder ingedrukt
      if (tool === "wall" || tool === "place" || tool === "room") {
        setCursor(snapPoint(screenToMeters(posFromEvent(evt, stage), view)));
      }
      return;
    }
    const pos = posFromEvent(evt, stage);
    pointers.current.set(evt.pointerId, pos);

    if (pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = dist(p1, p2);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      setView((v) => {
        let next = v;
        if (gesture.current.lastDist) {
          next = zoomAround(next, center, d / gesture.current.lastDist);
        }
        if (gesture.current.lastCenter) {
          next = {
            ...next,
            x: next.x + (center.x - gesture.current.lastCenter.x),
            y: next.y + (center.y - gesture.current.lastCenter.y),
          };
        }
        return next;
      });
      gesture.current.lastDist = d;
      gesture.current.lastCenter = center;
      if (tapRef.current) tapRef.current.moved = true;
      return;
    }

    if (tapRef.current && evt.pointerId === tapRef.current.id) {
      if (dist(pos, tapRef.current.start) > 8) tapRef.current.moved = true;
    }
    if (tool === "wall" || tool === "place" || tool === "room") {
      setCursor(snapPoint(screenToMeters(pos, view)));
    }
    if (tool === "divide") {
      setCursor(screenToMeters(pos, view));
      if (tapRef.current) tapRef.current.moved = true;
    }
    if (panPointer.current && evt.pointerId === panPointer.current.id && tool === "select") {
      const dx = pos.x - panPointer.current.last.x;
      const dy = pos.y - panPointer.current.last.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      panPointer.current.last = pos;
    }
  }

  function onPointerUp(e: KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const evt = e.evt;
    const pos = posFromEvent(evt, stage);
    const t = tapRef.current;
    const wasTap =
      !!t &&
      evt.pointerId === t.id &&
      !t.moved &&
      Date.now() - t.time < 500 &&
      pointers.current.size === 1;

    pointers.current.delete(evt.pointerId);
    if (pointers.current.size < 2) gesture.current = {};
    if (panPointer.current && evt.pointerId === panPointer.current.id) {
      panPointer.current = null;
    }
    if (wasTap) handleTap(pos, t!.onStage);
    // Divide-rechthoek afronden bij loslaten.
    if (tool === "divide" && divideStartRef.current) {
      const endM = screenToMeters(pos, view);
      const s = divideStartRef.current;
      if (Math.abs(endM.x - s.x) > 0.5 && Math.abs(endM.y - s.y) > 0.5) {
        setDivideRect({
          x0: Math.min(s.x, endM.x),
          y0: Math.min(s.y, endM.y),
          x1: Math.max(s.x, endM.x),
          y1: Math.max(s.y, endM.y),
        });
      }
      divideStartRef.current = null;
    }
    tapRef.current = null;
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    e.evt.preventDefault();
    const pos = posFromEvent(e.evt, stage);
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => zoomAround(v, pos, factor));
  }

  // Rechtermuisknop op een item → selecteren + contextmenu.
  function onContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const node = e.target;
    const id = node.id();
    const name = node.name();
    if (id && name) {
      const rect = stage.container().getBoundingClientRect();
      const pos = { x: e.evt.clientX - rect.left, y: e.evt.clientY - rect.top };
      select({ kind: name as SelKind, id });
      setMenu({ x: pos.x, y: pos.y, kind: name as SelKind, id });
    } else {
      setMenu(null);
    }
  }

  function onSelectEntity(
    kind: "wall" | "room" | "electrical" | "opening" | "plumbing",
    id: string,
  ) {
    if (tool !== "select") return; // bij tekenen niet selecteren
    select({ kind, id });
  }

  // Draft (rubber-band) lengte.
  const draftLen = draftStart && cursor ? dist(draftStart, cursor) : 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ touchAction: "none", cursor: tool === "select" ? "grab" : "crosshair" }}
    >
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        >
          {showGrid && <GridLayer view={view} width={size.width} height={size.height} />}

          {visibleLayers.rooms && (
            <RoomsLayer
              view={view}
              rooms={rooms}
              selectedId={selection?.kind === "room" ? selection.id : null}
              onSelect={(id) => onSelectEntity("room", id)}
            />
          )}

          {visibleLayers.structure && (
            <WallsLayer
              view={view}
              walls={walls}
              selectedId={selection?.kind === "wall" ? selection.id : null}
              onSelect={(id) => onSelectEntity("wall", id)}
              onMoveEndpoint={handleMoveEndpoint}
            />
          )}

          {visibleLayers.structure && (
            <OpeningsLayer
              view={view}
              walls={walls}
              openings={openings}
              selectedId={selection?.kind === "opening" ? selection.id : null}
              onSelect={(id) => onSelectEntity("opening", id)}
            />
          )}

          {visibleLayers.electrical && (
            <ElectricalLayer
              view={view}
              items={electrical}
              selectedId={selection?.kind === "electrical" ? selection.id : null}
              onSelect={(id) => onSelectEntity("electrical", id)}
            />
          )}

          {visibleLayers.plumbing && (
            <PlumbingLayer
              view={view}
              items={plumbing}
              selectedId={selection?.kind === "plumbing" ? selection.id : null}
              onSelect={(id) => onSelectEntity("plumbing", id)}
            />
          )}

          {/* Draft / cursor */}
          <Layer listening={false}>
            {tool === "wall" && draftStart && cursor && (
              <>
                <Line
                  points={[
                    ...Object.values(metersToScreen(draftStart, view)),
                    ...Object.values(metersToScreen(cursor, view)),
                  ]}
                  stroke="#ea580c"
                  strokeWidth={2}
                  dash={[8, 6]}
                />
                <Label
                  x={metersToScreen(cursor, view).x + 10}
                  y={metersToScreen(cursor, view).y - 22}
                >
                  <Tag fill="#1c1917" cornerRadius={4} />
                  <Text
                    text={formatLength(draftLen)}
                    fontSize={12}
                    fontFamily="monospace"
                    fill="#fff"
                    padding={4}
                  />
                </Label>
              </>
            )}
            {(tool === "wall" || tool === "place" || tool === "room") && cursor && (
              <Circle
                x={metersToScreen(cursor, view).x}
                y={metersToScreen(cursor, view).y}
                radius={6}
                stroke="#ea580c"
                strokeWidth={2}
                fill="rgba(234,88,12,0.2)"
              />
            )}
            {tool === "wall" && draftStart && (
              <Circle
                x={metersToScreen(draftStart, view).x}
                y={metersToScreen(draftStart, view).y}
                radius={5}
                fill="#ea580c"
              />
            )}

            {/* Divide-rechthoek preview */}
            {tool === "divide" && divideStartRef.current && cursor && (() => {
              const s = metersToScreen(divideStartRef.current, view);
              const e = metersToScreen(cursor, view);
              return (
                <Line
                  points={[s.x, s.y, e.x, s.y, e.x, e.y, s.x, e.y, s.x, s.y]}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dash={[8, 5]}
                  fill="rgba(124,58,237,0.08)"
                  closed
                  listening={false}
                />
              );
            })()}
            {/* Bevestigde divide-rechthoek */}
            {tool === "divide" && divideRect && (() => {
              const a = metersToScreen({ x: divideRect.x0, y: divideRect.y0 }, view);
              const b = metersToScreen({ x: divideRect.x1, y: divideRect.y1 }, view);
              return (
                <Line
                  points={[a.x, a.y, b.x, a.y, b.x, b.y, a.x, b.y]}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="rgba(124,58,237,0.06)"
                  closed
                  listening={false}
                />
              );
            })()}

            {/* Ruimte in opbouw */}
            {tool === "room" && roomDraft.length > 0 && (
              <>
                <Line
                  points={[...roomDraft, ...(cursor ? [cursor] : [])].flatMap((p) => {
                    const s = metersToScreen(p, view);
                    return [s.x, s.y];
                  })}
                  stroke="#ea580c"
                  strokeWidth={2}
                  closed={roomDraft.length >= 2}
                  fill="rgba(234,88,12,0.08)"
                />
                {roomDraft.map((p, i) => {
                  const s = metersToScreen(p, view);
                  return (
                    <Circle
                      key={i}
                      x={s.x}
                      y={s.y}
                      radius={i === 0 ? 6 : 4}
                      fill={i === 0 ? "#ea580c" : "#fff"}
                      stroke="#ea580c"
                      strokeWidth={2}
                    />
                  );
                })}
              </>
            )}
          </Layer>
        </Stage>
      )}

      {/* Ruimte-tekenhulp */}
      {tool === "room" && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line bg-paper-raised/95 px-2 py-1.5 shadow-lg backdrop-blur">
            <span className="px-1 text-[11px] text-ink-500">
              {roomDraft.length === 0
                ? "Tik de hoekpunten"
                : `${roomDraft.length} ${roomDraft.length === 1 ? "punt" : "punten"}`}
            </span>
            <button
              onClick={() => setRoomDraft((d) => d.slice(0, -1))}
              disabled={roomDraft.length === 0}
              className="rounded-lg bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-700 disabled:opacity-40"
            >
              Wis punt
            </button>
            <button
              onClick={() => setRoomDraft([])}
              disabled={roomDraft.length === 0}
              className="rounded-lg bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-700 disabled:opacity-40"
            >
              Annuleer
            </button>
            <button
              onClick={() => void finalizeRoom(roomDraft)}
              disabled={roomDraft.length < 3}
              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      <RoomDivider divideRect={divideRect} onClear={() => setDivideRect(null)} />

      {/* Contextmenu (rechtermuisknop) */}
      {menu && (
        <div
          className="absolute z-30 w-44 overflow-hidden rounded-xl border border-line bg-paper-raised shadow-xl"
          style={{
            left: Math.min(menu.x, (size.width || 0) - 184),
            top: Math.min(menu.y, (size.height || 0) - 160),
          }}
        >
          {menu.kind === "wall" && (
            <div className="flex gap-1 border-b border-line p-1.5">
              {(
                [
                  ["new", "Nieuw"],
                  ["existing", "Bestaand"],
                  ["demolish", "Slopen"],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  onClick={() => {
                    void update("walls", menu.id, { status: st });
                    setMenu(null);
                  }}
                  className="flex-1 rounded-md bg-paper-sunken py-1 text-[10px] font-medium text-ink-700"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {menu.kind === "opening" && (
            <div className="flex gap-1 border-b border-line p-1.5">
              {(
                [
                  ["door", "Deur"],
                  ["window", "Raam"],
                  ["passage", "Doorgang"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => {
                    void update("openings", menu.id, { type: t });
                    setMenu(null);
                  }}
                  className="flex-1 rounded-md bg-paper-sunken py-1 text-[10px] font-medium text-ink-700"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setMenu(null)}
            className="block w-full px-3 py-2 text-left text-sm text-ink-700 hover:bg-paper-sunken"
          >
            Bewerken
          </button>
          <button
            onClick={() => void deleteEntity(menu.kind, menu.id)}
            className="block w-full px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger/10"
          >
            Verwijderen
          </button>
        </div>
      )}
    </div>
  );
}
