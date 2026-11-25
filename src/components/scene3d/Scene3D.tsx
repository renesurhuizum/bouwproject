"use client";

// 3D-weergave: plattegrond geëxtrudeerd naar muren. Orbit-camera om rond te kijken.
// Plan-coördinaten (x, y in meters) → wereld (x, z). Hoogte = y omhoog.

import { useMemo, useRef, useState, useEffect } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Sky, TransformControls } from "@react-three/drei";
import { sunDirection } from "@/lib/sunPosition";
import {
  makeSurface,
  makeSurfaceMeterUv,
  surfaceForWallMaterial,
  surfaceForFloorMaterial,
  defaultColorFor,
  mixHex,
} from "@/lib/textures";
import { downloadBlob } from "@/lib/exportImage";
import { mUpdate as dbUpdate } from "@/lib/db/mutate";
import { useLiveQuery } from "dexie-react-hooks";
import type { Wall, Opening, ElectricalItem, PlumbingItem, Room, Level, Furniture, HvacItem, Staircase, Column, Beam, Roof, Dormer } from "@/lib/domain/types";
import { usePhases, useWalls, useElectrical, useOpenings, useRooms, usePlumbing, useProject, useFurniture, useHvac, useStairs, useColumns, useBeams, useRoofs, useDormers } from "@/lib/hooks";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import { ELECTRICAL_LABEL, BEAM_PROFILE_DIMS } from "@/lib/domain/constants";
import { findSection } from "@/lib/structural/sections";
import {
  buildRoof,
  cutRoofHoles,
  dormerHoles,
  roofFootprint,
  roofHeightAt,
  gableRoofHeightAt,
  toRoofLocal,
  DORMER_DEPTH_M,
  type RoofFootprint,
} from "@/lib/roofGeometry";
import { bounds } from "@/lib/geometry";
import { getDB } from "@/lib/db/db";
import { mCreate as dbCreate } from "@/lib/db/mutate";
import { useEditor } from "@/lib/store/editor";
import { use3DEdit } from "./use3DEdit";
import { WalkthroughMode } from "./WalkthroughMode";
import { facadeTextureFor, facadeTextureWorldUV, TILE_SIZE, ROOF_TILE_SIZE, roofTextures } from "./facadeTextures";
import { BuildSequenceBar } from "./BuildSequenceBar";
import {
  useBuildSequence,
  visibleAt,
  activeAt,
  wallSpan,
  electricalSpan,
  plumbingSpan,
  hvacSpan,
  phaseOrderMap,
  STEP,
  type Span,
} from "@/lib/buildSequence";
import { dist, angle, polygonCentroid, projectOnSegment } from "@/lib/geometry";
import type { Point } from "@/lib/domain/types";

/** Hoeveel statuskleur er door het materiaal heen mag schemeren. */
const STATUS_TINT = 0.22;

const STATUS_3D: Record<Wall["status"], { color: string; opacity: number }> = {
  existing: { color: "#b8b0a2", opacity: 1 },
  new: { color: "#ea580c", opacity: 1 },
  demolish: { color: "#dc2626", opacity: 0.35 },
};

const NO_OPENINGS: Opening[] = [];
const INTERIOR_PLASTER = "#efebe4";
const DEFAULT_FRAME = "#45494e"; // RAL 7024 grafietgrijs

interface Box {
  localX: number; // midden langs de muur (lokaal, -L/2..L/2)
  y: number; // midden hoogte
  w: number; // lengte van het segment
  h: number; // hoogte van het segment
}

// Splits een muur (of een horizontale band y0..y1 ervan) in massieve
// segmenten rond de openingen (echte gaten).
function wallBoxes(length: number, y0: number, y1: number, openings: Opening[]): Box[] {
  const clamp = (v: number) => Math.max(0, Math.min(length, v));
  const ops = openings
    .map((o) => ({ s: clamp(o.offset - o.width / 2), e: clamp(o.offset + o.width / 2), o }))
    .filter((x) => x.e > x.s && x.o.sillHeight < y1 && x.o.sillHeight + x.o.height > y0)
    .sort((a, b) => a.s - b.s);

  const boxes: Box[] = [];
  const push = (a: number, b: number, ya: number, yb: number) => {
    if (b - a < 0.001 || yb - ya < 0.001) return;
    boxes.push({ localX: (a + b) / 2 - length / 2, y: (ya + yb) / 2, w: b - a, h: yb - ya });
  };

  let cursor = 0;
  for (const { s, e, o } of ops) {
    if (s > cursor) push(cursor, s, y0, y1);
    const a = Math.max(s, cursor);
    const top = o.sillHeight + o.height;
    push(a, e, y0, Math.min(o.sillHeight, y1));
    push(a, e, Math.max(top, y0), y1);
    cursor = Math.max(cursor, e);
  }
  if (cursor < length) push(cursor, length, y0, y1);
  return boxes;
}

// Contour van een wand met schuine bovenkant en/of topgevel, met deuren als
// inkepingen in de onderrand en ramen als gaten.
function shapedWallGeometry(wall: Wall, length: number, bottom: number, openings: Opening[]) {
  const L = length;
  const h0 = wall.height;
  const h1 = wall.heightEnd ?? wall.height;
  const peak = wall.gablePeak ?? 0;
  const topAt = (s: number) => {
    const lin = h0 + (h1 - h0) * (s / L);
    return peak > 0 ? lin + peak * (1 - Math.abs(s - L / 2) / (L / 2)) : lin;
  };
  const x = (s: number) => s - L / 2;
  const eps = 0.02;
  const inside = openings
    .map((o) => ({ s: o.offset - o.width / 2, e: o.offset + o.width / 2, o }))
    .filter(({ s, e, o }) => {
      const top = o.sillHeight + o.height;
      return s > eps && e < L - eps && top < Math.min(topAt(s), topAt(e)) - eps;
    })
    .sort((a, b) => a.s - b.s);

  const shape = new THREE.Shape();
  shape.moveTo(x(0), bottom);
  for (const { s, e, o } of inside) {
    if (o.sillHeight > bottom + 0.001) continue; // gat, geen inkeping
    const top = o.sillHeight + o.height;
    shape.lineTo(x(s), bottom);
    shape.lineTo(x(s), top);
    shape.lineTo(x(e), top);
    shape.lineTo(x(e), bottom);
  }
  shape.lineTo(x(L), bottom);
  shape.lineTo(x(L), Math.max(bottom + 0.01, h1));
  if (peak > 0) shape.lineTo(x(L / 2), (h0 + h1) / 2 + peak);
  shape.lineTo(x(0), Math.max(bottom + 0.01, h0));
  shape.closePath();
  for (const { s, e, o } of inside) {
    if (o.sillHeight <= bottom + 0.001) continue;
    const hole = new THREE.Path();
    const top = o.sillHeight + o.height;
    hole.moveTo(x(s), o.sillHeight);
    hole.lineTo(x(e), o.sillHeight);
    hole.lineTo(x(e), top);
    hole.lineTo(x(s), top);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: wall.thickness, bevelEnabled: false });
  g.translate(0, 0, -wall.thickness / 2);
  return g;
}

function makeFacadeMaterial(
  kind: NonNullable<Wall["facade"]>["kind"],
  color: string,
  mortar: string | undefined,
  w: number,
  h: number,
  offX: number,
  offY: number,
) {
  const map = facadeTextureFor(kind, color, mortar, w, h);
  if (map) {
    const tile = TILE_SIZE[kind];
    map.offset.set(offX / tile.w, offY / tile.h);
  }
  return new THREE.MeshStandardMaterial({
    map: map ?? undefined,
    color: map ? "#ffffff" : color,
    roughness: kind === "brick" ? 0.92 : kind === "plaster" ? 0.95 : 0.75,
    metalness: 0,
  });
}

// Kozijn + glas / deurblad in een sparing (lokale wandcoördinaten).
function OpeningFill({ o, length, thickness, outside }: { o: Opening; length: number; thickness: number; outside: number }) {
  if (o.type === "passage") return null;
  const fw = 0.065; // kozijnbreedte
  const fd = Math.min(thickness, 0.11);
  const frame = o.frameColor ?? DEFAULT_FRAME;
  const z = outside * Math.max(0, thickness / 2 - fd / 2 - 0.04);
  const isDoor = o.type === "door";
  const glazed = isDoor ? !!o.glazed : o.glazed !== false;
  const w = o.width;
  const h = o.height;
  const bars: [number, number, number, number][] = [
    [-w / 2 + fw / 2, 0, fw, h],
    [w / 2 - fw / 2, 0, fw, h],
    [0, h / 2 - fw / 2, w, fw],
  ];
  if (!isDoor) bars.push([0, -h / 2 + fw / 2, w, fw]);
  if (glazed && w > 1.3) {
    const n = Math.max(1, Math.round(w / 1.1) - 1);
    for (let i = 1; i <= n; i++) bars.push([-w / 2 + (w * i) / (n + 1), 0, fw * 0.8, h]);
  }
  // hoge ramen: tussenregel (bovenlicht) op ±60%
  if (glazed && !isDoor && h > 1.5) bars.push([0, h * 0.1, w, fw * 0.8]);
  return (
    <group position={[o.offset - length / 2, o.sillHeight + h / 2, z]}>
      {bars.map(([bx, by, bw, bh], i) => (
        <mesh key={i} position={[bx, by, 0]} castShadow>
          <boxGeometry args={[bw, bh, fd]} />
          <meshStandardMaterial color={frame} roughness={0.55} metalness={0.1} />
        </mesh>
      ))}
      {glazed ? (
        <mesh position={[0, isDoor ? -fw / 2 : 0, 0]}>
          <boxGeometry args={[w - fw * 2, h - (isDoor ? fw : fw * 2), 0.012]} />
          <meshStandardMaterial color="#9db6c2" transparent opacity={0.32} roughness={0.04} metalness={0.4} depthWrite={false} />
        </mesh>
      ) : (
        <group position={[0, isDoor ? -fw / 2 : 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[w - fw * 2, h - (isDoor ? fw : fw * 2), 0.045]} />
            <meshStandardMaterial color={shade(frame, 0.85)} roughness={0.6} />
          </mesh>
          {/* gesloten paneel: liggende delen */}
          {!isDoor &&
            Array.from({ length: Math.max(2, Math.floor((h - fw * 2) / 0.12)) }, (_, i) => i).map((i, _i, arr) => (
              <mesh key={i} position={[0, -(h - fw * 2) / 2 + ((i + 0.5) * (h - fw * 2)) / arr.length, 0.03]}>
                <boxGeometry args={[w - fw * 2, 0.012, 0.01]} />
                <meshStandardMaterial color="#1c1d1f" />
              </mesh>
            ))}
        </group>
      )}
    </group>
  );
}

function WallMesh({
  wall,
  openings,
  wallColor,
  outside,
  realistic,
  highlight,
}: {
  wall: Wall;
  openings: Opening[];
  wallColor?: string;
  outside: number; // +1 / -1 = buitenzijde, 0 = binnenwand
  realistic: boolean;
  highlight?: boolean; // 4D: nieuw in de getoonde bouwstap
}) {
  const length = dist(wall.start, wall.end);
  const style = STATUS_3D[wall.status];
  const shaped = wall.heightEnd !== undefined || (wall.gablePeak ?? 0) > 0;
  const facade = realistic && !highlight && wall.status !== "demolish" ? wall.facade : undefined;
  // Zonder gevelafwerking: oppervlak per muurmateriaal op ware schaal, met de
  // bouwstatus als lichte tint (zie STATUS_TINT).
  const kind = surfaceForWallMaterial(wall.material);
  const drawColor = mixHex(wallColor ?? defaultColorFor(kind), wall.status === "existing" ? null : style.color, STATUS_TINT);
  const plinth = facade?.plinth;
  const bottom = shaped && plinth ? plinth.height : 0;

  const parts = useMemo(() => {
    if (length < 0.01) return { boxes: [], shapeGeom: null as THREE.ExtrudeGeometry | null };
    const surface =
      realistic && !highlight && style.opacity >= 1
        ? shaped
          ? makeSurfaceMeterUv(kind, drawColor)
          : makeSurface(kind, length, wall.height, drawColor)
        : null;
    const plainMat = new THREE.MeshStandardMaterial({
      color: highlight ? "#facc15" : surface ? "#ffffff" : realistic ? drawColor : style.color,
      map: surface?.map ?? null,
      normalMap: surface?.normalMap ?? null,
      transparent: style.opacity < 1,
      opacity: style.opacity,
      roughness: surface?.roughness ?? 0.85,
      metalness: surface?.metalness ?? 0,
    });
    const interiorMat = new THREE.MeshStandardMaterial({ color: wallColor ?? INTERIOR_PLASTER, roughness: 0.95 });

    // Materialen voor een box: [px, nx, py, ny, pz, nz]
    const boxMats = (b: Box, f: NonNullable<Wall["facade"]> | { kind: NonNullable<Wall["facade"]>["kind"]; color: string; mortarColor?: string } | undefined) => {
      if (!f) return plainMat;
      const fm = makeFacadeMaterial(f.kind, f.color, f.mortarColor, b.w, b.h, b.localX - b.w / 2 + length / 2, b.y - b.h / 2);
      const mats: THREE.Material[] = [fm, fm, fm, fm, fm, fm];
      if (outside > 0) mats[5] = interiorMat;
      else if (outside < 0) mats[4] = interiorMat;
      return mats;
    };

    const boxes: { b: Box; mat: THREE.Material | THREE.Material[] }[] = [];
    let shapeGeom: THREE.ExtrudeGeometry | null = null;
    if (plinth) {
      for (const b of wallBoxes(length, 0, plinth.height, openings))
        boxes.push({ b, mat: boxMats(b, { kind: "brick", color: plinth.color, mortarColor: plinth.mortarColor }) });
    }
    if (shaped) {
      shapeGeom = shapedWallGeometry(wall, length, bottom, openings);
    } else {
      for (const b of wallBoxes(length, plinth ? plinth.height : 0, wall.height, openings))
        boxes.push({ b, mat: boxMats(b, facade) });
    }
    let shapeMat: THREE.Material | THREE.Material[] = plainMat;
    if (shapeGeom && facade) {
      const map = facadeTextureWorldUV(facade.kind, facade.color, facade.mortarColor);
      shapeMat = new THREE.MeshStandardMaterial({
        map: map ?? undefined,
        color: map ? "#ffffff" : facade.color,
        roughness: facade.kind === "brick" ? 0.92 : 0.75,
      });
    }
    return { boxes, shapeGeom, shapeMat };
  }, [wall, length, openings, wallColor, outside, realistic, highlight, facade, plinth, shaped, bottom, style, kind, drawColor]);

  if (length < 0.01) return null;
  const cx = (wall.start.x + wall.end.x) / 2;
  const cz = (wall.start.y + wall.end.y) / 2;
  const rotY = -angle(wall.start, wall.end);

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      {parts.boxes.map(({ b, mat }, i) => (
        <mesh key={i} position={[b.localX, b.y, 0]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, wall.thickness]} />
        </mesh>
      ))}
      {parts.shapeGeom && (
        <mesh geometry={parts.shapeGeom} material={parts.shapeMat} castShadow receiveShadow />
      )}
      {openings.map((o) => (
        <OpeningFill key={o.id} o={o} length={length} thickness={wall.thickness} outside={outside || 1} />
      ))}
    </group>
  );
}

// Bepaal de buitenzijde van een muur: expliciet (facade.outside), anders via
// de ruimtes (kant zonder ruimte = buiten), anders t.o.v. het zwaartepunt.
function wallOutsideSign(wall: Wall, rooms: Room[], center: Point): number {
  if (!wall.facade) return 0;
  if (wall.facade.outside) return wall.facade.outside;
  const a = angle(wall.start, wall.end);
  const n = { x: -Math.sin(a), y: Math.cos(a) };
  const inRoom = (p: Point) => rooms.some((r) => r.polygon.length >= 3 && pointInPolygon(p, r.polygon));
  let score = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const m = { x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t };
    const d = wall.thickness / 2 + 0.3;
    if (inRoom({ x: m.x + n.x * d, y: m.y + n.y * d })) score -= 1;
    if (inRoom({ x: m.x - n.x * d, y: m.y - n.y * d })) score += 1;
  }
  if (score !== 0) return score > 0 ? 1 : -1;
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  return (mid.x - center.x) * n.x + (mid.y - center.y) * n.y >= 0 ? 1 : -1;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const FLOOR_COLORS: Record<string, string> = {
  tile: "#d4cfc8",
  wood: "#c9a96e",
  carpet: "#8a9070",
  stone: "#b8b0a4",
  concrete: "#a8a8a8",
};

function RoomFloor3D({ room }: { room: Room }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.polygon.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
    s.closePath();
    return s;
  }, [room.polygon]);

  const floorColor = room.floorMaterial
    ? FLOOR_COLORS[room.floorMaterial]
    : (room.color ?? "#e6d6bf");

  // Vloerafwerking op ware maat: de ruimte-afmeting bepaalt de herhaling, dus
  // een tegel van 30 cm blijft 30 cm — ongeacht hoe groot de kamer is.
  const surface = useMemo(
    () =>
      room.floorMaterial
        ? makeSurfaceMeterUv(surfaceForFloorMaterial(room.floorMaterial), floorColor)
        : null,
    [room.floorMaterial, floorColor],
  );

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      {/* Zonder afwerking valt de vloer terug op de ruimtekleur; mét afwerking
          zit de kleur al in de textuur en zou vermenigvuldigen hem verdubbelen. */}
      <meshStandardMaterial
        color={surface ? "#ffffff" : floorColor}
        map={surface?.map}
        normalMap={surface?.normalMap}
        roughness={surface?.roughness ?? 0.9}
        metalness={surface?.metalness ?? 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function RoomCeiling3D({ room, height }: { room: Room; height: number }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.polygon.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
    s.closePath();
    return s;
  }, [room.polygon]);

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height - 0.01, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#f4f0e8" roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

const ELECTRICAL_LABELS = ELECTRICAL_LABEL;

function handleElectricalClick(e: ThreeEvent<MouseEvent>, item: ElectricalItem) {
  e.stopPropagation();
  use3DEdit.getState().setSelectedItem({
    kind: "electrical",
    id: item.id,
    label: ELECTRICAL_LABELS[item.type] ?? item.type,
    screenX: e.nativeEvent.clientX,
    screenY: e.nativeEvent.clientY,
  });
}

function ElectricalMarker({ item }: { item: ElectricalItem }) {
  const isLight = item.type === "light" || item.type === "spot";
  const isWall = item.type === "socket" || item.type === "socket-double" || item.type === "switch" || item.type === "data" || item.type === "perilex";
  const isSwitch = item.type === "switch";

  if (isLight) {
    return (
      <group position={[item.position.x, item.heightZ, item.position.y]} onClick={(e) => handleElectricalClick(e, item)}>
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
          <meshStandardMaterial color="#f5f0e8" roughness={0.2} metalness={0.3} />
        </mesh>
        <pointLight intensity={0.5} distance={4} color="#fffae8" />
      </group>
    );
  }

  if (isWall) {
    return (
      <group position={[item.position.x, item.heightZ, item.position.y]} onClick={(e) => handleElectricalClick(e, item)}>
        <mesh>
          <boxGeometry args={[0.085, 0.085, 0.012]} />
          <meshStandardMaterial color="#f5f5f0" roughness={0.3} metalness={0.1} />
        </mesh>
        {isSwitch ? (
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.028, 0.045, 0.008]} />
            <meshStandardMaterial color="#e8e8e0" roughness={0.4} />
          </mesh>
        ) : (
          <>
            <mesh position={[-0.018, 0, 0.013]}>
              <cylinderGeometry args={[0.004, 0.004, 0.01, 8]} />
              <meshStandardMaterial color="#333333" />
            </mesh>
            <mesh position={[0.018, 0, 0.013]}>
              <cylinderGeometry args={[0.004, 0.004, 0.01, 8]} />
              <meshStandardMaterial color="#333333" />
            </mesh>
          </>
        )}
      </group>
    );
  }

  return (
    <mesh position={[item.position.x, item.heightZ, item.position.y]} onClick={(e) => handleElectricalClick(e, item)}>
      <sphereGeometry args={[0.05, 12, 12]} />
      <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
    </mesh>
  );
}

// ── Gedeelde materiaal-presets voor composite-modellen ──────────────────────
const CHROME = { color: "#d8dcdf", metalness: 0.85, roughness: 0.2 } as const;
const WHITE_CERAMIC = { color: "#f5f4f0", roughness: 0.18, metalness: 0.05 } as const;
const GLASS = { color: "#cfe8f0", transparent: true, opacity: 0.25, depthWrite: false, roughness: 0.1, metalness: 0.1 } as const;

// Donkerder/lichter tint van een hex-kleur (pure berekening, geen state).
function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return `#${c.getHexString()}`;
}

// Vier pootjes in de hoeken (cilinders).
function CornerLegs({ w, d, h = 0.08, r = 0.03, inset = 0.08, color = "#6b5a45" }: {
  w: number; d: number; h?: number; r?: number; inset?: number; color?: string;
}) {
  const xs = [-(w / 2 - inset), w / 2 - inset];
  const zs = [-(d / 2 - inset), d / 2 - inset];
  return (
    <>
      {xs.map((x, i) =>
        zs.map((z, j) => (
          <mesh key={`${i}-${j}`} position={[x, h / 2, z]} castShadow>
            <cylinderGeometry args={[r, r, h, 10]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        )),
      )}
    </>
  );
}

// Klein chroom kraantje: staand buisje + haaks uitloopje. `position` = voet.
function ChromeTap({ position, h = 0.18 }: { position: [number, number, number]; h?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, h, 12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0, h - 0.01, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.12, 12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </group>
  );
}

// Staande doucheset: dunne buis met douchekop bovenaan. `x`/`z` = voet op de bak.
function ShowerRiser({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 2.0, 12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {/* arm naar voren */}
      <mesh position={[0, 2.02, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.18, 12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {/* douchekop: afgeplatte cilinder */}
      <mesh position={[0, 2.0, 0.18]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 16]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </group>
  );
}

// ── Sanitair-modellen ────────────────────────────────────────────────────────

function ToiletModel() {
  return (
    <>
      {/* stortbak tegen de achterzijde, tot ~0.8 m */}
      <mesh position={[0, 0.55, -0.23]} castShadow>
        <boxGeometry args={[0.38, 0.50, 0.18]} />
        <meshStandardMaterial {...WHITE_CERAMIC} />
      </mesh>
      {/* pot */}
      <mesh position={[0, 0.20, 0.05]} castShadow>
        <cylinderGeometry args={[0.16, 0.13, 0.40, 16]} />
        <meshStandardMaterial {...WHITE_CERAMIC} />
      </mesh>
      {/* bril */}
      <mesh position={[0, 0.41, 0.05]}>
        <cylinderGeometry args={[0.19, 0.19, 0.03, 16]} />
        <meshStandardMaterial color="#fbfaf7" roughness={0.25} />
      </mesh>
    </>
  );
}

function SinkModel() {
  return (
    <>
      {/* onderkast/zuil */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.45, 0.76, 0.32]} />
        <meshStandardMaterial color="#e8e4dc" roughness={0.6} />
      </mesh>
      {/* kom */}
      <mesh position={[0, 0.81, 0.02]} castShadow>
        <cylinderGeometry args={[0.24, 0.20, 0.10, 16]} />
        <meshStandardMaterial {...WHITE_CERAMIC} />
      </mesh>
      {/* binnen-kom (lager) */}
      <mesh position={[0, 0.845, 0.02]}>
        <cylinderGeometry args={[0.19, 0.16, 0.05, 16]} />
        <meshStandardMaterial color="#eef2f3" roughness={0.15} />
      </mesh>
      <ChromeTap position={[0, 0.86, -0.16]} />
    </>
  );
}

function ShowerModel() {
  return (
    <>
      {/* douchebak */}
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.90, 0.05, 0.90]} />
        <meshStandardMaterial color="#f2f4f4" roughness={0.3} />
      </mesh>
      <ShowerRiser x={-0.35} z={-0.35} />
    </>
  );
}

function WashingMachineModel() {
  return (
    <>
      <mesh position={[0, 0.425, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.60, 0.85, 0.60]} />
        <meshStandardMaterial color="#f4f4f2" roughness={0.35} metalness={0.1} />
      </mesh>
      {/* ronde deur aan de voorzijde */}
      <mesh position={[0, 0.40, 0.315]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.20, 0.20, 0.03, 16]} />
        <meshStandardMaterial color="#3a3f44" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* bedieningsstrip */}
      <mesh position={[0, 0.78, 0.305]}>
        <boxGeometry args={[0.54, 0.08, 0.02]} />
        <meshStandardMaterial color="#d8dadc" roughness={0.4} />
      </mesh>
    </>
  );
}

function BoilerModel({ hz }: { hz: number }) {
  return (
    <>
      {/* witte staande kast op muurhoogte */}
      <mesh position={[0, hz + 0.40, 0]} castShadow>
        <boxGeometry args={[0.45, 0.80, 0.38]} />
        <meshStandardMaterial color="#f6f6f4" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* leidingaansluitingen onderaan */}
      <mesh position={[-0.10, hz - 0.10, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 0.20, 10]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0.10, hz - 0.10, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 0.20, 10]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </>
  );
}

function PlumbingMarker({ item }: { item: PlumbingItem }) {
  if (!item.position) return null;

  let model: ReactNode;
  switch (item.fixture) {
    case "toilet":          model = <ToiletModel />; break;
    case "sink":            model = <SinkModel />; break;
    case "shower":          model = <ShowerModel />; break;
    case "bath":            model = <BathtubModel w={0.75} d={1.70} h={0.55} color="#e8f4f8" />; break;
    case "washing-machine": model = <WashingMachineModel />; break;
    case "boiler":          model = <BoilerModel hz={item.heightZ ?? 0.9} />; break;
    case "kitchen-tap":     model = <ChromeTap position={[0, 0.90, 0]} h={0.30} />; break;
    case "outdoor-tap":     model = <ChromeTap position={[0, item.heightZ ?? 0.5, 0]} />; break;
    default:
      model = (
        <mesh position={[0, 0.425, 0]} castShadow>
          <boxGeometry args={[0.40, 0.85, 0.40]} />
          <meshStandardMaterial color="#c8dce8" roughness={0.25} metalness={0.08} />
        </mesh>
      );
  }

  return <group position={[item.position.x, 0, item.position.y]}>{model}</group>;
}

function PipePath3D({ item }: { item: PlumbingItem }) {
  const path = item.path;
  if (!path || path.length < 2) return null;
  const hz = item.heightZ ?? 0.3;
  const color = item.type === "supply-cold" ? "#3b82f6"
    : item.type === "supply-hot" ? "#ef4444"
    : "#9333ea"; // drain
  const r = item.diameter ? item.diameter / 2000 : 0.018;

  const points = path.map((p) => new THREE.Vector3(p.x, hz, p.y));
  const curve = new THREE.CatmullRomCurve3(points);

  return (
    <mesh>
      <tubeGeometry args={[curve, Math.max(path.length * 3, 8), r, 6, false]} />
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.45} />
    </mesh>
  );
}

function PipeJunction({ pos, hz, color }: { pos: Point; hz: number; color: string }) {
  return (
    <mesh position={[pos.x, hz, pos.y]}>
      <sphereGeometry args={[0.024, 8, 8]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
    </mesh>
  );
}

// ── Meubel-modellen (alle subcomponenten op module-niveau) ───────────────────

function BedModel({ w, d, color, pillows }: { w: number; d: number; color: string; pillows: number }) {
  const mw = w - 0.08; // matrasbreedte (iets ingezet)
  const md = d - 0.10;
  const duvetD = md * 0.65;
  return (
    <>
      {/* laag frame */}
      <mesh position={[0, 0.125, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.25, d]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* matras */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[mw, 0.20, md]} />
        <meshStandardMaterial color="#f8f4ef" roughness={0.9} />
      </mesh>
      {/* hoofdbord aan de korte zijde */}
      <mesh position={[0, 0.45, -d / 2 + 0.025]} castShadow>
        <boxGeometry args={[w, 0.9, 0.05]} />
        <meshStandardMaterial color={shade(color, 0.85)} roughness={0.8} />
      </mesh>
      {/* kussens tegen het hoofdbord */}
      {Array.from({ length: pillows }, (_, i) => (
        <mesh
          key={i}
          position={[pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (mw / 4), 0.50, -d / 2 + 0.30]}
          castShadow
        >
          <boxGeometry args={[Math.min(0.55, mw * 0.42), 0.10, 0.35]} />
          <meshStandardMaterial color="#fbf9f4" roughness={0.95} />
        </mesh>
      ))}
      {/* dekbed over ~65% vanaf het voeteneind */}
      <mesh position={[0, 0.47, d / 2 - 0.05 - duvetD / 2]} castShadow>
        <boxGeometry args={[mw + 0.04, 0.04, duvetD]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </>
  );
}

function SofaModel({ w, d, color, kind }: { w: number; d: number; color: string; kind: "sofa-2" | "sofa-3" | "sofa-l" }) {
  const isL = kind === "sofa-l";
  const mainD = isL ? Math.min(0.85, d * 0.55) : d; // diepte van het rechte deel
  const mainZ = -d / 2 + mainD / 2;
  const cushions = kind === "sofa-3" ? 3 : 2;
  const innerW = w - 0.24; // tussen de armleuningen
  const cw = innerW / cushions - 0.02;
  const cushD = mainD - 0.24;
  const cushZ = -d / 2 + 0.21 + cushD / 2;
  const cushionColor = shade(color, 1.08);
  const chaiseX = w / 2 - 0.51;
  return (
    <>
      {/* pootjes */}
      <group position={[0, 0, isL ? mainZ : 0]}>
        <CornerLegs w={w} d={mainD} />
      </group>
      {isL && (
        <>
          <mesh position={[chaiseX - 0.30, 0.04, d / 2 - 0.08]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.08, 10]} />
            <meshStandardMaterial color="#6b5a45" roughness={0.6} />
          </mesh>
          <mesh position={[chaiseX + 0.30, 0.04, d / 2 - 0.08]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.08, 10]} />
            <meshStandardMaterial color="#6b5a45" roughness={0.6} />
          </mesh>
        </>
      )}
      {/* zitbasis */}
      <mesh position={[0, 0.265, mainZ]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.37, mainD]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      {/* rugleuning langs de achterzijde */}
      <mesh position={[0, 0.465, -d / 2 + 0.09]} castShadow>
        <boxGeometry args={[w, 0.77, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      {/* armleuningen */}
      <mesh position={[-(w / 2 - 0.06), 0.365, mainZ]} castShadow>
        <boxGeometry args={[0.12, 0.57, mainD]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh position={[w / 2 - 0.06, 0.365, isL ? 0 : mainZ]} castShadow>
        <boxGeometry args={[0.12, 0.57, isL ? d : mainD]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      {/* zitkussens */}
      {Array.from({ length: cushions }, (_, i) => (
        <mesh
          key={i}
          position={[-innerW / 2 + (i + 0.5) * (innerW / cushions), 0.50, cushZ]}
          castShadow
        >
          <boxGeometry args={[cw, 0.12, cushD]} />
          <meshStandardMaterial color={cushionColor} roughness={0.9} />
        </mesh>
      ))}
      {/* chaise (haaks poot-segment) bij hoekbank */}
      {isL && (
        <>
          <mesh position={[chaiseX, 0.265, mainD / 2]} castShadow receiveShadow>
            <boxGeometry args={[0.78, 0.37, d - mainD]} />
            <meshStandardMaterial color={color} roughness={0.88} />
          </mesh>
          <mesh position={[chaiseX, 0.50, mainD / 2]} castShadow>
            <boxGeometry args={[0.70, 0.12, d - mainD - 0.08]} />
            <meshStandardMaterial color={cushionColor} roughness={0.9} />
          </mesh>
        </>
      )}
    </>
  );
}

function TableModel({ w, d, h, color, monitor = false }: { w: number; d: number; h: number; color: string; monitor?: boolean }) {
  return (
    <>
      {/* blad */}
      <mesh position={[0, h - 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.04, d]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <CornerLegs w={w} d={d} h={h - 0.04} r={0.03} inset={0.10} color={shade(color, 0.8)} />
      {monitor && (
        <>
          {/* monitorvoet */}
          <mesh position={[0, h + 0.05, -d / 2 + 0.14]} castShadow>
            <boxGeometry args={[0.10, 0.10, 0.06]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.5} />
          </mesh>
          {/* monitor-plaat */}
          <mesh position={[0, h + 0.25, -d / 2 + 0.14]} castShadow>
            <boxGeometry args={[0.45, 0.30, 0.02]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.4} />
          </mesh>
        </>
      )}
    </>
  );
}

function DiningChairModel({ w, d, color }: { w: number; d: number; color: string }) {
  return (
    <>
      <CornerLegs w={w} d={d} h={0.43} r={0.016} inset={0.04} color={shade(color, 0.8)} />
      {/* zitting */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[w, 0.04, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* rugleuning-plaat */}
      <mesh position={[0, 0.68, -d / 2 + 0.015]} castShadow>
        <boxGeometry args={[w - 0.04, 0.42, 0.03]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </>
  );
}

const OFFICE_LEG_ANGLES = [0, 1, 2, 3, 4].map((i) => (i * 2 * Math.PI) / 5);

function OfficeChairModel({ color }: { color: string }) {
  return (
    <>
      {/* 5 lage poot-cilinders rondom */}
      {OFFICE_LEG_ANGLES.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15]}
          rotation={[0, -a, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.018, 0.018, 0.28, 10]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* zuil */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.40, 12]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {/* zitting */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.48, 0.07, 0.48]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* rugleuning */}
      <mesh position={[0, 0.80, -0.22]} castShadow>
        <boxGeometry args={[0.45, 0.52, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </>
  );
}

function WardrobeModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  return (
    <>
      {/* korpus */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* verticale deurnaad */}
      <mesh position={[0, h / 2, d / 2 + 0.003]}>
        <boxGeometry args={[0.012, h - 0.08, 0.005]} />
        <meshStandardMaterial color={shade(color, 0.45)} roughness={0.9} />
      </mesh>
      {/* handgrepen */}
      <mesh position={[-0.05, h * 0.52, d / 2 + 0.012]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0.05, h * 0.52, d / 2 + 0.012]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </>
  );
}

function BookshelfModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  return (
    <>
      {/* zijwangen */}
      <mesh position={[-(w / 2 - 0.012), h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.024, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[w / 2 - 0.012, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.024, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* achterwand */}
      <mesh position={[0, h / 2, -d / 2 + 0.01]} receiveShadow>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial color={shade(color, 0.9)} roughness={0.85} />
      </mesh>
      {/* boven- en onderplank */}
      <mesh position={[0, h - 0.015, 0]} castShadow>
        <boxGeometry args={[w, 0.03, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[w, 0.03, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* 4 horizontale planken, open front */}
      {[1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, (h * i) / 5, 0.005]} castShadow>
          <boxGeometry args={[w - 0.05, 0.025, d - 0.03]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

function TvUnitModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const tvW = w * 0.7;
  const tvH = (tvW * 9) / 16;
  return (
    <>
      {/* laag korpus */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* deurnaden */}
      <mesh position={[-w / 6, h / 2, d / 2 + 0.003]}>
        <boxGeometry args={[0.01, h - 0.06, 0.005]} />
        <meshStandardMaterial color={shade(color, 0.45)} roughness={0.9} />
      </mesh>
      <mesh position={[w / 6, h / 2, d / 2 + 0.003]}>
        <boxGeometry args={[0.01, h - 0.06, 0.005]} />
        <meshStandardMaterial color={shade(color, 0.45)} roughness={0.9} />
      </mesh>
      {/* handgrepen (liggend) */}
      <mesh position={[-w / 6 - 0.07, h * 0.7, d / 2 + 0.012]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.007, 0.007, 0.09, 8]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[w / 6 + 0.07, h * 0.7, d / 2 + 0.012]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.007, 0.007, 0.09, 8]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {/* TV-voet + paneel */}
      <mesh position={[0, h + 0.02, -d * 0.1]}>
        <boxGeometry args={[0.35, 0.04, 0.16]} />
        <meshStandardMaterial color="#1c1e20" roughness={0.5} />
      </mesh>
      <mesh position={[0, h + 0.04 + tvH / 2, -d * 0.1]} castShadow>
        <boxGeometry args={[tvW, tvH, 0.03]} />
        <meshStandardMaterial color="#101214" roughness={0.3} metalness={0.2} />
      </mesh>
    </>
  );
}

function BathtubModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  // Kraantje op een korte zijde: bepaal welke as de lange is.
  const alongX = w >= d;
  const tapPos: [number, number, number] = alongX ? [w / 2 - 0.12, h, 0] : [0, h, d / 2 - 0.12];
  return (
    <>
      {/* buitenwand */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.05} />
      </mesh>
      {/* binnenkuip (witte bodem iets lager) */}
      <mesh position={[0, h - 0.10, 0]}>
        <boxGeometry args={[w - 0.16, 0.06, d - 0.16]} />
        <meshStandardMaterial {...WHITE_CERAMIC} />
      </mesh>
      {/* dunne lichte rand bovenop (4 strips) */}
      <mesh position={[0, h - 0.015, -(d / 2 - 0.05)]}>
        <boxGeometry args={[w, 0.03, 0.10]} />
        <meshStandardMaterial color="#f4f7f8" roughness={0.15} />
      </mesh>
      <mesh position={[0, h - 0.015, d / 2 - 0.05]}>
        <boxGeometry args={[w, 0.03, 0.10]} />
        <meshStandardMaterial color="#f4f7f8" roughness={0.15} />
      </mesh>
      <mesh position={[-(w / 2 - 0.05), h - 0.015, 0]}>
        <boxGeometry args={[0.10, 0.03, d - 0.20]} />
        <meshStandardMaterial color="#f4f7f8" roughness={0.15} />
      </mesh>
      <mesh position={[w / 2 - 0.05, h - 0.015, 0]}>
        <boxGeometry args={[0.10, 0.03, d - 0.20]} />
        <meshStandardMaterial color="#f4f7f8" roughness={0.15} />
      </mesh>
      {/* chroom kraantje */}
      <ChromeTap position={tapPos} h={0.14} />
    </>
  );
}

function ShowerCabinModel({ w, d }: { w: number; d: number }) {
  return (
    <>
      {/* douchebak */}
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color="#f2f4f4" roughness={0.3} />
      </mesh>
      {/* glazen wanden: achterzijde + zijkant */}
      <mesh position={[0, 1.05, -d / 2 + 0.01]}>
        <boxGeometry args={[w, 2.0, 0.02]} />
        <meshStandardMaterial {...GLASS} />
      </mesh>
      <mesh position={[-w / 2 + 0.01, 1.05, 0]}>
        <boxGeometry args={[0.02, 2.0, d]} />
        <meshStandardMaterial {...GLASS} />
      </mesh>
      <ShowerRiser x={-w / 2 + 0.10} z={-d / 2 + 0.10} />
    </>
  );
}

const HOB_PITS: [number, number][] = [
  [-0.12, -0.11],
  [0.12, -0.11],
  [-0.12, 0.11],
  [0.12, 0.11],
];

function KitchenIslandModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const topY = h - 0.02;
  const sinkX = -w / 4;
  const hobX = w / 4;
  return (
    <>
      {/* korpus (donkerder) */}
      <mesh position={[0, (h - 0.04) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h - 0.04, d]} />
        <meshStandardMaterial color={shade(color, 0.8)} roughness={0.85} />
      </mesh>
      {/* werkblad, steekt 0.02 over */}
      <mesh position={[0, topY, 0]} castShadow>
        <boxGeometry args={[w + 0.04, 0.04, d + 0.04]} />
        <meshStandardMaterial color={shade(color, 1.12)} roughness={0.45} />
      </mesh>
      {/* spoelbak (ingezet, donkergrijs) */}
      <mesh position={[sinkX, topY + 0.021, 0.02]}>
        <boxGeometry args={[Math.min(0.42, w * 0.32), 0.012, Math.min(0.38, d * 0.42)]} />
        <meshStandardMaterial color="#54585c" roughness={0.35} metalness={0.55} />
      </mesh>
      {/* kraan: 2 cilindertjes haaks */}
      <ChromeTap position={[sinkX, h, -Math.min(0.26, d * 0.30)]} h={0.28} />
      {/* kookplaat */}
      <mesh position={[hobX, topY + 0.021, 0]}>
        <boxGeometry args={[Math.min(0.55, w * 0.40), 0.012, Math.min(0.50, d * 0.55)]} />
        <meshStandardMaterial color="#16181a" roughness={0.3} metalness={0.2} />
      </mesh>
      {HOB_PITS.map(([px, pz], i) => (
        <mesh key={i} position={[hobX + px, topY + 0.03, pz]}>
          <cylinderGeometry args={[0.06, 0.06, 0.006, 16]} />
          <meshStandardMaterial color="#2e3134" roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

function KitchenCabinetModel({ w, d, h, color, mountY = 0, worktop = false }: {
  w: number; d: number; h: number; color: string; mountY?: number; worktop?: boolean;
}) {
  return (
    <>
      {/* korpus */}
      <mesh position={[0, mountY + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* aanrechtblad */}
      {worktop && (
        <mesh position={[0, mountY + h + 0.02, 0]} castShadow>
          <boxGeometry args={[w + 0.02, 0.04, d + 0.02]} />
          <meshStandardMaterial color={shade(color, 1.12)} roughness={0.45} />
        </mesh>
      )}
      {/* greep langs de voorzijde */}
      <mesh position={[0, mountY + h * 0.5, d / 2 + 0.012]} castShadow>
        <boxGeometry args={[0.14, 0.02, 0.02]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </>
  );
}

function FurnitureMesh3D({
  item,
  selected = false,
  gizmoMode = "translate",
}: {
  item: Furniture;
  selected?: boolean;
  gizmoMode?: "translate" | "rotate";
}) {
  const groupRef = useRef<THREE.Group>(null);
  const def = FURNITURE_DEFAULTS[item.kind];
  const w = item.width ?? def.w;
  const d = item.depth ?? def.d;
  const h = def.h;
  const color = item.color ?? def.color;
  const rotY = -(item.rotation * Math.PI) / 180;
  const kind = item.kind;

  let model: ReactNode;
  if (kind === "bed-single" || kind === "bed-double" || kind === "bed-king") {
    model = <BedModel w={w} d={d} color={color} pillows={kind === "bed-single" ? 1 : 2} />;
  } else if (kind === "sofa-2" || kind === "sofa-3" || kind === "sofa-l") {
    model = <SofaModel w={w} d={d} color={color} kind={kind} />;
  } else if (kind === "dining-table" || kind === "coffee-table" || kind === "desk") {
    model = <TableModel w={w} d={d} h={h} color={color} monitor={kind === "desk"} />;
  } else if (kind === "dining-chair") {
    model = <DiningChairModel w={w} d={d} color={color} />;
  } else if (kind === "office-chair") {
    model = <OfficeChairModel color={color} />;
  } else if (kind === "wardrobe") {
    model = <WardrobeModel w={w} d={d} h={h} color={color} />;
  } else if (kind === "bookshelf") {
    model = <BookshelfModel w={w} d={d} h={h} color={color} />;
  } else if (kind === "tv-unit") {
    model = <TvUnitModel w={w} d={d} h={h} color={color} />;
  } else if (kind === "bathtub") {
    model = <BathtubModel w={w} d={d} h={h} color={color} />;
  } else if (kind === "shower-cabin") {
    model = <ShowerCabinModel w={w} d={d} />;
  } else if (kind === "kitchen-island") {
    model = <KitchenIslandModel w={w} d={d} h={h} color={color} />;
  } else if (kind === "kitchen-upper") {
    model = <KitchenCabinetModel w={w} d={d} h={h} color={color} mountY={1.5} />;
  } else if (kind === "kitchen-base" || kind === "kitchen-corner") {
    model = <KitchenCabinetModel w={w} d={d} h={h} color={color} worktop />;
  } else {
    // kitchen-high
    model = <KitchenCabinetModel w={w} d={d} h={h} color={color} />;
  }

  const group = (
    <group
      ref={groupRef}
      position={[item.position.x, 0, item.position.y]}
      rotation={[0, rotY, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        use3DEdit.getState().setSelectedItem({
          kind: "furniture",
          id: item.id,
          label: def.label,
          screenX: e.nativeEvent.clientX,
          screenY: e.nativeEvent.clientY,
        });
      }}
    >
      {model}
    </group>
  );

  if (!selected) return group;

  return (
    <TransformControls
      mode={gizmoMode}
      showX={gizmoMode === "translate"}
      showZ={gizmoMode === "translate"}
      showY={gizmoMode === "rotate"}
      onMouseUp={() => {
        const g = groupRef.current;
        if (!g) return;
        const deg = (((-g.rotation.y * 180) / Math.PI) % 360 + 360) % 360;
        void dbUpdate("furniture", item.id, {
          position: { x: g.position.x, y: g.position.z },
          rotation: deg,
        });
      }}
    >
      {group}
    </TransformControls>
  );
}

function HvacMesh3D({ item }: { item: HvacItem }) {
  if (!item.position) return null;

  if (item.type === "radiator") {
    return (
      <group position={[item.position.x, 0.55, item.position.y]}>
        {/* Hoofdlichaam radiator */}
        <mesh castShadow>
          <boxGeometry args={[1.0, 0.60, 0.08]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.4} metalness={0.2} />
        </mesh>
        {/* Ribben */}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[-0.43 + i * 0.124, 0, 0.04]}>
            <boxGeometry args={[0.06, 0.56, 0.02]} />
            <meshStandardMaterial color="#ddd8ce" roughness={0.5} metalness={0.15} />
          </mesh>
        ))}
      </group>
    );
  }

  if (item.type === "floor-heating") {
    return (
      <mesh position={[item.position.x, 0.005, item.position.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.0, 1.0]} />
        <meshStandardMaterial color="#e8a060" transparent opacity={0.25} roughness={1} />
      </mesh>
    );
  }

  return null;
}

// ── Bouwkundige elementen (trap, kolom, balk) ────────────────────────────────

const CONSTRUCTION_MATERIAL_COLOR: Record<string, string> = {
  brick: "#b08968",
  "sand-lime": "#e0ddd5",
  concrete: "#a8a8a8",
  "aerated-concrete": "#dcd8cf",
  "timber-frame": "#c9a96e",
  gypsum: "#e8e4dc",
  other: "#b0b0b0",
};

const STAIR_COLOR = "#c9b8a0";

function StaircaseModel3D({ stair, totalRise }: { stair: Staircase; totalRise: number }) {
  const rotY = -(stair.rotation * Math.PI) / 180;
  const n = Math.max(2, Math.round(stair.steps));
  const w = stair.width;
  const riser = totalRise / n;
  // Treden zijn hout: nerf over de breedte van de trede.
  const stairSurface = useMemo(() => makeSurface("wood", w, stair.run, STAIR_COLOR), [w, stair.run]);

  if (stair.kind === "spiral") {
    const R = Math.max(w, stair.run) / 2;
    return (
      <group position={[stair.position.x + R, 0, stair.position.y + R]} rotation={[0, rotY, 0]}>
        <mesh position={[0, totalRise / 2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, totalRise, 12]} />
          <meshStandardMaterial color="#8a7a60" roughness={0.7} />
        </mesh>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <mesh key={i} position={[(Math.cos(a) * R) / 2, (i + 1) * riser - riser / 2, (Math.sin(a) * R) / 2]} rotation={[0, -a, 0]} castShadow receiveShadow>
              <boxGeometry args={[R, 0.05, R * 0.5]} />
              <meshStandardMaterial color={STAIR_COLOR} roughness={0.7} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (stair.kind === "l-shape") {
    const half = Math.round(n / 2);
    const depthA = (stair.run - w) / Math.max(1, half);
    const baseH = half * riser;
    const depthB = (stair.run - w) / Math.max(1, n - half);
    return (
      <group position={[stair.position.x, 0, stair.position.y]} rotation={[0, rotY, 0]}>
        {Array.from({ length: half }, (_, i) => (
          <mesh key={`a${i}`} position={[w / 2, ((i + 1) * riser) / 2, i * depthA + depthA / 2]} castShadow receiveShadow>
            <boxGeometry args={[w, (i + 1) * riser, depthA]} />
            <meshStandardMaterial color={STAIR_COLOR} roughness={0.7} />
          </mesh>
        ))}
        {Array.from({ length: n - half }, (_, i) => (
          <mesh key={`b${i}`} position={[w + i * depthB + depthB / 2, (baseH + (i + 1) * riser) / 2, stair.run - w / 2]} castShadow receiveShadow>
            <boxGeometry args={[depthB, baseH + (i + 1) * riser, w]} />
            <meshStandardMaterial color={STAIR_COLOR} roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  }

  // straight
  const depth = stair.run / n;
  return (
    <group position={[stair.position.x, 0, stair.position.y]} rotation={[0, rotY, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[w / 2, ((i + 1) * riser) / 2, i * depth + depth / 2]} castShadow receiveShadow>
          <boxGeometry args={[w, (i + 1) * riser, depth]} />
          <meshStandardMaterial
            color={STAIR_COLOR}
            map={stairSurface.map}
            normalMap={stairSurface.normalMap}
            roughness={stairSurface.roughness}
          />
        </mesh>
      ))}
    </group>
  );
}

function ColumnModel3D({ col, levelHeight }: { col: Column; levelHeight: number }) {
  const h = col.height ?? levelHeight;
  const color = col.color ?? CONSTRUCTION_MATERIAL_COLOR[col.material] ?? "#a8a8a8";
  const surface = useMemo(
    () => makeSurface(surfaceForWallMaterial(col.material), col.size * 4, h, color),
    [col.material, col.size, h, color],
  );
  // De textuur draagt de kleur al; nog eens vermenigvuldigen maakt hem dubbel donker.
  return (
    <group position={[col.position.x, 0, col.position.y]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        {col.shape === "round" ? (
          <cylinderGeometry args={[col.size / 2, col.size / 2, h, 20]} />
        ) : (
          <boxGeometry args={[col.size, h, col.size]} />
        )}
        <meshStandardMaterial
          map={surface.map}
          normalMap={surface.normalMap}
          roughness={surface.roughness}
          metalness={surface.metalness}
        />
      </mesh>
    </group>
  );
}

function BeamModel3D({ beam }: { beam: Beam }) {
  const section = findSection(beam.profile);
  const dims = section ?? BEAM_PROFILE_DIMS[beam.profile] ?? { h: 0.1, w: 0.1 };
  const isOak = beam.material === "oak";
  const isTimber = isOak || section?.material === "timber";
  const len = dist(beam.start, beam.end);
  const fw = beam.width ?? dims.w;
  const fh = isOak ? beam.depth ?? 0.25 : dims.h;

  // De herhaling volgt de werkelijke lengte, dus de nerf loopt in de lengte-
  // richting van de balk — dwarse nerf ziet er meteen verkeerd uit.
  const surface = useMemo(
    () =>
      isTimber
        ? makeSurface("wood-beam", Math.max(0.2, len), fh)
        : makeSurface("steel", Math.max(0.2, len), fh),
    [isTimber, len, fh],
  );

  if (len < 0.01) return null;
  const cx = (beam.start.x + beam.end.x) / 2;
  const cz = (beam.start.y + beam.end.y) / 2;
  const rotY = -angle(beam.start, beam.end);
  const mat = (
    <meshStandardMaterial
      map={surface.map}
      normalMap={surface.normalMap}
      roughness={surface.roughness}
      metalness={surface.metalness}
    />
  );

  // Eiken balk / spantbeen, eventueel schuin (heightEnd)
  if (isOak) {
    const h1 = beam.heightEnd ?? beam.height;
    const L3 = Math.hypot(len, h1 - beam.height);
    const tilt = Math.atan2(h1 - beam.height, len);
    return (
      <group position={[cx, (beam.height + h1) / 2, cz]} rotation={[0, rotY, 0]}>
        <mesh rotation={[0, 0, tilt]} castShadow receiveShadow>
          <boxGeometry args={[L3, fh, fw]} />
          <meshStandardMaterial map={surface.map} normalMap={surface.normalMap} roughness={surface.roughness} color="#c9a274" />
        </mesh>
      </group>
    );
  }

  // Hout is massief; alleen staal heeft een I-profiel met flenzen en lijf.
  if (isTimber) {
    return (
      <group position={[cx, beam.height, cz]} rotation={[0, rotY, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[len, fh, fw]} />
          {mat}
        </mesh>
      </group>
    );
  }

  const flT = fh * 0.15;
  return (
    <group position={[cx, beam.height, cz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, fh / 2 - flT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, flT, fw]} />
        {mat}
      </mesh>
      <mesh position={[0, -fh / 2 + flT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, flT, fw]} />
        {mat}
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[len, fh - 2 * flT, fw * 0.12]} />
        {mat}
      </mesh>
    </group>
  );
}

// ── Dak ───────────────────────────────────────────────────────────────────────

const ROOF_COLOR = "#9b4a3a"; // terracotta

const ROOF_THICKNESS: Record<NonNullable<Roof["covering"]>, number> = { reed: 0.35, tiles: 0.1, panels: 0.12, plain: 0.04 };

function RoofMesh3D({
  roof,
  walls,
  dormers,
  baseY,
  realistic,
}: {
  roof: Roof;
  walls: Wall[];
  dormers: Dormer[];
  baseY: number;
  realistic: boolean;
}) {
  const fp = useMemo(() => roofFootprint(roof, walls), [roof, walls]);
  const W = fp?.W ?? 0;
  const D = fp?.D ?? 0;
  const isGable = roof.type === "gable" || roof.type === "mansard";
  // Met een expliciete dakbedekking (riet, pannen, panelen) tekenen we een dik
  // dakpakket met eigen textuur; anders het standaard pannendak.
  const covering = realistic && roof.covering && roof.covering !== "plain" ? roof.covering : null;
  const color = roof.color ?? ROOF_COLOR;
  const t = covering ? ROOF_THICKNESS[covering] : 0;

  const built = useMemo(() => {
    if (!fp) return null;
    const opts = { gableEnds: roof.gableEnds ?? true, hipStart: isGable ? roof.hipStart : undefined, hipEnd: isGable ? roof.hipEnd : undefined };
    const raw = buildRoof(roof.type, Math.max(0.5, W), Math.max(0.5, D), roof.pitch, roof.overhang, opts);
    // Dakkapellen snijden hun footprint uit het dakvlak. Zonder dat gat kijk je
    // vanaf de zolder nog steeds tegen het dak aan en levert de kapel niets op.
    const m = cutRoofHoles(raw, dormerHoles(roof, fp, dormers));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
    // UV's staan in meters, zodat de pannen over de nok doorlopen zonder te
    // verspringen en overal even groot zijn.
    g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uvs, 2));
    g.setIndex(m.indices);
    g.computeVertexNormals();
    if (!covering) return { m, under: g, top: null as THREE.BufferGeometry | null, edges: null as THREE.BufferGeometry | null };

    // Dik dakpakket: bovenvlak (verschoven over de dikte) met UV's per vlak in
    // de afschotrichting, plus een rand langs alle vrije randen.
    const P = (i: number) => new THREE.Vector3(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const tile = ROOF_TILE_SIZE[covering];
    const up = new THREE.Vector3(0, t, 0);
    const topPos: number[] = [];
    const topUv: number[] = [];
    const edgeCount = new Map<string, [THREE.Vector3, THREE.Vector3, number]>();
    for (let k = 0; k < m.indices.length; k += 3) {
      const pts = [P(m.indices[k]), P(m.indices[k + 1]), P(m.indices[k + 2])];
      const [p0, p1, p2] = pts.map((p) => p.clone().add(up));
      const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
      if (n.y < 0) n.negate();
      const g0 = new THREE.Vector3(0, -1, 0);
      const d = g0.clone().sub(n.clone().multiplyScalar(g0.dot(n)));
      if (d.length() < 1e-6) d.set(0, 0, 1);
      d.normalize();
      const sv = new THREE.Vector3().crossVectors(n, d).normalize();
      for (const p of [p0, p1, p2]) {
        topPos.push(p.x, p.y, p.z);
        topUv.push(p.dot(sv) / tile.w, p.dot(d) / tile.h);
      }
      for (let e = 0; e < 3; e++) {
        const a = pts[e];
        const b2 = pts[(e + 1) % 3];
        const ka = key(a);
        const kb = key(b2);
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const cur = edgeCount.get(ek);
        edgeCount.set(ek, cur ? [cur[0], cur[1], cur[2] + 1] : [a, b2, 1]);
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute("position", new THREE.Float32BufferAttribute(topPos, 3));
    top.setAttribute("uv", new THREE.Float32BufferAttribute(topUv, 2));
    top.computeVertexNormals();
    const ePos: number[] = [];
    const eUv: number[] = [];
    for (const [pa, pb, c] of edgeCount.values()) {
      if (c !== 1) continue;
      const len = pa.distanceTo(pb);
      const quad = [pa, pb, pb.clone().add(up), pa, pb.clone().add(up), pa.clone().add(up)];
      const uv = [[0, 0], [len, 0], [len, t], [0, 0], [len, t], [0, t]];
      quad.forEach((q, i) => {
        ePos.push(q.x, q.y, q.z);
        eUv.push(uv[i][0] / tile.w, uv[i][1] / tile.h);
      });
    }
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
    edges.setAttribute("uv", new THREE.Float32BufferAttribute(eUv, 2));
    edges.computeVertexNormals();
    return { m, under: g, top, edges };
  }, [roof, fp, W, D, dormers, isGable, covering, t]);

  // Buitenkant pannen, binnenkant dakbeschot — dat is wat je vanaf de zolder
  // ziet, en het maakt de kap als ruimte herkenbaar.
  const tiles = useMemo(() => makeSurfaceMeterUv("roof-tile", color), [color]);
  const boarding = useMemo(() => makeSurfaceMeterUv("wood", "#c2a172"), []);
  const tex = useMemo(() => (covering ? roofTextures(covering, color) : null), [covering, color]);

  if (!fp || !built || W <= 0.5 || D <= 0.5) return null;
  const rotY = -(roof.ridgeDirection * Math.PI) / 180;
  const y = roof.baseHeight ?? baseY;
  const m = built.m;

  if (!covering) {
    return (
      <group position={[fp.center.x, y, fp.center.y]} rotation={[0, rotY, 0]}>
        <mesh geometry={built.under} castShadow receiveShadow>
          <meshStandardMaterial map={tiles.map} normalMap={tiles.normalMap} roughness={tiles.roughness} metalness={tiles.metalness} side={THREE.FrontSide} />
        </mesh>
        <mesh geometry={built.under} receiveShadow>
          <meshStandardMaterial map={boarding.map} normalMap={boarding.normalMap} roughness={boarding.roughness} side={THREE.BackSide} />
        </mesh>
      </group>
    );
  }

  const ridgeLen = m.ridgeEnd - m.ridgeStart;
  const ridgeColor = roof.ridgeColor ?? shade(color, 0.8);
  const edgeColor = covering === "tiles" ? "#1c1d1f" : undefined;
  const pitch = (roof.pitch * Math.PI) / 180;

  return (
    <group position={[fp.center.x, y, fp.center.y]} rotation={[0, rotY, 0]}>
      {/* onderzijde: dakbeschot, zichtbaar vanaf de zolder */}
      <mesh geometry={built.under} receiveShadow>
        <meshStandardMaterial map={boarding.map} normalMap={boarding.normalMap} roughness={boarding.roughness} side={THREE.DoubleSide} />
      </mesh>
      {built.top && (
        <mesh geometry={built.top} castShadow receiveShadow>
          <meshStandardMaterial
            map={tex?.map ?? undefined}
            bumpMap={tex?.bump ?? undefined}
            bumpScale={covering === "tiles" ? 3 : 1.2}
            color={tex ? "#ffffff" : color}
            roughness={covering === "reed" ? 0.97 : covering === "tiles" ? 0.5 : 0.6}
            metalness={covering === "panels" ? 0.3 : 0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {built.edges && (
        <mesh geometry={built.edges} castShadow>
          <meshStandardMaterial map={edgeColor ? undefined : tex?.map ?? undefined} color={edgeColor ?? (tex ? "#c8c0b0" : color)} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {isGable && (
        // nokafwerking
        <mesh position={[(m.ridgeStart + m.ridgeEnd) / 2, m.ridgeHeight + t + 0.02, 0]} rotation={[Math.PI / 4, 0, 0]} castShadow>
          <boxGeometry args={[ridgeLen + (covering === "reed" ? 0.2 : 0.05), covering === "reed" ? 0.3 : 0.18, covering === "reed" ? 0.3 : 0.18]} />
          <meshStandardMaterial color={ridgeColor} roughness={0.45} metalness={covering === "reed" ? 0.5 : 0.1} />
        </mesh>
      )}
      {isGable &&
        dormers
          .filter((dm) => dm.type === "velux")
          .map((dm) => {
            const lp = toRoofLocal(dm.position, roof, fp);
            const hh = gableRoofHeightAt(W, D, roof.pitch, roof.overhang, lp.x, lp.y, { hipStart: roof.hipStart, hipEnd: roof.hipEnd });
            const sgn = lp.y >= 0 ? 1 : -1;
            return (
              <group key={dm.id} position={[lp.x, hh + t + 0.03, lp.y]} rotation={[sgn * pitch, 0, 0]}>
                <mesh castShadow>
                  <boxGeometry args={[dm.width + 0.1, 0.09, dm.height + 0.1]} />
                  <meshStandardMaterial color="#45494e" roughness={0.5} metalness={0.3} />
                </mesh>
                <mesh position={[0, 0.05, 0]}>
                  <boxGeometry args={[dm.width - 0.08, 0.01, dm.height - 0.08]} />
                  <meshStandardMaterial color="#2a3a46" roughness={0.05} metalness={0.6} />
                </mesh>
              </group>
            );
          })}
    </group>
  );
}

/**
 * Een dakkapel hoort op het dakvlak te staan, niet op de zoldervloer. We zoeken
 * de dakhoogte op de dakvoet-zijde van de kapel en zetten hem daarop; de
 * achterkant verdwijnt dan vanzelf in de kap, precies zoals in het echt.
 */
function DormerMesh3D({
  dormer,
  roof,
  fp,
  baseY,
}: {
  dormer: Dormer;
  roof: Roof | null;
  fp: RoofFootprint | null;
  baseY: number;
}) {
  const w = dormer.width;
  const h = dormer.height;

  // Positie in het dakstelsel, en de richting waarin de kapel naar buiten kijkt.
  const local = roof && fp ? toRoofLocal(dormer.position, roof, fp) : null;
  const rotY = roof ? -(roof.ridgeDirection * Math.PI) / 180 : 0;
  // Aan de kant van de nok waar de kapel staat kijkt hij naar buiten; aan de
  // andere kant staat hij een halve slag om.
  const outward = local && local.y < 0 ? -1 : 1;
  const heightAt = (z: number) =>
    roof && fp && local
      ? roofHeightAt(roof.type, fp.W, fp.D, roof.pitch, roof.overhang, { x: local.x, y: z }, { hipStart: roof.hipStart, hipEnd: roof.hipEnd })
      : 0;

  if (dormer.type === "velux") {
    // Een dakraam ligt ín het dakvlak: zelfde helling, zelfde hoogte.
    const y = baseY + heightAt(local?.y ?? 0);
    const tilt = roof && roof.type !== "flat" ? (roof.pitch * Math.PI) / 180 : 0;
    return (
      <group position={[dormer.position.x, y, dormer.position.y]} rotation={[0, rotY, 0]}>
        <group rotation={[0, outward > 0 ? 0 : Math.PI, 0]}>
          <mesh rotation={[-tilt, 0, 0]} position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[w, 0.04, h]} />
            <meshStandardMaterial color="#2b3a44" roughness={0.2} metalness={0.3} />
          </mesh>
        </group>
      </group>
    );
  }

  // gable / shed dakkapel: kubus met een donker dakje, staand op het dakvlak ter
  // hoogte van zijn voorkant.
  const depth = DORMER_DEPTH_M;
  const front = (local?.y ?? 0) + outward * (depth / 2);
  const y = baseY + heightAt(front);

  return (
    <group position={[dormer.position.x, y, dormer.position.y]} rotation={[0, rotY, 0]}>
      <group rotation={[0, outward > 0 ? 0 : Math.PI, 0]}>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#e8e2d6" roughness={0.7} />
        </mesh>
        {/* venster */}
        <mesh position={[0, h / 2, depth / 2 + 0.01]}>
          <boxGeometry args={[w * 0.7, h * 0.6, 0.02]} />
          <meshStandardMaterial {...GLASS} />
        </mesh>
        {/* dakje */}
        <mesh position={[0, h + 0.08, 0]} castShadow>
          <boxGeometry args={[w + 0.1, 0.06, depth + 0.1]} />
          <meshStandardMaterial color={ROOF_COLOR} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}

function FloorPlane({ levelId, elevation }: { levelId: string; elevation: number }) {
  const { mode, furnitureKind, electricalType, plumbingFixture, hvacType, reset } = use3DEdit();
  const active = mode !== "none";

  async function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!active) return;
    e.stopPropagation();
    const x = e.point.x;
    const z = e.point.z;

    if (mode === "place-furniture" && furnitureKind) {
      await dbCreate<Furniture>("furniture", {
        levelId,
        kind: furnitureKind,
        position: { x, y: z },
        rotation: 0,
      });
    } else if (mode === "place-electrical" && electricalType) {
      const isLight = electricalType === "light" || electricalType === "spot";
      await dbCreate<ElectricalItem>("electrical", {
        levelId,
        type: electricalType,
        position: { x, y: z },
        heightZ: isLight ? 2.4 : 0.3,
      });
    } else if (mode === "place-plumbing" && plumbingFixture) {
      await dbCreate<PlumbingItem>("plumbing", {
        levelId,
        type: "fixture",
        fixture: plumbingFixture,
        position: { x, y: z },
        heightZ: 0.9,
      });
    } else if (mode === "place-hvac" && hvacType) {
      await dbCreate<HvacItem>("hvac", {
        levelId,
        type: hvacType,
        position: { x, y: z },
        heightZ: hvacType === "radiator" ? 0.3 : hvacType === "ventilation" ? 2.3 : 0,
      });
    }

    if (!e.nativeEvent.shiftKey) reset();
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, elevation + 0.001, 0]}
      onClick={handleClick}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function LevelScene({
  level,
  visibleLayers,
  phaseOrders,
  selectedFurnitureId,
  gizmoMode,
  realistic,
}: {
  level: Level;
  visibleLayers: Record<string, boolean>;
  phaseOrders: Map<string, number>;
  selectedFurnitureId: string | null;
  gizmoMode: "translate" | "rotate";
  realistic: boolean;
}) {
  // 4D: bij een gekozen bouwstap alleen tonen wat er op dat moment staat.
  const step = useBuildSequence((s) => s.step);
  const at = (span: Span) => visibleAt(span, step);
  const fixed = (appear: number): Span => ({ appear });

  const wallsRaw = useWalls(level.id);
  const allWalls = useMemo(() => wallsRaw ?? [], [wallsRaw]);
  // Gememoiseerd: wallColorById hangt hiervan af en is relatief duur.
  const walls = useMemo(
    () => allWalls.filter((w) => visibleAt(wallSpan(w, phaseOrders), step)),
    [allWalls, phaseOrders, step],
  );
  const electrical = (useElectrical(level.id) ?? []).filter((e) => at(electricalSpan(e)));
  const openings = useOpenings(level.id) ?? [];
  const rooms = useRooms(level.id) ?? [];
  const plumbing = (usePlumbing(level.id) ?? []).filter((p) => at(plumbingSpan(p)));
  const furniture = (useFurniture(level.id) ?? []).filter(() => at(fixed(STEP.finishing)));
  const hvac = (useHvac(level.id) ?? []).filter((h) => at(hvacSpan(h)));
  const stairs = (useStairs(level.id) ?? []).filter(() => at(fixed(STEP.shell)));
  const columns = (useColumns(level.id) ?? []).filter(() => at(fixed(STEP.structural)));
  const beams = (useBeams(level.id) ?? []).filter(() => at(fixed(STEP.structural)));
  const roofsRaw = useRoofs(level.id);
  const roofs = (roofsRaw ?? []).filter(() => at(fixed(STEP.shell)));
  const roofIds = useMemo(() => (roofsRaw ?? []).map((r) => r.id), [roofsRaw]);
  const dormers = (useDormers(roofIds) ?? []).filter(() => at(fixed(STEP.shell)));

  const openingsByWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const op of openings) {
      const list = m.get(op.wallId) ?? [];
      list.push(op);
      m.set(op.wallId, list);
    }
    return m;
  }, [openings]);


  const elev = level.elevation;

  // Bepaal wandkleur: gebruik de wandkleur van de aangrenzende ruimte.
  // Een muur hoort bij een ruimte als beide eindpunten dicht bij een
  // polygon-zijde van die ruimte liggen.
  const wallColorById = useMemo(() => {
    const m = new Map<string, string>();
    const NEAR = 0.35; // m
    const onRoomEdge = (p: Point, poly: Point[]) => {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (projectOnSegment(p, a, b).dist < NEAR) return true;
      }
      return false;
    };
    for (const w of walls) {
      for (const r of rooms) {
        if (!r.wallColor || r.polygon.length < 3) continue;
        if (onRoomEdge(w.start, r.polygon) && onRoomEdge(w.end, r.polygon)) {
          m.set(w.id, r.wallColor);
          break;
        }
      }
    }
    return m;
  }, [walls, rooms]);

  // Buitenzijde per muur (voor gevelafwerking en de plaats van kozijnen).
  const outsideById = useMemo(() => {
    const m = new Map<string, number>();
    const pts = allWalls.flatMap((w) => [w.start, w.end]);
    const c = pts.length ? polygonCentroid(pts) : { x: 0, y: 0 };
    for (const w of allWalls) m.set(w.id, wallOutsideSign(w, rooms, c));
    return m;
  }, [allWalls, rooms]);

  return (
    <group position={[0, elev, 0]}>
      {visibleLayers.rooms &&
        rooms
          .filter((r) => r.polygon.length >= 3)
          .map((r) => (
            <group key={r.id}>
              <RoomFloor3D room={r} />
              {!r.noCeiling && <RoomCeiling3D room={r} height={level.height} />}
            </group>
          ))}
      {visibleLayers.structure &&
        walls.map((w) => (
          <WallMesh
            key={w.id}
            wall={w}
            openings={openingsByWall.get(w.id) ?? NO_OPENINGS}
            wallColor={wallColorById.get(w.id)}
            outside={outsideById.get(w.id) ?? 0}
            realistic={realistic}
            highlight={activeAt(wallSpan(w, phaseOrders), step)}
          />
        ))}
      {visibleLayers.electrical &&
        electrical.map((it) => <ElectricalMarker key={it.id} item={it} />)}
      {visibleLayers.plumbing &&
        plumbing.map((it) =>
          it.type === "fixture" || !it.path || it.path.length < 2 ? (
            <PlumbingMarker key={it.id} item={it} />
          ) : (
            <group key={it.id}>
              <PipePath3D item={it} />
              {it.path.map((p, i) => (
                <PipeJunction
                  key={i}
                  pos={p}
                  hz={it.heightZ ?? 0.3}
                  color={
                    it.type === "supply-cold" ? "#3b82f6"
                      : it.type === "supply-hot" ? "#ef4444"
                      : "#9333ea"
                  }
                />
              ))}
            </group>
          ),
        )}
      {visibleLayers.furniture &&
        furniture.map((it) => (
          <FurnitureMesh3D
            key={it.id}
            item={it}
            selected={it.id === selectedFurnitureId}
            gizmoMode={gizmoMode}
          />
        ))}
      {visibleLayers.hvac &&
        hvac.map((it) => <HvacMesh3D key={it.id} item={it} />)}
      {visibleLayers.construction && (
        <>
          {stairs.map((s) => (
            <StaircaseModel3D key={s.id} stair={s} totalRise={level.height} />
          ))}
          {columns.map((c) => (
            <ColumnModel3D key={c.id} col={c} levelHeight={level.height} />
          ))}
          {beams.map((b) => (
            <BeamModel3D key={b.id} beam={b} />
          ))}
        </>
      )}
      {visibleLayers.roof && (
        <>
          {roofs.map((r) => (
            <RoofMesh3D
              key={r.id}
              roof={r}
              walls={allWalls}
              dormers={dormers.filter((d) => d.roofId === r.id)}
              baseY={level.height}
              realistic={realistic}
            />
          ))}
          {dormers.map((dm) => {
            const host = roofs.find((r) => r.id === dm.roofId) ?? null;
            // Dakramen in een dak met dakbedekking tekent RoofMesh3D zelf (op het dikke dakpakket).
            if (dm.type === "velux" && realistic && host?.covering && host.covering !== "plain" && (host.type === "gable" || host.type === "mansard")) return null;
            return (
              <DormerMesh3D
                key={dm.id}
                dormer={dm}
                roof={host}
                fp={host ? roofFootprint(host, allWalls) : null}
                baseY={level.height}
              />
            );
          })}
        </>
      )}
    </group>
  );
}

export function Scene3D() {
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const project = useProject();
  const editMode = use3DEdit((s) => s.mode);
  const phasesRaw = usePhases(project?.id);
  const phaseOrders = useMemo(() => phaseOrderMap(phasesRaw ?? []), [phasesRaw]);
  const phases = phasesRaw ?? [];
  const selectedItem = use3DEdit((s) => s.selectedItem);
  const [walkMode, setWalkMode] = useState(false);
  const [dayMode, setDayMode] = useState(true);
  const [realistic, setRealistic] = useState(true);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");

  // Zonnestand
  const [sunDate, setSunDate] = useState("2026-06-21");
  const [sunHour, setSunHour] = useState(13);
  const lat = project?.lat ?? 52.3;
  const lng = project?.lng ?? 5.3;
  const sunVec = useMemo(() => {
    const dt = new Date(`${sunDate}T00:00:00`);
    dt.setMinutes(Math.round(sunHour * 60));
    return sunDirection(dt, lat, lng);
  }, [sunDate, sunHour, lat, lng]);
  const sunUp = sunVec[1] > 0.02;

  // Screenshot + clip-plane
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipX, setClipX] = useState(0);

  // Globaal snijvlak langs de X-as. Via de renderer-ref (mutatie van een ref
  // is toegestaan; de renderer uit useThree mag niet gemuteerd worden).
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    gl.localClippingEnabled = clipEnabled;
    gl.clippingPlanes = clipEnabled ? [new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipX)] : [];
  }, [clipEnabled, clipX]);

  const selectedFurnitureId =
    editMode === "none" && !walkMode && selectedItem?.kind === "furniture"
      ? selectedItem.id
      : null;

  async function takeScreenshot() {
    const gl = glRef.current;
    if (!gl) return;
    const blob = await new Promise<Blob | null>((res) =>
      gl.domElement.toBlob((b) => res(b), "image/png"),
    );
    if (blob) downloadBlob(blob, `${(project?.name ?? "3d").replace(/\s+/g, "_")}_3d.png`);
  }

  // T = verplaatsen, R = roteren (alleen met een geselecteerd meubel).
  useEffect(() => {
    if (!selectedFurnitureId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "t" || e.key === "T") setGizmoMode("translate");
      if (e.key === "r" || e.key === "R") setGizmoMode("rotate");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFurnitureId]);

  const levels = useLiveQuery(
    async () => {
      if (!project?.id) return [];
      const rows = await getDB().levels.where("projectId").equals(project.id).sortBy("order");
      return rows.filter((l) => !l.deleted);
    },
    [project?.id],
    [] as Level[],
  );

  // Klik-vlak voor 3D-plaatsing hoort bij de actieve verdieping. Eén vlak —
  // niet één per laag — anders vangt het bovenste vlak alle kliks op.
  const activeLevel = levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;

  // Camera-doel: centroid van BG-verdieping (order=1).
  const groundLevelId = levels[0]?.id ?? null;
  const groundWalls = useWalls(groundLevelId) ?? [];
  const pts = groundWalls.flatMap((w) => [w.start, w.end]);
  const center = pts.length ? polygonCentroid(pts) : { x: 0, y: 0 };
  const maxElev = levels.length ? levels[levels.length - 1].elevation + levels[levels.length - 1].height : 8;

  // Camera-afstand op basis van de afmeting van het gebouw, zodat je buiten begint.
  const span = pts.length
    ? Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
    : 0;
  const camDist = Math.max(maxElev, span * 0.75);

  const groundFloorElev = levels[0]?.elevation ?? 0;
  const planB = pts.length
    ? bounds(pts)
    : { min: { x: center.x - 10, y: 0 }, max: { x: center.x + 10, y: 0 } };

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{
          position: [center.x + camDist, Math.max(maxElev * 0.9, camDist * 0.55), center.y + camDist],
          fov: walkMode ? 75 : 50,
        }}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: dayMode ? 1.1 : 0.6,
        }}
        onCreated={({ gl }) => {
          glRef.current = gl;
        }}
        style={{ cursor: editMode !== "none" ? "crosshair" : walkMode ? "none" : "grab" }}
      >
        {dayMode ? (
          <Sky sunPosition={[sunVec[0] * 100, Math.max(1, sunVec[1] * 100), sunVec[2] * 100]} turbidity={8} rayleigh={0.5} />
        ) : (
          <color attach="background" args={["#0a0e1a"]} />
        )}

        <ambientLight intensity={dayMode ? (sunUp ? 0.45 : 0.25) : 0.15} />
        <hemisphereLight args={dayMode ? ["#f0ecd8", "#8a9070", 0.6] : ["#1a2040", "#0a0e0a", 0.3]} />
        <directionalLight
          position={[sunVec[0] * 30, Math.max(4, sunVec[1] * 30), sunVec[2] * 30]}
          intensity={dayMode ? (sunUp ? 1.8 : 0.25) : 0.1}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={80}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          color={dayMode ? "#fffae8" : "#3060c0"}
        />
        {!dayMode && <pointLight position={[center.x, groundFloorElev + 2.2, center.y]} intensity={2} distance={12} color="#ffd080" />}
        <directionalLight position={[-8, 12, -6]} intensity={0.4} color="#d4e8f0" />

        {/* Vloer */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0, center.y]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#d8d0c0" roughness={0.95} />
        </mesh>
        <Grid
          position={[center.x, 0.01, center.y]}
          args={[80, 80]}
          cellSize={1}
          cellColor="#c7c0b0"
          sectionSize={5}
          sectionColor="#a8a094"
          fadeDistance={60}
          infiniteGrid
        />

        {levels.map((level) => (
          <LevelScene
            key={level.id}
            level={level}
            visibleLayers={visibleLayers}
            phaseOrders={phaseOrders}
            selectedFurnitureId={selectedFurnitureId}
            gizmoMode={gizmoMode}
            realistic={realistic}
          />
        ))}

        {/* Eén klik-vlak voor de actieve verdieping, alleen tijdens plaatsen */}
        {activeLevel && editMode !== "none" && !walkMode && (
          <FloorPlane levelId={activeLevel.id} elevation={activeLevel.elevation} />
        )}

        {walkMode ? (
          <WalkthroughMode
            startPosition={[center.x, groundFloorElev + 1.65, center.y]}
            onExit={() => setWalkMode(false)}
          />
        ) : (
          <OrbitControls
            makeDefault
            target={[center.x, maxElev / 2, center.y]}
            enableDamping
            maxPolarAngle={Math.PI / 2.05}
            minDistance={2}
            maxDistance={80}
          />
        )}
      </Canvas>

      {/* 3D controls overlay */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-2">
        <button
          className="pointer-events-auto hidden rounded-xl border border-white/20 bg-ink-900/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-ink-900 md:flex items-center gap-1.5"
          onClick={() => setWalkMode((w) => !w)}
          title={walkMode ? "Terug naar overzicht" : "Door het huis lopen (WASD + muis)"}
        >
          {walkMode ? "↺ Orbit" : "▶ Doorlopen"}
        </button>
        <button
          className="pointer-events-auto rounded-xl border border-white/20 bg-ink-900/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-ink-900"
          onClick={() => setDayMode((d) => !d)}
          title={dayMode ? "Avondlicht" : "Daglicht"}
        >
          {dayMode ? "🌙" : "☀️"}
        </button>
        <button
          className="pointer-events-auto rounded-xl border border-white/20 bg-ink-900/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-ink-900"
          onClick={() => void takeScreenshot()}
          title="Screenshot downloaden (PNG)"
        >
          📷
        </button>
        <button
          className="pointer-events-auto rounded-xl border border-white/20 bg-ink-900/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-ink-900"
          onClick={() => setRealistic((r) => !r)}
          title={realistic ? "Toon bouwstatus-kleuren (bestaand/nieuw/sloop)" : "Toon materialen (levensecht)"}
        >
          {realistic ? "Status" : "Materialen"}
        </button>
        <button
          className={`pointer-events-auto rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur ${
            clipEnabled ? "bg-accent" : "bg-ink-900/80 hover:bg-ink-900"
          }`}
          onClick={() => {
            setClipX(center.x);
            setClipEnabled((v) => !v);
          }}
          title="Doorsnede in 3D (snijvlak)"
        >
          ✂
        </button>

        {clipEnabled && (
          <div className="pointer-events-auto rounded-xl border border-white/20 bg-ink-900/85 p-2 shadow-lg backdrop-blur">
            <input
              type="range"
              min={planB.min.x}
              max={planB.max.x}
              step={0.05}
              value={clipX}
              onChange={(e) => setClipX(Number(e.target.value))}
              className="w-32 accent-accent"
            />
          </div>
        )}

        {selectedFurnitureId && (
          <div className="pointer-events-auto flex overflow-hidden rounded-xl border border-white/20 shadow-lg">
            {(["translate", "rotate"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setGizmoMode(m)}
                className={`px-3 py-2 text-xs font-semibold ${
                  gizmoMode === m ? "bg-accent text-white" : "bg-ink-900/80 text-white/70 hover:bg-ink-900"
                }`}
                title={m === "translate" ? "Verplaatsen (T)" : "Roteren (R)"}
              >
                {m === "translate" ? "↔" : "⟳"}
              </button>
            ))}
          </div>
        )}

        {dayMode && (
          <div className="pointer-events-auto space-y-1 rounded-xl border border-white/20 bg-ink-900/85 p-2 text-[10px] text-white/80 shadow-lg backdrop-blur">
            <div className="flex items-center gap-1.5">
              <span>☀️</span>
              <input
                type="date"
                value={sunDate}
                onChange={(e) => setSunDate(e.target.value)}
                className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white"
              />
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={sunHour}
              onChange={(e) => setSunHour(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="text-center tabular">
              {String(Math.floor(sunHour)).padStart(2, "0")}:
              {String(Math.round((sunHour % 1) * 60)).padStart(2, "0")}
            </div>
          </div>
        )}
      </div>

      {!walkMode && <BuildSequenceBar phases={phases} />}

      {walkMode && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
          <div className="rounded-full bg-ink-900/70 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
            WASD bewegen · muis kijken · Shift = sprinten · Esc = stoppen
          </div>
        </div>
      )}
    </div>
  );
}
