"use client";

// Hart van de app: de 2D plattegrond-editor.
// - Touch: 1 vinger pannen (select) of tekenen (wall/place); 2 vingers pinch-zoom + pan.
// - Muis: slepen pant (select), scrollwiel zoomt.
// - Muren tekenen met snapping op raster en bestaande eindpunten.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Circle, Label, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  Point,
  Wall,
  ElectricalItem,
  PlumbingItem,
  Opening,
  Room,
  Furniture,
  Staircase,
  Column,
  Beam,
  PlumbingType,
  Level,
} from "@/lib/domain/types";
import { create, remove, update } from "@/lib/db/repo";
import { getDB } from "@/lib/db/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useHistory } from "@/lib/history";
import { useEditor, type SelKind } from "@/lib/store/editor";
import { useWalls, useRooms, useElectrical, useOpenings, usePlumbing, useFurniture, useHvac, useStairs, useColumns, useBeams, useRoofs, useSections } from "@/lib/hooks";
import {
  ELECTRICAL_DEFAULT_HEIGHT,
  FIXTURE_DEFAULT_HEIGHT,
  OPENING_DEFAULTS,
  OPENING_SNAP_M,
} from "@/lib/domain/constants";
import { dist, snapToGrid, snapToPoints, projectOnSegment, constrainToAngle, bounds, pointInPolygon, wallIntersection, mirrorPoints } from "@/lib/geometry";
import { GRID_SNAP_M } from "@/lib/store/editor";
import { buildClipboard, pasteClipboard } from "@/lib/clipboard";
import { formatLength } from "@/lib/format";
import {
  screenToMeters,
  metersToScreen,
  zoomAround,
  pxToMeters,
  SNAP_RADIUS_PX,
  type ViewState,
} from "./viewport";
import { BgImageLayer } from "./BgImageLayer";
import { GridLayer } from "./GridLayer";
import { WallsLayer } from "./WallsLayer";
import { OpeningsLayer } from "./OpeningsLayer";
import { RoomsLayer, type RoomPhaseStatus } from "./RoomsLayer";
import { ElectricalLayer } from "./ElectricalLayer";
import { PlumbingLayer } from "./PlumbingLayer";
import { FurnitureLayer } from "./FurnitureLayer";
import { HvacLayer } from "./HvacLayer";
import { StairsLayer } from "./StairsLayer";
import { ColumnsLayer } from "./ColumnsLayer";
import { BeamsLayer } from "./BeamsLayer";
import { RoofLayer } from "./RoofLayer";
import { SectionLayer } from "./SectionLayer";
import { RoomDivider } from "./RoomDivider";
import { ElectricalLegend } from "./ElectricalLegend";
import { Minimap } from "./Minimap";
import type { LayoutRect } from "@/lib/roomDivider";

export function PlanEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ x: 60, y: 90, scale: 1 });

  const undo = useHistory((s) => s.undo);
  const redo = useHistory((s) => s.redo);
  const pushAction = useHistory((s) => s.pushAction);

  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const placeKind = useEditor((s) => s.placeKind);
  const setPlaceKind = useEditor((s) => s.setPlaceKind);
  const furniturePaletteKind = useEditor((s) => s.furniturePaletteKind);
  const setFurniturePaletteKind = useEditor((s) => s.setFurniturePaletteKind);
  const pipeType = useEditor((s) => s.pipeType);
  const wallDefaults = useEditor((s) => s.wallDefaults);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const showGrid = useEditor((s) => s.showGrid);
  const gridSnap = useEditor((s) => s.gridSnap);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const selection = useEditor((s) => s.selection);
  const multiSelection = useEditor((s) => s.multiSelection);
  const setMultiSelection = useEditor((s) => s.setMultiSelection);
  const toggleMultiItem = useEditor((s) => s.toggleMultiItem);
  const clipboard = useEditor((s) => s.clipboard);
  const setClipboard = useEditor((s) => s.setClipboard);
  const select = useEditor((s) => s.select);
  const lockedLayers = useEditor((s) => s.lockedLayers);

  const walls = useWalls(activeLevelId) ?? [];
  const rooms = useRooms(activeLevelId) ?? [];
  const electrical = useElectrical(activeLevelId) ?? [];
  const plumbing = usePlumbing(activeLevelId) ?? [];
  const openings = useOpenings(activeLevelId) ?? [];
  const furniture = useFurniture(activeLevelId) ?? [];
  const hvac = useHvac(activeLevelId) ?? [];
  const stairs = useStairs(activeLevelId) ?? [];
  const columns = useColumns(activeLevelId) ?? [];
  const beams = useBeams(activeLevelId) ?? [];
  const roofs = useRoofs(activeLevelId) ?? [];
  const sections = useSections(activeLevelId) ?? [];

  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapTarget, setSnapTarget] = useState<Point | null>(null);
  const [roomDraft, setRoomDraft] = useState<Point[]>([]);
  const [pipePoints, setPipePoints] = useState<Point[]>([]);
  const [sectionPoints, setSectionPoints] = useState<Point[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: SelKind; id: string } | null>(null);
  const [divideRect, setDivideRect] = useState<LayoutRect | null>(null);
  const divideStartRef = useRef<Point | null>(null);
  // Lasso rubber-band selectie (scherm-pixels)
  const [lasso, setLasso] = useState<{ start: Point; current: Point } | null>(null);
  const lassoStartRef = useRef<Point | null>(null);
  // Beam draft
  const [beamStart, setBeamStart] = useState<Point | null>(null);

  // Shift-toets tracking voor orthogonaal tekenen
  const shiftRef = useRef(false);
  // Wall length editing overlay
  const [editingWallId, setEditingWallId] = useState<string | null>(null);
  const [editLengthValue, setEditLengthValue] = useState("");
  const lengthInputRef = useRef<HTMLInputElement>(null);

  // Active level data voor Bouwbesluit validatie
  const activeLevel = useLiveQuery(
    async () => (activeLevelId ? await getDB().levels.get(activeLevelId) : null),
    [activeLevelId],
  ) as Level | null | undefined;

  // Fase-overlay: status per ruimte op basis van taken met roomId.
  const phaseOverlay = useEditor((s) => s.phaseOverlay);
  const phaseStatusByRoom = useLiveQuery(
    async () => {
      if (!phaseOverlay) return null;
      const tasks = (await getDB().tasks.toArray()).filter((t) => !t.deleted && t.roomId);
      const m = new Map<string, RoomPhaseStatus>();
      const byRoom = new Map<string, { total: number; done: number }>();
      for (const t of tasks) {
        const cur = byRoom.get(t.roomId!) ?? { total: 0, done: 0 };
        cur.total += 1;
        if (t.done) cur.done += 1;
        byRoom.set(t.roomId!, cur);
      }
      for (const [roomId, { total, done }] of byRoom) {
        m.set(roomId, done === total ? "done" : done > 0 ? "in-progress" : "todo");
      }
      return m;
    },
    [phaseOverlay],
  ) as Map<string, RoomPhaseStatus> | null | undefined;

  // Gebaar-refs.
  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef<{ lastDist?: number; lastCenter?: Point }>({});
  const panPointer = useRef<{ id: number; last: Point } | null>(null);
  const tapRef = useRef<
    { id: number; start: Point; time: number; moved: boolean; onStage: boolean } | null
  >(null);

  // Shift-toets bijhouden voor orthogonaal tekenen.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Shift") shiftRef.current = true; };
    const onUp = (e: KeyboardEvent) => { if (e.key === "Shift") shiftRef.current = false; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

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

  // Tool of verdieping wisselt → tekening afbreken.
  const [prevToolKey, setPrevToolKey] = useState(`${tool}|${activeLevelId}`);
  const toolKey = `${tool}|${activeLevelId}`;
  if (toolKey !== prevToolKey) {
    setPrevToolKey(toolKey);
    setDraftStart(null);
    setRoomDraft([]);
    setPipePoints([]);
    setSectionPoints([]);
    setBeamStart(null);
    setLasso(null);
    lassoStartRef.current = null;
    setMenu(null);
    if (tool !== "divide") {
      setDivideRect(null);
      divideStartRef.current = null;
    }
  }

  // Sneltoetsen: Delete = selectie weg, Escape = annuleren/deselecteren.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (multiSelection.length > 1) {
          e.preventDefault();
          void (async () => {
            for (const s of multiSelection) await deleteEntity(s.kind, s.id);
            setMultiSelection([]);
          })();
        } else if (selection) {
          e.preventDefault();
          void deleteEntity(selection.kind, selection.id);
        }
      } else if (e.key === "c" && (e.ctrlKey || e.metaKey) && multiSelection.length > 0) {
        e.preventDefault();
        const clip = buildClipboard(multiSelection, { walls, openings, rooms, electrical, plumbing, hvac, furniture });
        setClipboard(clip);
      } else if (e.key === "v" && (e.ctrlKey || e.metaKey) && clipboard && activeLevelId) {
        e.preventDefault();
        void (async () => {
          const pasteOffset = { x: 0.5, y: 0.5 };
          const newItems = await pasteClipboard(clipboard, pasteOffset, activeLevelId);
          setMultiSelection(newItems);
          // Verhoog paste offset door clipboard te updaten
          setClipboard({
            ...clipboard,
            bbox: {
              min: { x: clipboard.bbox.min.x + 0.5, y: clipboard.bbox.min.y + 0.5 },
              max: { x: clipboard.bbox.max.x + 0.5, y: clipboard.bbox.max.y + 0.5 },
            },
          });
        })();
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey) && multiSelection.length > 0 && activeLevelId) {
        e.preventDefault();
        void (async () => {
          const clip = buildClipboard(multiSelection, { walls, openings, rooms, electrical, plumbing, hvac, furniture });
          const newItems = await pasteClipboard(clip, { x: 0.3, y: 0.3 }, activeLevelId);
          setMultiSelection(newItems);
        })();
      } else if (e.key === "Enter" && tool === "draw-pipe" && pipePoints.length >= 2 && activeLevelId) {
        e.preventDefault();
        void (async () => {
          await create<import("@/lib/domain/types").PlumbingItem>("plumbing", {
            levelId: activeLevelId,
            type: pipeType as import("@/lib/domain/types").PlumbingType,
            path: pipePoints,
            diameter: pipeType === "drain" ? 50 : 22,
            heightZ: pipeType === "drain" ? 0.05 : 1.0,
          });
          setPipePoints([]);
        })();
      } else if (e.key === "Enter" && tool === "draw-section" && sectionPoints.length >= 2 && activeLevelId) {
        e.preventDefault();
        void finalizeSectionLine(sectionPoints);
      } else if (e.key === "Escape") {
        setDraftStart(null);
        setRoomDraft([]);
        setPipePoints([]);
        setSectionPoints([]);
        setBeamStart(null);
        setLasso(null);
        lassoStartRef.current = null;
        setMenu(null);
        select(null);
        setMultiSelection([]);
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        void redo();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void undo();
      // Pijl-nudge voor geselecteerde items
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && (selection || multiSelection.length > 0)) {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : GRID_SNAP_M[gridSnap];
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        void nudgeSelection(multiSelection.length > 0 ? multiSelection : (selection ? [selection] : []), dx, dy);
      // Rotatie sneltoets voor geselecteerde meubels/installaties
      } else if (e.key === "r" && !e.ctrlKey && !e.metaKey && selection?.kind === "furniture") {
        e.preventDefault();
        const f = furniture.find((f) => f.id === selection.id);
        if (f) void update("furniture", f.id, { rotation: (f.rotation + (e.shiftKey ? -15 : 15) + 360) % 360 });
      // Spiegel sneltoetsen
      } else if (e.key === "m" && !e.ctrlKey && !e.metaKey && multiSelection.length > 0) {
        e.preventDefault();
        void mirrorSelection(multiSelection, e.shiftKey ? "v" : "h");
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "w": setTool("wall"); break;
          case "v": if (!e.ctrlKey) setTool("select"); break;
          case "r": if (!selection) setTool("room"); break;
          case "e": setPlaceKind({ domain: "electrical", type: "socket" }); break;
          case "t": setTool("trim"); break;
          case "f":
            setTool("place-furniture");
            if (!furniturePaletteKind) setFurniturePaletteKind("sofa-2");
            break;
          case "d": if (!e.ctrlKey) setTool("divide"); break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, multiSelection, clipboard, undo, redo, walls, openings, rooms, electrical, plumbing, hvac, furniture, pipePoints, sectionPoints, tool, gridSnap, activeLevelId]);

  const TABLE_FOR: Record<SelKind, import("@/lib/db/repo").TableName> = {
    wall: "walls",
    opening: "openings",
    electrical: "electrical",
    room: "rooms",
    plumbing: "plumbing",
    hvac: "hvac",
    furniture: "furniture",
    staircase: "stairs",
    column: "columns",
    beam: "beams",
    roof: "roofs",
    section: "sections",
  };

  async function deleteEntity(kind: SelKind, id: string) {
    const tbl = TABLE_FOR[kind];
    const snapshot = await (getDB()[tbl] as import("dexie").Table).get(id);
    if (snapshot) pushAction({ type: "remove", table: tbl, snapshot });
    await remove(tbl, id);
    setMenu(null);
    if (selection?.id === id) select(null);
  }

  // Verplaats geselecteerde items met delta dx/dy (m).
  async function nudgeSelection(items: import("@/lib/store/editor").Selection[], dx: number, dy: number) {
    for (const s of items) {
      if (s.kind === "wall") {
        const w = walls.find((w) => w.id === s.id);
        if (w) await update("walls", w.id, {
          start: { x: w.start.x + dx, y: w.start.y + dy },
          end: { x: w.end.x + dx, y: w.end.y + dy },
        });
      } else if (s.kind === "room") {
        const r = rooms.find((r) => r.id === s.id);
        if (r) await update("rooms", r.id, { polygon: r.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
      } else if (s.kind === "electrical") {
        const e = electrical.find((e) => e.id === s.id);
        if (e) await update("electrical", e.id, { position: { x: e.position.x + dx, y: e.position.y + dy } });
      } else if (s.kind === "plumbing") {
        const p = plumbing.find((p) => p.id === s.id);
        if (p && p.position) await update("plumbing", p.id, { position: { x: p.position.x + dx, y: p.position.y + dy } });
        if (p && p.path) await update("plumbing", p.id, { path: p.path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
      } else if (s.kind === "hvac") {
        const h = hvac.find((h) => h.id === s.id);
        if (h && h.position) await update("hvac", h.id, { position: { x: h.position.x + dx, y: h.position.y + dy } });
      } else if (s.kind === "furniture") {
        const f = furniture.find((f) => f.id === s.id);
        if (f) await update("furniture", f.id, { position: { x: f.position.x + dx, y: f.position.y + dy } });
      }
    }
  }

  // Spiegel geselecteerde items rond de horizontale of verticale as door het middelpunt.
  async function mirrorSelection(items: import("@/lib/store/editor").Selection[], axis: "h" | "v") {
    const allPts: Point[] = [];
    for (const s of items) {
      if (s.kind === "wall") {
        const w = walls.find((w) => w.id === s.id);
        if (w) allPts.push(w.start, w.end);
      } else if (s.kind === "room") {
        const r = rooms.find((r) => r.id === s.id);
        if (r) allPts.push(...r.polygon);
      } else if (s.kind === "furniture") {
        const f = furniture.find((f) => f.id === s.id);
        if (f) allPts.push(f.position);
      } else if (s.kind === "electrical") {
        const e = electrical.find((e) => e.id === s.id);
        if (e) allPts.push(e.position);
      }
    }
    if (allPts.length === 0) return;
    const b = bounds(allPts);
    const pivot = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
    for (const s of items) {
      if (s.kind === "wall") {
        const w = walls.find((w) => w.id === s.id);
        if (w) {
          const [ns, ne] = mirrorPoints([w.start, w.end], axis, pivot);
          await update("walls", w.id, { start: ns, end: ne });
        }
      } else if (s.kind === "room") {
        const r = rooms.find((r) => r.id === s.id);
        if (r) await update("rooms", r.id, { polygon: mirrorPoints(r.polygon, axis, pivot) });
      } else if (s.kind === "furniture") {
        const f = furniture.find((f) => f.id === s.id);
        if (f) {
          const [np] = mirrorPoints([f.position], axis, pivot);
          const newRot = axis === "h" ? (360 - f.rotation) % 360 : (180 - f.rotation + 360) % 360;
          await update("furniture", f.id, { position: np, rotation: newRot });
        }
      } else if (s.kind === "electrical") {
        const e = electrical.find((e) => e.id === s.id);
        if (e) {
          const [np] = mirrorPoints([e.position], axis, pivot);
          await update("electrical", e.id, { position: np });
        }
      }
    }
  }

  async function finalizeSectionLine(points: Point[]) {
    if (!activeLevelId || points.length < 2) return;
    const labelIndex = sections.length + 1;
    const label = String.fromCharCode(64 + labelIndex) + "-" + String.fromCharCode(64 + labelIndex);
    await create<import("@/lib/domain/types").SectionLine>("sections", {
      levelId: activeLevelId,
      start: points[0],
      end: points[points.length - 1],
      label,
    });
    setSectionPoints([]);
  }

  // Lasso: verzamel alle items die binnen de rechthoek vallen.
  function commitLasso(startScreen: Point, endScreen: Point, addToExisting: boolean) {
    const minX = Math.min(startScreen.x, endScreen.x);
    const maxX = Math.max(startScreen.x, endScreen.x);
    const minY = Math.min(startScreen.y, endScreen.y);
    const maxY = Math.max(startScreen.y, endScreen.y);
    const inBox = (p: Point) => {
      const s = metersToScreen(p, view);
      return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
    };
    const found: import("@/lib/store/editor").Selection[] = [];
    for (const w of walls) {
      if (!lockedLayers.structure && (inBox(w.start) || inBox(w.end))) found.push({ kind: "wall", id: w.id });
    }
    for (const r of rooms) {
      if (!lockedLayers.rooms && r.polygon.some(inBox)) found.push({ kind: "room", id: r.id });
    }
    for (const e of electrical) {
      if (!lockedLayers.electrical && inBox(e.position)) found.push({ kind: "electrical", id: e.id });
    }
    for (const f of furniture) {
      if (!lockedLayers.furniture && inBox(f.position)) found.push({ kind: "furniture", id: f.id });
    }
    for (const p of plumbing) {
      if (!lockedLayers.plumbing && p.position && inBox(p.position)) found.push({ kind: "plumbing", id: p.id });
    }
    for (const h of hvac) {
      if (!lockedLayers.hvac && h.position && inBox(h.position)) found.push({ kind: "hvac", id: h.id });
    }
    if (addToExisting) {
      const existing = multiSelection.filter((s) => !found.some((f) => f.id === s.id));
      setMultiSelection([...existing, ...found]);
    } else {
      setMultiSelection(found);
    }
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
    setSnapTarget(near);
    let result = near ?? snapToGrid(m, GRID_SNAP_M[gridSnap]);
    // Shift = ortho-constraint: snap naar 0°/45°/90° vanuit beginpunt
    if (shiftRef.current && draftStart) {
      result = constrainToAngle(result, draftStart, 45);
    }
    return result;
  }

  function startEditLength(wallId: string) {
    const wall = walls.find((w) => w.id === wallId);
    if (!wall) return;
    const len = Math.round(dist(wall.start, wall.end) * 100); // cm
    setEditingWallId(wallId);
    setEditLengthValue(String(len));
    setTimeout(() => { lengthInputRef.current?.select(); }, 50);
  }

  async function applyEditLength() {
    if (!editingWallId) return;
    const wall = walls.find((w) => w.id === editingWallId);
    if (!wall) { setEditingWallId(null); return; }
    const cm = parseFloat(editLengthValue);
    if (!isNaN(cm) && cm >= 1) {
      const newLenM = cm / 100;
      const lenM = dist(wall.start, wall.end);
      if (lenM > 0) {
        const dx = (wall.end.x - wall.start.x) / lenM;
        const dy = (wall.end.y - wall.start.y) / lenM;
        await update("walls", wall.id, {
          end: { x: wall.start.x + dx * newLenM, y: wall.start.y + dy * newLenM },
        });
      }
    }
    setEditingWallId(null);
  }

  async function handleMoveEndpoint(wallId: string, which: "start" | "end", screenX: number, screenY: number) {
    const worldM = screenToMeters({ x: screenX, y: screenY }, view);
    const snapped = snapPoint(worldM);
    await update("walls", wallId, { [which]: snapped });
  }

  async function createWall(start: Point, end: Point) {
    if (!activeLevelId) return;
    if (dist(start, end) < 0.01) return;
    const w = await create<Wall>("walls", {
      levelId: activeLevelId,
      start,
      end,
      thickness: wallDefaults.thickness,
      height: wallDefaults.height,
      material: wallDefaults.material,
      loadBearing: wallDefaults.loadBearing,
      status: wallDefaults.status,
    });
    pushAction({ type: "create", table: "walls", id: w.id });
  }

  async function placeElectrical(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "electrical") return;
    const item = await create<ElectricalItem>("electrical", {
      levelId: activeLevelId,
      type: placeKind.type,
      position: at,
      heightZ: ELECTRICAL_DEFAULT_HEIGHT[placeKind.type],
    });
    pushAction({ type: "create", table: "electrical", id: item.id });
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
    pushAction({ type: "create", table: "plumbing", id: item.id });
    select({ kind: "plumbing", id: item.id });
  }

  async function placeHvac(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "hvac") return;
    const heights: Record<string, number> = { radiator: 0.3, "floor-heating": 0, ventilation: 2.3, wtw: 0.5 };
    const item = await create<import("@/lib/domain/types").HvacItem>("hvac", {
      levelId: activeLevelId,
      type: placeKind.type,
      position: at,
      heightZ: heights[placeKind.type] ?? 0.3,
    });
    pushAction({ type: "create", table: "hvac", id: item.id });
    select({ kind: "hvac", id: item.id });
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
    pushAction({ type: "create", table: "openings", id: op.id });
    select({ kind: "opening", id: op.id });
  }

  async function finalizeRoom(points: Point[]) {
    if (!activeLevelId || points.length < 3) return;
    const room = await create<Room>("rooms", {
      levelId: activeLevelId,
      name: `Ruimte ${rooms.length + 1}`,
      polygon: points,
    });
    pushAction({ type: "create", table: "rooms", id: room.id });
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
      const closeSnap = roomDraft.length >= 2 && (
        dist(snapped, roomDraft[0]) < pxToMeters(SNAP_RADIUS_PX * 1.6, view) ||
        dist(snapped, roomDraft[0]) < 0.5
      );
      if (closeSnap) {
        void finalizeRoom(roomDraft);
      } else {
        setRoomDraft((d) => [...d, snapped]);
      }
      return;
    }
    if (tool === "place") {
      if (placeKind?.domain === "opening") void placeOpening(worldM);
      else if (placeKind?.domain === "plumbing") void placePlumbing(snapped);
      else if (placeKind?.domain === "hvac") void placeHvac(snapped);
      else void placeElectrical(snapped);
      return;
    }
    if (tool === "place-furniture" && furniturePaletteKind && activeLevelId) {
      void (async () => {
        const item = await create<Furniture>("furniture", {
          levelId: activeLevelId,
          kind: furniturePaletteKind,
          position: snapped,
          rotation: 0,
        });
        select({ kind: "furniture", id: item.id });
      })();
      return;
    }
    if (tool === "draw-pipe" && activeLevelId) {
      setPipePoints((prev) => [...prev, snapped]);
      return;
    }
    if (tool === "draw-section" && activeLevelId) {
      if (sectionPoints.length === 0) {
        setSectionPoints([snapped]);
      } else {
        void finalizeSectionLine([...sectionPoints, snapped]);
      }
      return;
    }
    if (tool === "place-staircase" && activeLevelId) {
      void (async () => {
        const item = await create<Staircase>("stairs", {
          levelId: activeLevelId,
          kind: (placeKind?.domain === "staircase" ? placeKind.kind : "straight") ?? "straight",
          position: snapped,
          width: 1.2,
          run: 3.0,
          steps: 16,
          rotation: 0,
          direction: "up",
        });
        select({ kind: "staircase", id: item.id });
      })();
      return;
    }
    if (tool === "place-column" && activeLevelId) {
      void (async () => {
        const wallDef = useEditor.getState().wallDefaults;
        const item = await create<Column>("columns", {
          levelId: activeLevelId,
          position: snapped,
          shape: "square",
          size: 0.2,
          material: wallDef.material,
          loadBearing: true,
        });
        select({ kind: "column", id: item.id });
      })();
      return;
    }
    if (tool === "place-beam" && activeLevelId) {
      if (!beamStart) {
        setBeamStart(snapped);
      } else {
        void (async () => {
          const item = await create<Beam>("beams", {
            levelId: activeLevelId,
            start: beamStart,
            end: snapped,
            profile: "HEA140",
            heightZ: 2.6,
          });
          select({ kind: "beam", id: item.id });
          setBeamStart(null);
        })();
      }
      return;
    }
    if (tool === "trim" && activeLevelId) {
      // Klik op dichtstbijzijnde muur-eindpunt → verleng/trim naar snijpunt met andere muur
      let bestWall: Wall | null = null;
      let bestEnd: "start" | "end" = "start";
      let bestDist = pxToMeters(SNAP_RADIUS_PX * 3, view);
      for (const w of walls) {
        const ds = dist(snapped, w.start);
        const de = dist(snapped, w.end);
        if (ds < bestDist) { bestDist = ds; bestWall = w; bestEnd = "start"; }
        if (de < bestDist) { bestDist = de; bestWall = w; bestEnd = "end"; }
      }
      if (bestWall) {
        // Zoek de dichtstbijzijnde andere muur om mee te snijden
        let closest: { wall: Wall; pt: Point; d: number } | null = null;
        for (const w of walls) {
          if (w.id === bestWall.id) continue;
          const pt = wallIntersection(bestWall, w);
          if (!pt) continue;
          const d = dist(pt, bestEnd === "start" ? bestWall.start : bestWall.end);
          if (!closest || d < closest.d) closest = { wall: w, pt, d };
        }
        if (closest) {
          void update("walls", bestWall.id, { [bestEnd]: closest.pt });
        }
      }
      return;
    }
    // select: tik op leeg vlak = deselecteren
    if (tool === "select" && onStage) {
      if (!shiftRef.current) {
        select(null);
        setMultiSelection([]);
      }
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
      if (tool === "select") {
        // Alleen pannen als op het canvas zelf (niet op een entity)
        if (e.target === stage) {
          panPointer.current = { id: evt.pointerId, last: pos };
          // Start lasso
          lassoStartRef.current = pos;
        }
      }
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
      if (tool === "wall" || tool === "place" || tool === "room" || tool === "place-furniture") {
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
    if (tool === "wall" || tool === "place" || tool === "room" || tool === "place-furniture" || tool === "draw-section" || tool === "place-beam") {
      setCursor(snapPoint(screenToMeters(pos, view)));
    }
    if (tool === "trim") {
      setCursor(snapPoint(screenToMeters(pos, view)));
    }
    if (tool === "divide") {
      setCursor(screenToMeters(pos, view));
      if (tapRef.current) tapRef.current.moved = true;
    }
    if (panPointer.current && evt.pointerId === panPointer.current.id && tool === "select") {
      // Als lasso actief is → update lasso, niet pannen
      if (lassoStartRef.current && tapRef.current?.moved) {
        setLasso({ start: lassoStartRef.current, current: pos });
        panPointer.current = null; // stop pannen tijdens lasso
      } else {
        const dx = pos.x - panPointer.current.last.x;
        const dy = pos.y - panPointer.current.last.y;
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        panPointer.current.last = pos;
        // Update lasso current als we al voorbij lasso-drempel zijn
        if (lassoStartRef.current) {
          setLasso({ start: lassoStartRef.current, current: pos });
        }
      }
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
    // Lasso afronden bij loslaten (als er een lasso actief was en groter dan drempel)
    if (tool === "select" && lassoStartRef.current && lasso) {
      const w = Math.abs(lasso.current.x - lasso.start.x);
      const h = Math.abs(lasso.current.y - lasso.start.y);
      if (w > 8 || h > 8) {
        commitLasso(lasso.start, lasso.current, shiftRef.current);
      }
      setLasso(null);
    }
    lassoStartRef.current = null;
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
    kind: SelKind,
    id: string,
  ) {
    if (tool !== "select") return;
    if (lockedLayers[kind === "wall" || kind === "opening" ? "structure" : (kind as import("@/lib/domain/types").EditorLayer)]) return;
    if (shiftRef.current) {
      toggleMultiItem({ kind, id });
    } else {
      select({ kind, id });
    }
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
          <BgImageLayer levelId={activeLevelId} view={view} />
          {showGrid && <GridLayer view={view} width={size.width} height={size.height} />}

          {visibleLayers.rooms && (
            <RoomsLayer
              view={view}
              rooms={rooms}
              selectedId={selection?.kind === "room" ? selection.id : null}
              onSelect={(id) => onSelectEntity("room", id)}
              walls={walls}
              levels={activeLevel ? [activeLevel] : []}
              phaseStatusByRoom={phaseOverlay ? (phaseStatusByRoom ?? new Map()) : null}
            />
          )}

          {visibleLayers.structure && (
            <WallsLayer
              view={view}
              walls={walls}
              selectedId={selection?.kind === "wall" ? selection.id : null}
              multiSelectedIds={multiSelection.filter((s) => s.kind === "wall").map((s) => s.id)}
              onSelect={(id) => onSelectEntity("wall", id)}
              onMoveEndpoint={handleMoveEndpoint}
              onEditLength={tool === "select" ? startEditLength : undefined}
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
              multiSelectedIds={multiSelection.filter((s) => s.kind === "electrical").map((s) => s.id)}
              onSelect={(id) => onSelectEntity("electrical", id)}
            />
          )}

          {visibleLayers.plumbing && (
            <PlumbingLayer
              view={view}
              items={plumbing}
              selectedId={selection?.kind === "plumbing" ? selection.id : null}
              onSelect={(id) => onSelectEntity("plumbing", id)}
              previewPath={
                tool === "draw-pipe" && pipePoints.length >= 1 && cursor
                  ? { points: [...pipePoints, cursor], type: pipeType }
                  : null
              }
            />
          )}

          {visibleLayers.hvac && (
            <HvacLayer
              view={view}
              items={hvac}
              selectedId={selection?.kind === "hvac" ? selection.id : null}
              onSelect={(id) => onSelectEntity("hvac", id)}
            />
          )}

          {visibleLayers.furniture && (
            <FurnitureLayer
              view={view}
              furniture={furniture}
              selectedId={selection?.kind === "furniture" ? selection.id : null}
              multiSelectedIds={multiSelection.filter((s) => s.kind === "furniture").map((s) => s.id)}
              onSelect={(id) => onSelectEntity("furniture", id)}
              onMove={async (id, x, y) => {
                await update("furniture", id, { position: { x, y } });
              }}
            />
          )}

          {visibleLayers.structure && (
            <StairsLayer
              view={view}
              stairs={stairs}
              selectedId={selection?.kind === "staircase" ? selection.id : null}
              onSelect={(id) => onSelectEntity("staircase", id)}
            />
          )}

          {visibleLayers.structure && (
            <ColumnsLayer
              view={view}
              columns={columns}
              selectedId={selection?.kind === "column" ? selection.id : null}
              onSelect={(id) => onSelectEntity("column", id)}
            />
          )}

          {visibleLayers.structure && (
            <BeamsLayer
              view={view}
              beams={beams}
              selectedId={selection?.kind === "beam" ? selection.id : null}
              onSelect={(id) => onSelectEntity("beam", id)}
            />
          )}

          {visibleLayers.roof && (
            <RoofLayer
              view={view}
              roofs={roofs}
              selectedId={selection?.kind === "roof" ? selection.id : null}
              onSelect={(id) => onSelectEntity("roof", id)}
            />
          )}

          <SectionLayer
            view={view}
            sections={sections}
            selectedId={selection?.kind === "section" ? selection.id : null}
            onSelect={(id) => onSelectEntity("section", id)}
            draftPoints={tool === "draw-section" ? sectionPoints : []}
            cursor={tool === "draw-section" ? cursor : null}
          />

          {/* Lasso rubber-band selectie */}
          {lasso && (
            <Layer listening={false}>
              <Rect
                x={Math.min(lasso.start.x, lasso.current.x)}
                y={Math.min(lasso.start.y, lasso.current.y)}
                width={Math.abs(lasso.current.x - lasso.start.x)}
                height={Math.abs(lasso.current.y - lasso.start.y)}
                fill="rgba(59,130,246,0.08)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            </Layer>
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
            {/* Snap-indicator: groene ring als cursor snapt aan bestaand punt */}
            {(tool === "wall" || tool === "place" || tool === "room") && snapTarget && (
              <Circle
                x={metersToScreen(snapTarget, view).x}
                y={metersToScreen(snapTarget, view).y}
                radius={10}
                stroke="#22c55e"
                strokeWidth={2}
                fill="transparent"
                listening={false}
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

            {/* Balk-draft */}
            {tool === "place-beam" && beamStart && cursor && (
              <>
                <Line
                  points={[
                    metersToScreen(beamStart, view).x, metersToScreen(beamStart, view).y,
                    metersToScreen(cursor, view).x, metersToScreen(cursor, view).y,
                  ]}
                  stroke="#6b7280"
                  strokeWidth={6}
                  dash={[10, 5]}
                />
                <Circle x={metersToScreen(beamStart, view).x} y={metersToScreen(beamStart, view).y} radius={5} fill="#6b7280" />
              </>
            )}

            {/* Sectielijn-draft */}
            {tool === "draw-section" && sectionPoints.length > 0 && cursor && (
              <>
                <Line
                  points={[
                    metersToScreen(sectionPoints[0], view).x, metersToScreen(sectionPoints[0], view).y,
                    metersToScreen(cursor, view).x, metersToScreen(cursor, view).y,
                  ]}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dash={[12, 6]}
                />
                <Circle x={metersToScreen(sectionPoints[0], view).x} y={metersToScreen(sectionPoints[0], view).y} radius={5} fill="#7c3aed" />
              </>
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

      {/* Wandlengte bewerken overlay */}
      {editingWallId && (() => {
        const wall = walls.find((w) => w.id === editingWallId);
        if (!wall) return null;
        const mid = metersToScreen(
          { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 },
          view,
        );
        return (
          <div
            className="pointer-events-auto absolute z-40 flex items-center gap-1.5 rounded-xl border border-accent bg-paper-raised/98 px-2.5 py-1.5 shadow-xl"
            style={{ left: mid.x - 60, top: mid.y - 48 }}
          >
            <input
              ref={lengthInputRef}
              type="number"
              value={editLengthValue}
              onChange={(e) => setEditLengthValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyEditLength();
                if (e.key === "Escape") setEditingWallId(null);
              }}
              onBlur={() => void applyEditLength()}
              className="tabular w-20 rounded-md border border-line bg-paper px-2 py-1 text-right text-sm text-ink-900 focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
            <span className="text-xs text-ink-500">cm</span>
          </div>
        );
      })()}

      {/* Leiding-tekenhulp */}
      {tool === "draw-pipe" && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line bg-paper-raised/95 px-2 py-1.5 shadow-lg backdrop-blur">
            <span className="px-1 text-[11px] text-ink-500">
              {pipePoints.length === 0
                ? "Tik om beginpunt te zetten"
                : `${pipePoints.length} ${pipePoints.length === 1 ? "punt" : "punten"}`}
            </span>
            <button
              onClick={() => setPipePoints((d) => d.slice(0, -1))}
              disabled={pipePoints.length === 0}
              className="rounded-lg bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-700 disabled:opacity-40"
            >
              Wis punt
            </button>
            <button
              onClick={() => setPipePoints([])}
              disabled={pipePoints.length === 0}
              className="rounded-lg bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-700 disabled:opacity-40"
            >
              Annuleer
            </button>
            <button
              disabled={pipePoints.length < 2}
              onClick={() => {
                if (!activeLevelId || pipePoints.length < 2) return;
                void (async () => {
                  await create<import("@/lib/domain/types").PlumbingItem>("plumbing", {
                    levelId: activeLevelId,
                    type: pipeType as import("@/lib/domain/types").PlumbingType,
                    path: pipePoints,
                    diameter: pipeType === "drain" ? 50 : 22,
                    heightZ: pipeType === "drain" ? 0.05 : 1.0,
                  });
                  setPipePoints([]);
                })();
              }}
              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Opslaan
            </button>
          </div>
        </div>
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

      {/* Elektra-legenda: alleen zichtbaar als elektra-laag aan staat */}
      {visibleLayers.electrical && <ElectricalLegend />}

      {/* Minimap */}
      {walls.length > 0 && (
        <Minimap
          walls={walls}
          view={view}
          stageWidth={size.width}
          stageHeight={size.height}
          onJumpTo={(worldX, worldY) => {
            setView((v) => ({
              ...v,
              x: size.width  / 2 - worldX * 50 * v.scale,
              y: size.height / 2 - worldY * 50 * v.scale,
            }));
          }}
        />
      )}

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
