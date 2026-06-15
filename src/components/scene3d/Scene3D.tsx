"use client";

// 3D-weergave: plattegrond geëxtrudeerd naar muren. Orbit-camera om rond te kijken.
// Plan-coördinaten (x, y in meters) → wereld (x, z). Hoogte = y omhoog.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Sky } from "@react-three/drei";
import { useLiveQuery } from "dexie-react-hooks";
import type { Wall, Opening, ElectricalItem, PlumbingItem, Room, Level, Furniture, HvacItem, Staircase, Column, Beam } from "@/lib/domain/types";
import { useWalls, useElectrical, useOpenings, useRooms, usePlumbing, useProject, useFurniture, useHvac, useStairs, useColumns, useBeams } from "@/lib/hooks";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import { ELECTRICAL_LABEL, BEAM_PROFILE_DIMS } from "@/lib/domain/constants";
import { getDB } from "@/lib/db/db";
import { create as dbCreate } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { use3DEdit } from "./use3DEdit";
import { WalkthroughMode } from "./WalkthroughMode";
import { dist, angle, polygonCentroid, projectOnSegment } from "@/lib/geometry";
import type { Point } from "@/lib/domain/types";

const STATUS_3D: Record<Wall["status"], { color: string; opacity: number }> = {
  existing: { color: "#b8b0a2", opacity: 1 },
  new: { color: "#ea580c", opacity: 1 },
  demolish: { color: "#dc2626", opacity: 0.35 },
};

interface Box {
  localX: number; // midden langs de muur (lokaal, -L/2..L/2)
  y: number; // midden hoogte
  w: number; // lengte van het segment
  h: number; // hoogte van het segment
}

// Splits een muur in massieve segmenten rond de openingen (echte gaten).
function wallBoxes(length: number, height: number, openings: Opening[]): Box[] {
  const clamp = (v: number) => Math.max(0, Math.min(length, v));
  const ops = openings
    .map((o) => ({ s: clamp(o.offset - o.width / 2), e: clamp(o.offset + o.width / 2), o }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s);

  const boxes: Box[] = [];
  const solid = (a: number, b: number) => {
    if (b - a < 0.001) return;
    boxes.push({ localX: (a + b) / 2 - length / 2, y: height / 2, w: b - a, h: height });
  };

  let cursor = 0;
  for (const { s, e, o } of ops) {
    if (s > cursor) solid(cursor, s);
    const top = o.sillHeight + o.height;
    if (o.sillHeight > 0.001) {
      boxes.push({ localX: (s + e) / 2 - length / 2, y: o.sillHeight / 2, w: e - s, h: o.sillHeight });
    }
    if (top < height - 0.001) {
      boxes.push({ localX: (s + e) / 2 - length / 2, y: (top + height) / 2, w: e - s, h: height - top });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < length) solid(cursor, length);
  return boxes;
}

function WallMesh({ wall, openings, wallColor }: { wall: Wall; openings: Opening[]; wallColor?: string }) {
  const length = dist(wall.start, wall.end);
  if (length < 0.01) return null;
  const cx = (wall.start.x + wall.end.x) / 2;
  const cz = (wall.start.y + wall.end.y) / 2;
  const rotY = -angle(wall.start, wall.end);
  const style = STATUS_3D[wall.status];
  const boxes = wallBoxes(length, wall.height, openings);
  const finalColor = wallColor && wall.status === "existing" ? wallColor : style.color;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.localX, b.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, wall.thickness]} />
          <meshStandardMaterial
            color={finalColor}
            transparent={style.opacity < 1}
            opacity={style.opacity}
            roughness={wall.material === "concrete" ? 0.95 : wall.material === "brick" ? 0.88 : 0.80}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
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

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={floorColor}
        roughness={room.floorMaterial === "tile" ? 0.3 : room.floorMaterial === "wood" ? 0.65 : 0.9}
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

function FurnitureMesh3D({ item }: { item: Furniture }) {
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

  return (
    <group
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
          <meshStandardMaterial color={STAIR_COLOR} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function ColumnModel3D({ col, levelHeight }: { col: Column; levelHeight: number }) {
  const h = col.height ?? levelHeight;
  const color = CONSTRUCTION_MATERIAL_COLOR[col.material] ?? "#a8a8a8";
  return (
    <group position={[col.position.x, 0, col.position.y]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        {col.shape === "round" ? (
          <cylinderGeometry args={[col.size / 2, col.size / 2, h, 20]} />
        ) : (
          <boxGeometry args={[col.size, h, col.size]} />
        )}
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </group>
  );
}

function BeamModel3D({ beam }: { beam: Beam }) {
  const len = dist(beam.start, beam.end);
  if (len < 0.01) return null;
  const dims = BEAM_PROFILE_DIMS[beam.profile];
  const fw = beam.width ?? dims.w;
  const fh = dims.h;
  const flT = fh * 0.15;
  const cx = (beam.start.x + beam.end.x) / 2;
  const cz = (beam.start.y + beam.end.y) / 2;
  const rotY = -angle(beam.start, beam.end);
  return (
    <group position={[cx, beam.height, cz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, fh / 2 - flT / 2, 0]} castShadow>
        <boxGeometry args={[len, flT, fw]} />
        <meshStandardMaterial color="#6b7280" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, -fh / 2 + flT / 2, 0]} castShadow>
        <boxGeometry args={[len, flT, fw]} />
        <meshStandardMaterial color="#6b7280" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[len, fh - 2 * flT, fw * 0.12]} />
        <meshStandardMaterial color="#5b626b" roughness={0.4} metalness={0.7} />
      </mesh>
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
}: {
  level: Level;
  visibleLayers: Record<string, boolean>;
}) {
  const walls = useWalls(level.id) ?? [];
  const electrical = useElectrical(level.id) ?? [];
  const openings = useOpenings(level.id) ?? [];
  const rooms = useRooms(level.id) ?? [];
  const plumbing = usePlumbing(level.id) ?? [];
  const furniture = useFurniture(level.id) ?? [];
  const hvac = useHvac(level.id) ?? [];
  const stairs = useStairs(level.id) ?? [];
  const columns = useColumns(level.id) ?? [];
  const beams = useBeams(level.id) ?? [];

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

  return (
    <group position={[0, elev, 0]}>
      {visibleLayers.rooms &&
        rooms
          .filter((r) => r.polygon.length >= 3)
          .map((r) => (
            <group key={r.id}>
              <RoomFloor3D room={r} />
              <RoomCeiling3D room={r} height={level.height} />
            </group>
          ))}
      {visibleLayers.structure &&
        walls.map((w) => (
          <WallMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? []} wallColor={wallColorById.get(w.id)} />
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
        furniture.map((it) => <FurnitureMesh3D key={it.id} item={it} />)}
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
    </group>
  );
}

export function Scene3D() {
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const project = useProject();
  const editMode = use3DEdit((s) => s.mode);
  const [walkMode, setWalkMode] = useState(false);
  const [dayMode, setDayMode] = useState(true);

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

  const groundFloorElev = levels[0]?.elevation ?? 0;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{
          position: [center.x + maxElev, maxElev * 0.9, center.y + maxElev],
          fov: walkMode ? 75 : 50,
        }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: dayMode ? 1.1 : 0.6 }}
        style={{ cursor: editMode !== "none" ? "crosshair" : walkMode ? "none" : "grab" }}
      >
        {dayMode ? (
          <Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={0.5} />
        ) : (
          <color attach="background" args={["#0a0e1a"]} />
        )}

        <ambientLight intensity={dayMode ? 0.45 : 0.15} />
        <hemisphereLight args={dayMode ? ["#f0ecd8", "#8a9070", 0.6] : ["#1a2040", "#0a0e0a", 0.3]} />
        <directionalLight
          position={[12, 20, 8]}
          intensity={dayMode ? 1.8 : 0.1}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={60}
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
          <LevelScene key={level.id} level={level} visibleLayers={visibleLayers} />
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
      </div>

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
