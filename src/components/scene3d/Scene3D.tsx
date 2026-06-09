"use client";

// 3D-weergave: plattegrond geëxtrudeerd naar muren. Orbit-camera om rond te kijken.
// Plan-coördinaten (x, y in meters) → wereld (x, z). Hoogte = y omhoog.

import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useLiveQuery } from "dexie-react-hooks";
import type { Wall, Opening, ElectricalItem, PlumbingItem, Room, Level, Furniture, HvacItem } from "@/lib/domain/types";
import { useWalls, useElectrical, useOpenings, useRooms, usePlumbing, useProject, useFurniture, useHvac } from "@/lib/hooks";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import { getDB } from "@/lib/db/db";
import { create as dbCreate } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { use3DEdit } from "./use3DEdit";
import { dist, angle, polygonCentroid } from "@/lib/geometry";
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

function WallMesh({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  const length = dist(wall.start, wall.end);
  if (length < 0.01) return null;
  const cx = (wall.start.x + wall.end.x) / 2;
  const cz = (wall.start.y + wall.end.y) / 2;
  const rotY = -angle(wall.start, wall.end);
  const style = STATUS_3D[wall.status];
  const boxes = wallBoxes(length, wall.height, openings);

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.localX, b.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, wall.thickness]} />
          <meshStandardMaterial
            color={style.color}
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

function RoomFloor3D({ room }: { room: Room }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.polygon.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
    s.closePath();
    return s;
  }, [room.polygon]);

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={room.color ?? "#e6d6bf"}
        transparent
        opacity={0.6}
        roughness={1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

const ELECTRICAL_LABELS: Record<string, string> = {
  socket: "Stopcontact", "socket-double": "Dubbel stop.", switch: "Schakelaar",
  light: "Lichtpunt", spot: "Inbouwspot", data: "Data/UTP",
  panel: "Meterkast", "wall-light": "Wandlamp", outdoor: "Buitenpunt",
};

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
  const isWall = item.type === "socket" || item.type === "socket-double" || item.type === "switch" || item.type === "data";
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

function plumbingDims(fixture?: string): { w: number; d: number; h: number; color: string } {
  switch (fixture) {
    case "toilet":       return { w: 0.40, d: 0.65, h: 0.40, color: "#f0ede8" };
    case "sink":         return { w: 0.55, d: 0.45, h: 0.85, color: "#e8f0f4" };
    case "shower":       return { w: 0.90, d: 0.90, h: 2.20, color: "#d4eaf0" };
    case "bath":         return { w: 0.75, d: 1.70, h: 0.55, color: "#e8f4f8" };
    case "kitchen-tap":  return { w: 0.60, d: 0.55, h: 0.90, color: "#e8e4d8" };
    case "boiler":       return { w: 0.45, d: 0.45, h: 0.80, color: "#d0d8e0" };
    default:             return { w: 0.40, d: 0.40, h: 0.85, color: "#c8dce8" };
  }
}

function PlumbingMarker({ item }: { item: PlumbingItem }) {
  if (!item.position) return null;
  const dims = plumbingDims(item.fixture);
  return (
    <group position={[item.position.x, dims.h / 2, item.position.y]}>
      <mesh castShadow>
        <boxGeometry args={[dims.w, dims.h, dims.d]} />
        <meshStandardMaterial color={dims.color} roughness={0.25} metalness={0.08} />
      </mesh>
      {item.fixture === "toilet" && (
        <mesh position={[0, dims.h / 2 + 0.04, -dims.d * 0.15]}>
          <cylinderGeometry args={[dims.w * 0.42, dims.w * 0.42, 0.08, 20]} />
          <meshStandardMaterial color="#f5f2ee" roughness={0.2} />
        </mesh>
      )}
      {item.fixture === "sink" && (
        <mesh position={[0, dims.h / 2 - 0.02, 0]}>
          <boxGeometry args={[dims.w * 0.85, 0.06, dims.d * 0.85]} />
          <meshStandardMaterial color="#d8edf4" roughness={0.15} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
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

function FurnitureMesh3D({ item }: { item: Furniture }) {
  const def = FURNITURE_DEFAULTS[item.kind];
  const w = item.width ?? def.w;
  const d = item.depth ?? def.d;
  const h = def.h;
  const color = item.color ?? def.color;
  const rotY = -(item.rotation * Math.PI) / 180;

  return (
    <group
      position={[item.position.x, h / 2, item.position.y]}
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
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      {(item.kind === "bed-single" || item.kind === "bed-double" || item.kind === "bed-king") && (
        <>
          <mesh position={[0, h / 2 + 0.05, -d / 2 + 0.32]}>
            <boxGeometry args={[w * 0.85, 0.12, 0.50]} />
            <meshStandardMaterial color="#f8f4ef" roughness={0.9} />
          </mesh>
          <mesh position={[0, h / 2 + 0.02, d / 2 - 0.1]}>
            <boxGeometry args={[w, 0.06, 0.08]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </>
      )}
      {(item.kind === "sofa-2" || item.kind === "sofa-3" || item.kind === "sofa-l") && (
        <mesh position={[0, h * 0.35, -d / 2 + 0.08]}>
          <boxGeometry args={[w, h * 0.55, 0.14]} />
          <meshStandardMaterial color={color} roughness={0.88} />
        </mesh>
      )}
      {item.kind === "bathtub" && (
        <mesh position={[0, h / 2 + 0.04, 0]}>
          <boxGeometry args={[w * 0.88, 0.06, d * 0.80]} />
          <meshStandardMaterial color="#c8e8f0" roughness={0.12} metalness={0.05} />
        </mesh>
      )}
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

function FloorPlane({ levelId, elevation }: { levelId: string; elevation: number }) {
  const { mode, furnitureKind, electricalType, reset } = use3DEdit();
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

  return (
    <group position={[0, elev, 0]}>
      {visibleLayers.rooms &&
        rooms
          .filter((r) => r.polygon.length >= 3)
          .map((r) => <RoomFloor3D key={r.id} room={r} />)}
      {visibleLayers.structure &&
        walls.map((w) => (
          <WallMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? []} />
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
      <FloorPlane levelId={level.id} elevation={level.elevation} />
    </group>
  );
}

export function Scene3D() {
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const project = useProject();
  const editMode = use3DEdit((s) => s.mode);

  const levels = useLiveQuery(
    async () => {
      if (!project?.id) return [];
      const rows = await getDB().levels.where("projectId").equals(project.id).sortBy("order");
      return rows.filter((l) => !l.deleted);
    },
    [project?.id],
    [] as Level[],
  );

  // Camera-doel: centroid van BG-verdieping (order=1).
  const groundLevelId = levels[0]?.id ?? null;
  const groundWalls = useWalls(groundLevelId) ?? [];
  const pts = groundWalls.flatMap((w) => [w.start, w.end]);
  const center = pts.length ? polygonCentroid(pts) : { x: 0, y: 0 };
  const maxElev = levels.length ? levels[levels.length - 1].elevation + levels[levels.length - 1].height : 8;

  return (
    <Canvas
      shadows
      camera={{ position: [center.x + maxElev, maxElev * 0.9, center.y + maxElev], fov: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ cursor: editMode !== "none" ? "crosshair" : "grab" }}
    >
      <color attach="background" args={["#eceadf"]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#f0ecd8", "#8a9070", 0.6]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
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

      <OrbitControls
        target={[center.x, maxElev / 2, center.y]}
        enableDamping
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={80}
      />
    </Canvas>
  );
}
