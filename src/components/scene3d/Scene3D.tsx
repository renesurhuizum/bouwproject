"use client";

// 3D-weergave: plattegrond geëxtrudeerd naar muren. Orbit-camera om rond te kijken.
// Plan-coördinaten (x, y in meters) → wereld (x, z). Hoogte = y omhoog.

import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import type { Wall, Opening, ElectricalItem, PlumbingItem, Room } from "@/lib/domain/types";
import { useWalls, useElectrical, useOpenings, useRooms, usePlumbing } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { dist, angle, polygonCentroid } from "@/lib/geometry";

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
            roughness={0.85}
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

function ElectricalMarker({ item }: { item: ElectricalItem }) {
  return (
    <mesh position={[item.position.x, item.heightZ, item.position.y]}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial color="#1d4ed8" emissive="#1d4ed8" emissiveIntensity={0.3} />
    </mesh>
  );
}

function PlumbingMarker({ item }: { item: PlumbingItem }) {
  if (!item.position) return null;
  return (
    <mesh position={[item.position.x, item.heightZ ?? 0.3, item.position.y]}>
      <cylinderGeometry args={[0.07, 0.07, 0.14, 16]} />
      <meshStandardMaterial color="#0891b2" emissive="#0891b2" emissiveIntensity={0.25} />
    </mesh>
  );
}

export function Scene3D() {
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const walls = useWalls(activeLevelId) ?? [];
  const electrical = useElectrical(activeLevelId) ?? [];
  const openings = useOpenings(activeLevelId) ?? [];
  const rooms = useRooms(activeLevelId) ?? [];
  const plumbing = usePlumbing(activeLevelId) ?? [];

  const openingsByWall = new Map<string, Opening[]>();
  for (const op of openings) {
    const list = openingsByWall.get(op.wallId) ?? [];
    list.push(op);
    openingsByWall.set(op.wallId, list);
  }

  // Camera-doel: midden van de muren.
  const pts = walls.flatMap((w) => [w.start, w.end]);
  const center = pts.length ? polygonCentroid(pts) : { x: 0, y: 0 };

  return (
    <Canvas
      shadows
      camera={{ position: [center.x + 8, 7, center.y + 8], fov: 50 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#eceadf"]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#cabfa6", 0.5]} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Vloer */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0, center.y]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#dcd6c8" roughness={1} />
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
        plumbing.map((it) => <PlumbingMarker key={it.id} item={it} />)}

      <OrbitControls
        target={[center.x, 1.2, center.y]}
        enableDamping
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={50}
      />
    </Canvas>
  );
}
