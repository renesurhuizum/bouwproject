"use client";

// Hart van de app: de 2D plattegrond-editor.
// - Touch: 1 vinger pannen (select) of tekenen (wall/place); 2 vingers pinch-zoom + pan.
// - Muis: slepen pant (select), scrollwiel zoomt.
// - Muren tekenen met snapping op raster en bestaande eindpunten.

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Rect, Label, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  Point,
  Wall,
  ElectricalItem,
  PlumbingItem,
  Opening,
  Room,
  Furniture,
  PlumbingType,
  Level,
  Staircase,
  Column,
  Beam,
  Roof,
  SectionLine,
} from "@/lib/domain/types";
import type { TableName } from "@/lib/db/repo";
import { TABLE_FOR_KIND } from "@/lib/domain/tables";
import { mBatch, mCreate, mRemove, mUpdate, recordCreate } from "@/lib/db/mutate";
import { getDB } from "@/lib/db/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useHistory } from "@/lib/history";
import { useEditor, type SelKind, type Selection } from "@/lib/store/editor";
import { useWalls, useRooms, useElectrical, useOpenings, usePlumbing, useFurniture, useHvac, useStairs, useColumns, useBeams, useRoofs, useDormers, useSections, useProject, useLevels, useCircuits, useAllElectrical } from "@/lib/hooks";
import {
  ELECTRICAL_DEFAULT_HEIGHT,
  FIXTURE_DEFAULT_HEIGHT,
  OPENING_DEFAULTS,
  OPENING_SNAP_M,
  STAIRCASE_DEFAULTS,
  COLUMN_DEFAULT_SIZE,
  ROOF_DEFAULTS,
  PIPE_SPECS,
} from "@/lib/domain/constants";
import { dist, pathLength, polygonArea, snapToGrid, snapToPoints, projectOnSegment, constrainToAngle, bounds, pointInRect } from "@/lib/geometry";
import { copySelection, pasteClipboard, type ClipboardData } from "@/lib/clipboard";
import { computeCircuitRoutes } from "@/lib/routing/cableRouting";
import {
  LAYER_FOR,
  entityPoints,
  translatePatch,
  mirrorPatch,
  selectionBounds,
  type AnyEntity,
} from "@/lib/selectionOps";
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
import { PathVertexHandles } from "./PathVertexHandles";
import { CableRoutesLayer } from "./CableRoutesLayer";
import type { LayoutRect } from "@/lib/roomDivider";

export function PlanEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ x: 60, y: 90, scale: 1 });

  const undo = useHistory((s) => s.undo);
  const redo = useHistory((s) => s.redo);

  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const placeKind = useEditor((s) => s.placeKind);
  const setPlaceKind = useEditor((s) => s.setPlaceKind);
  const constructionKind = useEditor((s) => s.constructionKind);
  const roofType = useEditor((s) => s.roofType);
  const furniturePaletteKind = useEditor((s) => s.furniturePaletteKind);
  const setFurniturePaletteKind = useEditor((s) => s.setFurniturePaletteKind);
  const pipeType = useEditor((s) => s.pipeType);
  const wallDefaults = useEditor((s) => s.wallDefaults);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const showGrid = useEditor((s) => s.showGrid);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridSnap = useEditor((s) => s.gridSnap);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const multi = useEditor((s) => s.multi);
  const setMulti = useEditor((s) => s.setMulti);
  const setClipboard = useEditor((s) => s.setClipboard);
  const lockedLayers = useEditor((s) => s.lockedLayers);
  const lassoMode = useEditor((s) => s.lassoMode);
  const setLassoMode = useEditor((s) => s.setLassoMode);
  const assignCircuitId = useEditor((s) => s.assignCircuitId);
  const showCableRoutes = useEditor((s) => s.showCableRoutes);

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
  const roofIds = useMemo(() => roofs.map((r) => r.id), [roofs]);
  const dormers = useDormers(roofIds) ?? [];
  const sections = useSections(activeLevelId) ?? [];

  // Kabelroutes worden over het hele project berekend: een eindgroep loopt vaak
  // door meerdere verdiepingen.
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const levelIds = useMemo(() => levels.map((l) => l.id), [levels]);
  const circuits = useCircuits(project?.id) ?? [];
  const allElectrical = useAllElectrical(levelIds) ?? [];
  const circuitColors = useMemo(
    () => new Map(circuits.map((c) => [c.id, c.color])),
    [circuits],
  );
  const circuitNumbers = useMemo(
    () => new Map(circuits.map((c) => [c.id, c.number])),
    [circuits],
  );
  const cableRoutes = useMemo(
    () =>
      circuits.length > 0
        ? computeCircuitRoutes({ circuits, items: allElectrical, walls, levels })
        : [],
    [circuits, allElectrical, walls, levels],
  );

  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapTarget, setSnapTarget] = useState<Point | null>(null);
  const [roomDraft, setRoomDraft] = useState<Point[]>([]);
  const [pipePoints, setPipePoints] = useState<Point[]>([]);
  // De sneltoets-handler wordt niet opnieuw geregistreerd tijdens het klikken
  // van leidingpunten; via deze ref leest Enter altijd de actuele punten.
  const pipePointsRef = useRef<Point[]>([]);
  pipePointsRef.current = pipePoints;
  const [menu, setMenu] = useState<{ x: number; y: number; kind: SelKind; id: string } | null>(null);
  const [divideRect, setDivideRect] = useState<LayoutRect | null>(null);
  const divideStartRef = useRef<Point | null>(null);

  // Lasso (rubber-band) multi-selectie — alleen muis in select-tool op leeg canvas.
  const [lassoBox, setLassoBox] = useState<{ start: Point; current: Point } | null>(null);
  const lassoRef = useRef<{ id: number; start: Point } | null>(null);

  // Lang indrukken = contextmenu. Op touch is er geen rechtermuisknop, dus
  // zonder dit is het menu daar onbereikbaar.
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  // Spiegel altijd de meest actuele entiteiten naar een ref, zodat
  // sneltoets-handlers (lasso/copy/nudge/mirror) niet op stale closures leunen.
  const entitiesRef = useRef<ClipboardData>({
    walls, rooms, openings, electrical, plumbing, hvac, furniture, stairs, columns, beams, roofs, dormers, sections,
  });
  entitiesRef.current = { walls, rooms, openings, electrical, plumbing, hvac, furniture, stairs, columns, beams, roofs, dormers, sections };

  // Shift-toets tracking voor orthogonaal tekenen; Alt = snapping tijdelijk uit.
  const shiftRef = useRef(false);
  const altRef = useRef(false);
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

  // Shift (ortho) en Alt (snap-bypass) bijhouden. Blur reset beide, anders
  // blijft een toets "hangen" als het venster focus verliest tijdens indrukken.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = true;
      if (e.key === "Alt") altRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = false;
      if (e.key === "Alt") altRef.current = false;
    };
    const onBlur = () => { shiftRef.current = false; altRef.current = false; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
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
  // State-reset tijdens render (React-patroon "adjusting state during render")
  // i.p.v. in een effect, om een extra render-cascade te vermijden.
  const [prevToolKey, setPrevToolKey] = useState(`${tool}|${activeLevelId}`);
  const toolKey = `${tool}|${activeLevelId}|${constructionKind?.domain ?? ""}`;
  if (toolKey !== prevToolKey) {
    setPrevToolKey(toolKey);
    setDraftStart(null);
    setRoomDraft([]);
    setPipePoints([]);
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
        const sels = currentSels();
        if (sels.length) {
          e.preventDefault();
          void doDeleteSelection(sels);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        doCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        doPaste({ x: 0.5, y: 0.5 });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        doDuplicate();
      } else if (e.key.startsWith("Arrow")) {
        const sels = currentSels();
        if (sels.length) {
          e.preventDefault();
          const step = e.shiftKey ? 1.0 : 0.1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          void doNudge(dx, dy);
        }
      } else if (e.key === "Enter" && useEditor.getState().tool === "draw-pipe") {
        e.preventDefault();
        void commitPipe();
      } else if (e.key === "Escape") {
        setDraftStart(null);
        setRoomDraft([]);
        setPipePoints([]);
        setMenu(null);
        select(null);
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        void redo();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "w": setTool("wall"); break;
          case "v": setTool("select"); break;
          case "r":
            // Met een geselecteerd meubel: roteren in 15°-stappen i.p.v. ruimte-tool.
            if (currentSels().some((s) => s.kind === "furniture")) {
              void doRotateFurniture(e.shiftKey ? -15 : 15);
            } else {
              setTool("room");
            }
            break;
          case "m":
            if (currentSels().length) void doMirror(e.shiftKey ? "v" : "h");
            break;
          case "e": setPlaceKind({ domain: "electrical", type: "socket" }); break;
          case "f":
            setTool("place-furniture");
            if (!furniturePaletteKind) setFurniturePaletteKind("sofa-2");
            break;
          case "d": setTool("divide"); break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, undo, redo]);

  async function deleteEntity(kind: SelKind, id: string) {
    await mRemove(TABLE_FOR_KIND[kind], id);
    setMenu(null);
    if (selection?.id === id) select(null);
  }

  // ── Selectie-bewerkingen (multi-select, copy/paste, nudge, spiegel) ──────────
  // Lezen verse state via getState() zodat sneltoetsen niet op stale closures leunen.
  function currentSels(): Selection[] {
    const st = useEditor.getState();
    return st.multi.length ? st.multi : st.selection ? [st.selection] : [];
  }

  function findEntity(kind: SelKind, id: string): AnyEntity | null {
    const e = entitiesRef.current;
    switch (kind) {
      case "wall": return e.walls.find((w) => w.id === id) ?? null;
      case "room": return e.rooms.find((r) => r.id === id) ?? null;
      case "electrical": return e.electrical.find((x) => x.id === id) ?? null;
      case "plumbing": return e.plumbing.find((x) => x.id === id) ?? null;
      case "hvac": return e.hvac.find((x) => x.id === id) ?? null;
      case "furniture": return e.furniture.find((x) => x.id === id) ?? null;
      case "staircase": return e.stairs.find((x) => x.id === id) ?? null;
      case "column": return e.columns.find((x) => x.id === id) ?? null;
      case "beam": return e.beams.find((x) => x.id === id) ?? null;
      case "roof": return e.roofs.find((x) => x.id === id) ?? null;
      case "dormer": return e.dormers.find((x) => x.id === id) ?? null;
      case "section": return e.sections.find((x) => x.id === id) ?? null;
      default: return null;
    }
  }

  function selectResult(sels: Selection[]) {
    if (sels.length === 0) select(null);
    else if (sels.length === 1) select(sels[0]);
    else setMulti(sels);
  }

  function doCopy() {
    const sels = currentSels();
    if (!sels.length) return;
    setClipboard(copySelection(sels, entitiesRef.current));
  }

  async function pasteClip(clip: ReturnType<typeof copySelection>, offset: Point) {
    const st = useEditor.getState();
    if (!st.activeLevelId) return;
    // Plakken van meerdere entiteiten is één undo-stap.
    const selections = await mBatch(async () => {
      const res = await pasteClipboard(clip, offset, st.activeLevelId!);
      for (const c of res.created) recordCreate(c.table as TableName, c.id);
      return res.selections;
    });
    selectResult(selections);
  }

  function doPaste(offset: Point) {
    const st = useEditor.getState();
    if (st.clipboard) void pasteClip(st.clipboard, offset);
  }

  function doDuplicate() {
    const sels = currentSels();
    if (!sels.length) return;
    void pasteClip(copySelection(sels, entitiesRef.current), { x: 0.3, y: 0.3 });
  }

  async function doNudge(dx: number, dy: number) {
    await mBatch(async () => {
      for (const s of currentSels()) {
        const ent = findEntity(s.kind, s.id);
        if (!ent) continue;
        const patch = translatePatch(s.kind, ent, dx, dy);
        if (Object.keys(patch).length) await mUpdate(TABLE_FOR_KIND[s.kind], s.id, patch);
      }
    });
  }

  async function doMirror(axis: "h" | "v") {
    const ents = currentSels()
      .map((s) => ({ kind: s.kind, id: s.id, entity: findEntity(s.kind, s.id) }))
      .filter((x): x is { kind: SelKind; id: string; entity: AnyEntity } => x.entity !== null);
    if (!ents.length) return;
    const bb = selectionBounds(ents);
    const pivot = { x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2 };
    await mBatch(async () => {
      for (const { kind, id, entity } of ents) {
        const patch = mirrorPatch(kind, entity, axis, pivot);
        if (Object.keys(patch).length) await mUpdate(TABLE_FOR_KIND[kind], id, patch);
      }
    });
  }

  async function doRotateFurniture(delta: number) {
    await mBatch(async () => {
      for (const s of currentSels()) {
        if (s.kind !== "furniture") continue;
        const f = findEntity("furniture", s.id) as Furniture | null;
        if (!f) continue;
        await mUpdate("furniture", s.id, { rotation: (((f.rotation + delta) % 360) + 360) % 360 });
      }
    });
  }

  async function doDeleteSelection(sels: Selection[]) {
    // Eén undo-stap voor de hele selectie.
    await mBatch(async () => {
      for (const s of sels) await mRemove(TABLE_FOR_KIND[s.kind], s.id);
    });
    setMenu(null);
    select(null);
  }

  function commitLasso(min: Point, max: Point) {
    const st = useEditor.getState();
    const e = entitiesRef.current;
    const res: Selection[] = [];
    const add = (kind: SelKind, arr: AnyEntity[]) => {
      if (st.lockedLayers[LAYER_FOR[kind]] || !st.visibleLayers[LAYER_FOR[kind]]) return;
      for (const it of arr) {
        if ((it as { deleted?: boolean }).deleted) continue;
        if (entityPoints(kind, it).some((p) => pointInRect(p, min, max))) {
          res.push({ kind, id: it.id });
        }
      }
    };
    add("wall", e.walls);
    add("room", e.rooms);
    add("furniture", e.furniture);
    add("electrical", e.electrical);
    add("plumbing", e.plumbing);
    add("hvac", e.hvac);
    add("staircase", e.stairs);
    add("column", e.columns);
    add("beam", e.beams);
    add("dormer", e.dormers);
    add("section", e.sections);
    selectResult(res);
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
    // Snapping staat uit (knop) of wordt tijdelijk overruled met Alt.
    if (!snapEnabled || altRef.current) {
      setSnapTarget(null);
      return shiftRef.current && draftStart ? constrainToAngle(m, draftStart, 45) : m;
    }
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
        await mUpdate("walls", wall.id, {
          end: { x: wall.start.x + dx * newLenM, y: wall.start.y + dy * newLenM },
        });
      }
    }
    setEditingWallId(null);
  }

  async function handleMoveEndpoint(wallId: string, which: "start" | "end", screenX: number, screenY: number) {
    const worldM = screenToMeters({ x: screenX, y: screenY }, view);
    const snapped = snapPoint(worldM);
    await mUpdate("walls", wallId, { [which]: snapped });
  }

  async function createWall(start: Point, end: Point) {
    if (!activeLevelId) return;
    if (dist(start, end) < 0.01) return;
    const w = await mCreate<Wall>("walls", {
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
    const item = await mCreate<ElectricalItem>("electrical", {
      levelId: activeLevelId,
      type: placeKind.type,
      position: at,
      heightZ: ELECTRICAL_DEFAULT_HEIGHT[placeKind.type],
    });
    select({ kind: "electrical", id: item.id });
  }

  async function placePlumbing(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "plumbing") return;
    const item = await mCreate<PlumbingItem>("plumbing", {
      levelId: activeLevelId,
      type: "fixture",
      fixture: placeKind.fixture,
      position: at,
      heightZ: FIXTURE_DEFAULT_HEIGHT[placeKind.fixture],
    });
    select({ kind: "plumbing", id: item.id });
  }

  async function placeHvac(at: Point) {
    if (!activeLevelId || !placeKind || placeKind.domain !== "hvac") return;
    const heights: Record<string, number> = { radiator: 0.3, "floor-heating": 0, ventilation: 2.3, wtw: 0.5 };
    const item = await mCreate<import("@/lib/domain/types").HvacItem>("hvac", {
      levelId: activeLevelId,
      type: placeKind.type,
      position: at,
      heightZ: heights[placeKind.type] ?? 0.3,
    });
    select({ kind: "hvac", id: item.id });
  }

  async function placeStaircase(at: Point) {
    if (!activeLevelId || constructionKind?.domain !== "staircase") return;
    const def = STAIRCASE_DEFAULTS[constructionKind.kind];
    const st = await mCreate<Staircase>("stairs", {
      levelId: activeLevelId,
      kind: constructionKind.kind,
      position: at,
      width: def.width,
      run: def.run,
      steps: def.steps,
      rotation: 0,
      direction: "up",
    });
    select({ kind: "staircase", id: st.id });
  }

  async function placeColumn(at: Point) {
    if (!activeLevelId || constructionKind?.domain !== "column") return;
    const col = await mCreate<Column>("columns", {
      levelId: activeLevelId,
      position: at,
      shape: constructionKind.shape,
      size: COLUMN_DEFAULT_SIZE,
      material: "concrete",
      loadBearing: true,
    });
    select({ kind: "column", id: col.id });
  }

  async function createBeam(start: Point, end: Point) {
    if (!activeLevelId || constructionKind?.domain !== "beam") return;
    if (dist(start, end) < 0.05) return;
    const bm = await mCreate<Beam>("beams", {
      levelId: activeLevelId,
      start,
      end,
      profile: constructionKind.profile,
      height: 2.4,
    });
    select({ kind: "beam", id: bm.id });
  }

  // Leiding vastleggen. Leest de punten uit de ref en de rest uit de store,
  // zodat zowel Enter als de Opslaan-knop dezelfde verse state gebruiken.
  async function commitPipe() {
    const pts = pipePointsRef.current;
    const st = useEditor.getState();
    if (pts.length < 2 || !st.activeLevelId) return;
    const spec = PIPE_SPECS[st.pipeType];
    // Een afvoer krijgt meteen het minimale afschot over zijn lengte mee, zodat
    // hij niet als "vlak" (en dus afgekeurd) begint.
    const len = pathLength(pts);
    const fall = spec.minFallMmPerM ? (spec.minFallMmPerM * len) / 1000 : 0;
    await mCreate<PlumbingItem>("plumbing", {
      levelId: st.activeLevelId,
      type: st.pipeType as PlumbingType,
      path: pts,
      diameter: spec.defaultDiameter,
      heightZ: spec.defaultHeightZ,
      startZ: spec.defaultHeightZ + fall,
      endZ: spec.defaultHeightZ,
    });
    setPipePoints([]);
  }

  async function createSection(start: Point, end: Point) {
    if (!activeLevelId || dist(start, end) < 0.2) return;
    const letter = String.fromCharCode(65 + (entitiesRef.current.sections.length % 26));
    const sec = await mCreate<SectionLine>("sections", {
      levelId: activeLevelId,
      start,
      end,
      label: `${letter}-${letter}`,
    });
    select({ kind: "section", id: sec.id });
  }

  async function placeRoof() {
    if (!activeLevelId) return;
    // Eén dak per verdieping: bestaat er al een, selecteer dat (type via paneel).
    const existing = entitiesRef.current.roofs[0];
    if (existing) {
      select({ kind: "roof", id: existing.id });
      return;
    }
    const def = ROOF_DEFAULTS[roofType];
    const r = await mCreate<Roof>("roofs", {
      levelId: activeLevelId,
      type: roofType,
      pitch: def.pitch,
      ridgeDirection: 0,
      overhang: def.overhang,
    });
    select({ kind: "roof", id: r.id });
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
    const op = await mCreate<Opening>("openings", {
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
    const room = await mCreate<Room>("rooms", {
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
      // Tik dicht bij het beginpunt (≥2 punten) = ruimte automatisch sluiten.
      // Twee drempelwaarden: pixel-snap-radius of 0.5m absoluut.
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
        const item = await mCreate<Furniture>("furniture", {
          levelId: activeLevelId,
          kind: furniturePaletteKind,
          position: snapped,
          rotation: 0,
        });
        select({ kind: "furniture", id: item.id });
      })();
      return;
    }
    if (tool === "construction" && constructionKind) {
      if (constructionKind.domain === "beam") {
        if (!draftStart) {
          setDraftStart(snapped);
        } else {
          void createBeam(draftStart, snapped);
          setDraftStart(null);
        }
      } else if (constructionKind.domain === "staircase") {
        void placeStaircase(snapped);
      } else {
        void placeColumn(snapped);
      }
      return;
    }
    if (tool === "roof") {
      void placeRoof();
      return;
    }
    if (tool === "section") {
      if (!draftStart) {
        setDraftStart(snapped);
      } else {
        void createSection(draftStart, snapped);
        setDraftStart(null);
      }
      return;
    }
    if (tool === "draw-pipe" && activeLevelId) {
      setPipePoints((prev) => [...prev, snapped]);
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
      // Slepen op leeg canvas pant (wat iedereen verwacht). Lasso-selectie
      // start alleen bewust: met Shift ingedrukt of in de lasso-modus — en
      // die modus werkt óók op touch, waar Shift niet bestaat.
      const startLasso =
        tool === "select" &&
        e.target === stage &&
        evt.button === 0 &&
        (lassoMode || shiftRef.current);
      if (startLasso) {
        const startM = screenToMeters(pos, view);
        lassoRef.current = { id: evt.pointerId, start: startM };
        setLassoBox({ start: startM, current: startM });
      } else if (tool === "select") {
        panPointer.current = { id: evt.pointerId, last: pos };
      }
      if (tool === "divide") {
        divideStartRef.current = screenToMeters(pos, view);
        setCursor(screenToMeters(pos, view));
      }

      // Lang indrukken op een entiteit opent het contextmenu (touch-equivalent
      // van de rechtermuisknop).
      longPressFiredRef.current = false;
      const found = entityNodeFor(e.target);
      if (tool === "select" && found && !lockedLayers[LAYER_FOR[found.kind]]) {
        longPressRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          longPressRef.current = null;
          select({ kind: found.kind, id: found.id });
          setMenu({ x: pos.x, y: pos.y, kind: found.kind, id: found.id });
          navigator.vibrate?.(10);
        }, 500);
      }
    } else {
      cancelLongPress();
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
      if (isDrawTool) {
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
      if (dist(pos, tapRef.current.start) > 8) {
        tapRef.current.moved = true;
        cancelLongPress(); // bewegen = slepen, geen contextmenu
      }
    }
    // Lasso slepen: rechthoek bijwerken, niet pannen.
    if (lassoRef.current && evt.pointerId === lassoRef.current.id) {
      setLassoBox({ start: lassoRef.current.start, current: screenToMeters(pos, view) });
      if (tapRef.current) tapRef.current.moved = true;
      return;
    }
    if (isDrawTool) {
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
    cancelLongPress();

    // Het contextmenu is net via lang indrukken geopend: die pointerup is geen
    // tik, anders sluit het menu meteen weer.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      pointers.current.delete(evt.pointerId);
      panPointer.current = null;
      tapRef.current = null;
      return;
    }

    // Lasso afronden: selecteer entiteiten binnen de rechthoek.
    if (lassoRef.current && evt.pointerId === lassoRef.current.id) {
      const startM = lassoRef.current.start;
      const endM = screenToMeters(pos, view);
      lassoRef.current = null;
      setLassoBox(null);
      pointers.current.delete(evt.pointerId);
      gesture.current = {};
      tapRef.current = null;
      const min = { x: Math.min(startM.x, endM.x), y: Math.min(startM.y, endM.y) };
      const max = { x: Math.max(startM.x, endM.x), y: Math.max(startM.y, endM.y) };
      if (Math.abs(max.x - min.x) > 0.05 && Math.abs(max.y - min.y) > 0.05) {
        commitLasso(min, max);
      } else {
        select(null); // klik op leeg vlak = deselecteren
      }
      setLassoMode(false); // eenmalige modus: na het slepen weer normaal pannen
      return;
    }

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

  // Zoek vanaf de aangeklikte vorm omhoog naar de node die de entiteit
  // identificeert: sinds de sleep-wrapper dragen groepen id + name, niet de
  // losse vormen erin.
  function entityNodeFor(node: import("konva/lib/Node").Node | null) {
    let cur = node;
    while (cur) {
      const id = cur.id();
      const name = cur.name();
      if (id && name && name in LAYER_FOR) return { id, kind: name as SelKind };
      cur = cur.getParent();
    }
    return null;
  }

  // Rechtermuisknop op een item → selecteren + contextmenu.
  function onContextMenu(e: KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const found = entityNodeFor(e.target);
    const id = found?.id ?? "";
    const name = found?.kind ?? "";
    if (id && name) {
      if (lockedLayers[LAYER_FOR[name as SelKind]]) return; // vergrendeld
      const rect = stage.container().getBoundingClientRect();
      const pos = { x: e.evt.clientX - rect.left, y: e.evt.clientY - rect.top };
      select({ kind: name as SelKind, id });
      setMenu({ x: pos.x, y: pos.y, kind: name as SelKind, id });
    } else {
      setMenu(null);
    }
  }

  function onSelectEntity(kind: SelKind, id: string) {
    if (tool !== "select") return; // bij tekenen niet selecteren
    if (lockedLayers[LAYER_FOR[kind]]) return; // vergrendelde laag: niet selecteerbaar
    // Toewijsmodus vanuit de groepenkast: aantikken hangt het punt aan de groep
    // (nogmaals tikken haalt het er weer af).
    if (assignCircuitId && kind === "electrical") {
      const item = allElectrical.find((e) => e.id === id);
      if (item && item.type !== "panel") {
        void mUpdate("electrical", id, {
          circuitId: item.circuitId === assignCircuitId ? undefined : assignCircuitId,
        });
      }
      return;
    }
    if (shiftRef.current) {
      // Shift-klik: toggle in/uit de meervoudige selectie.
      const cur = multi.length ? multi : selection ? [selection] : [];
      const exists = cur.some((s) => s.id === id && s.kind === kind);
      const next = exists
        ? cur.filter((s) => !(s.id === id && s.kind === kind))
        : [...cur, { kind, id }];
      selectResult(next);
    } else {
      select({ kind, id });
    }
  }

  // Draft (rubber-band) lengte.
  const draftLen = draftStart && cursor ? dist(draftStart, cursor) : 0;

  // Tekenen zonder maten is gokken: elk gereedschap toont tijdens het tekenen
  // de maat die er op dat moment toe doet — lengte, oppervlak of totaalloop.
  const measureText: string | null = (() => {
    if (!cursor) return null;
    if (draftStart && (tool === "wall" || tool === "section" ||
        (tool === "construction" && constructionKind?.domain === "beam"))) {
      return formatLength(draftLen);
    }
    if (tool === "room" && roomDraft.length > 0) {
      const seg = formatLength(dist(roomDraft[roomDraft.length - 1], cursor));
      const poly = [...roomDraft, cursor];
      if (poly.length < 3) return seg;
      const area = polygonArea(poly);
      return `${seg} · ${area.toFixed(2)} m²`;
    }
    if (tool === "draw-pipe" && pipePoints.length > 0) {
      const seg = dist(pipePoints[pipePoints.length - 1], cursor);
      let total = seg;
      for (let i = 1; i < pipePoints.length; i++) total += dist(pipePoints[i - 1], pipePoints[i]);
      return `${formatLength(seg)} · totaal ${formatLength(total)}`;
    }
    return null;
  })();

  // Geselecteerde leiding met een getekend pad → puntbewerking tonen.
  const selectedPath = (() => {
    if (!selection) return null;
    if (selection.kind === "plumbing") {
      const it = plumbing.find((p) => p.id === selection.id);
      if (it?.path && it.path.length >= 2) {
        return { table: "plumbing" as const, id: it.id, path: it.path };
      }
    }
    if (selection.kind === "hvac") {
      const it = hvac.find((h) => h.id === selection.id);
      if (it?.path && it.path.length >= 2) {
        return { table: "hvac" as const, id: it.id, path: it.path };
      }
    }
    return null;
  })();

  // Gereedschappen die op een punt in de plattegrond mikken: die verdienen
  // allemaal een cursor- en snap-indicator, niet alleen muur/plaatsen/ruimte.
  const isDrawTool =
    tool === "wall" || tool === "place" || tool === "room" || tool === "draw-pipe" ||
    tool === "place-furniture" || tool === "construction" || tool === "section";

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
              roof={roofs[0] ?? null}
              dormers={dormers}
              baseHeightM={activeLevel?.height ?? 0}
            />
          )}

          {visibleLayers.structure && (
            <WallsLayer
              view={view}
              walls={walls}
              selectedId={selection?.kind === "wall" ? selection.id : null}
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
              onSelect={(id) => onSelectEntity("electrical", id)}
              circuitColors={circuitColors}
              circuitNumbers={circuitNumbers}
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

          {visibleLayers.construction && (
            <BeamsLayer
              view={view}
              beams={beams}
              selectedId={selection?.kind === "beam" ? selection.id : null}
              onSelect={(id) => onSelectEntity("beam", id)}
            />
          )}

          {visibleLayers.construction && (
            <StairsLayer
              view={view}
              stairs={stairs}
              selectedId={selection?.kind === "staircase" ? selection.id : null}
              onSelect={(id) => onSelectEntity("staircase", id)}
            />
          )}

          {visibleLayers.construction && (
            <ColumnsLayer
              view={view}
              columns={columns}
              selectedId={selection?.kind === "column" ? selection.id : null}
              onSelect={(id) => onSelectEntity("column", id)}
            />
          )}

          {visibleLayers.roof && (
            <RoofLayer
              view={view}
              roofs={roofs}
              dormers={dormers}
              walls={walls}
              selectedRoofId={selection?.kind === "roof" ? selection.id : null}
              selectedDormerId={selection?.kind === "dormer" ? selection.id : null}
              onSelectRoof={(id) => onSelectEntity("roof", id)}
              onSelectDormer={(id) => onSelectEntity("dormer", id)}
              baseHeightM={activeLevel?.height ?? 0}
            />
          )}

          <SectionLayer
            view={view}
            sections={sections}
            selectedId={selection?.kind === "section" ? selection.id : null}
            onSelect={(id) => onSelectEntity("section", id)}
          />

          {visibleLayers.furniture && (
            <FurnitureLayer
              view={view}
              furniture={furniture}
              selectedId={selection?.kind === "furniture" ? selection.id : null}
              onSelect={(id) => onSelectEntity("furniture", id)}
              onRotate={async (id, rotation) => {
                await mUpdate("furniture", id, { rotation });
              }}
            />
          )}

          {visibleLayers.electrical && showCableRoutes && cableRoutes.length > 0 && (
            <CableRoutesLayer
              view={view}
              circuits={circuits}
              routes={cableRoutes}
              focusCircuitId={assignCircuitId}
            />
          )}

          {/* Puntbewerking van de geselecteerde leiding */}
          {tool === "select" && selectedPath && (
            <PathVertexHandles
              table={selectedPath.table}
              id={selectedPath.id}
              path={selectedPath.path}
              view={view}
            />
          )}

          {/* Draft / cursor */}
          <Layer listening={false}>
            {tool === "wall" && draftStart && cursor && (
              <Line
                points={[
                  ...Object.values(metersToScreen(draftStart, view)),
                  ...Object.values(metersToScreen(cursor, view)),
                ]}
                stroke="#ea580c"
                strokeWidth={2}
                dash={[8, 6]}
              />
            )}

            {/* Maatlabel bij de cursor — voor elk tekengereedschap */}
            {measureText && cursor && (
              <Label
                x={metersToScreen(cursor, view).x + 10}
                y={metersToScreen(cursor, view).y - 22}
              >
                <Tag fill="#1c1917" cornerRadius={4} />
                <Text
                  text={measureText}
                  fontSize={12}
                  fontFamily="monospace"
                  fill="#fff"
                  padding={4}
                />
              </Label>
            )}
            {isDrawTool && cursor && (
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
            {isDrawTool && snapTarget && (
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

            {/* Doorsnedelijn rubber-band (twee punten) */}
            {tool === "section" && draftStart && cursor && (
              <Line
                points={[
                  ...Object.values(metersToScreen(draftStart, view)),
                  ...Object.values(metersToScreen(cursor, view)),
                ]}
                stroke="#1c1917"
                strokeWidth={2}
                dash={[12, 4, 3, 4]}
              />
            )}

            {/* Stalen-balk rubber-band (twee punten) */}
            {tool === "construction" && constructionKind?.domain === "beam" && draftStart && cursor && (
              <>
                <Line
                  points={[
                    ...Object.values(metersToScreen(draftStart, view)),
                    ...Object.values(metersToScreen(cursor, view)),
                  ]}
                  stroke="#475569"
                  strokeWidth={3}
                  dash={[8, 6]}
                />
                <Circle
                  x={metersToScreen(draftStart, view).x}
                  y={metersToScreen(draftStart, view).y}
                  radius={5}
                  fill="#475569"
                />
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

            {/* Lasso rubber-band */}
            {lassoBox && (() => {
              const a = metersToScreen(lassoBox.start, view);
              const b = metersToScreen(lassoBox.current, view);
              return (
                <Rect
                  x={Math.min(a.x, b.x)}
                  y={Math.min(a.y, b.y)}
                  width={Math.abs(b.x - a.x)}
                  height={Math.abs(b.y - a.y)}
                  fill="rgba(59,130,246,0.12)"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dash={[6, 4]}
                  listening={false}
                />
              );
            })()}

            {/* Meervoudige-selectie highlight */}
            {multi.map((s) => {
              const ent = findEntity(s.kind, s.id);
              if (!ent) return null;
              const pts = entityPoints(s.kind, ent);
              if (pts.length === 0) return null;
              const bb = bounds(pts);
              const a = metersToScreen(bb.min, view);
              const b = metersToScreen(bb.max, view);
              const PAD = 6;
              return (
                <Rect
                  key={`${s.kind}-${s.id}`}
                  x={Math.min(a.x, b.x) - PAD}
                  y={Math.min(a.y, b.y) - PAD}
                  width={Math.abs(b.x - a.x) + PAD * 2}
                  height={Math.abs(b.y - a.y) + PAD * 2}
                  stroke="#ea580c"
                  strokeWidth={2}
                  dash={[4, 3]}
                  fill="rgba(234,88,12,0.10)"
                  cornerRadius={3}
                  listening={false}
                />
              );
            })}
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
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3">
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
              onClick={() => void commitPipe()}
              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Opslaan
            </button>
          </div>
        </div>
      )}

      {/* Ruimte-tekenhulp */}
      {tool === "room" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3">
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

      {/* Elektra-legenda: alleen als de laag aan staat én er iets te verklaren
          valt. Anders bedekte een lege legenda de plattegrond. */}
      {visibleLayers.electrical && electrical.length > 0 && <ElectricalLegend />}

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
                    void mUpdate("walls", menu.id, { status: st });
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
                    void mUpdate("openings", menu.id, { type: t });
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
            onClick={() => {
              // Naar het selectiegereedschap zodat het eigenschappen-paneel
              // verschijnt; setTool wist de selectie, dus daarna opnieuw zetten.
              const { kind, id } = menu;
              setMenu(null);
              setTool("select");
              select({ kind, id });
            }}
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
