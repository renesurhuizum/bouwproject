"use client";

// 3D-weergave: plattegrond geëxtrudeerd naar muren. Orbit-camera om rond te kijken.
// Plan-coördinaten (x, y in meters) → wereld (x, z). Hoogte = y omhoog.

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import type { Wall, ElectricalItem } from "@/lib/domain/types";
import { useWalls, useElectrical } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { dist, angle, polygonCentroid } from "@/lib/geometry";

const STATUS_3D: Record<Wall["status"], { color: string; opacity: number }> = {
  existing: { color: "#b8b0a2", opacity: 1 },
  new: { color: "#ea580c", opacity: 1 },
  demolish: { color: "#dc2626", opacity: 0.35 },
};

function WallMesh({ wall }: { wall: Wall }) {
  const length = dist(wall.start, wall.end);
  if (length < 0.01) return null;
  const cx = (wall.start.x + wall.end.x) / 2;
  const cz = (wall.start.y + wall.end.y) / 2;
  const rotY = -angle(wall.start, wall.end);
  const style = STATUS_3D[wall.status];

  return (
    <mesh position={[cx, wall.height / 2, cz]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial
        color={style.color}
        transparent={style.opacity < 1}
        opacity={style.opacity}
        roughness={0.85}
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

export function Scene3D() {
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const walls = useWalls(activeLevelId) ?? [];
  const electrical = useElectrical(activeLevelId) ?? [];

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

      {visibleLayers.structure &&
        walls.map((w) => <WallMesh key={w.id} wall={w} />)}

      {visibleLayers.electrical &&
        electrical.map((it) => <ElectricalMarker key={it.id} item={it} />)}

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
