"use client";

// First-person walkthrough mode met pointer lock + WASD beweging.
// Wissel met de Orbit-modus via de "Doorlopen"-knop in Scene3D.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";

interface Props {
  startPosition: [number, number, number];
  onExit: () => void;
}

export function WalkthroughMode({ startPosition, onExit }: Props) {
  const { camera } = useThree();
  const controlsRef = useRef<PointerLockControlsImpl>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const initialised = useRef(false);

  // Zet camera op startpositie
  useEffect(() => {
    if (!initialised.current) {
      camera.position.set(...startPosition);
      initialised.current = true;
    }
  }, [camera, startPosition]);

  // WASD keyboard tracking
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Escape") {
        controlsRef.current?.unlock();
        onExit();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onExit]);

  // Beweging per frame — camera via frame-state zodat React Compiler
  // geen render-variabele ziet muteren.
  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls?.isLocked) return;
    const keys = keysRef.current;
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = sprint ? 6 : 3; // m/s
    const move = speed * delta;

    if (keys.has("KeyW") || keys.has("ArrowUp")) controls.moveForward(move);
    if (keys.has("KeyS") || keys.has("ArrowDown")) controls.moveForward(-move);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) controls.moveRight(-move);
    if (keys.has("KeyD") || keys.has("ArrowRight")) controls.moveRight(move);

    // Hoogte vastzetten op ooghoogte (geen vliegen)
    const floorY = startPosition[1];
    if (state.camera.position.y !== floorY) state.camera.position.y = floorY;
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      onUnlock={onExit}
    />
  );
}
