import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { CortexBusteMesh } from "./CortexBusteMesh";
import type { BusteZoneEvolution } from "@/lib/fitness/rpg/busteEvolution";

const ROTATION_LERP_SPEED = 3;

interface BusteRotationRigProps {
  zones: BusteZoneEvolution[];
  /** true = vue de dos (rotation 180°), false = vue de face. */
  showBack: boolean;
}

/**
 * Transition face/dos FLUIDE (§3 du besoin RPG) : fait pivoter le buste
 * autour de l'axe Y au lieu de charger un second modèle — un seul GLB,
 * jamais de duplication d'asset.
 */
export function BusteRotationRig({ zones, showBack }: BusteRotationRigProps) {
  const groupRef = useRef<Group>(null);
  const targetY = showBack ? Math.PI : 0;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const step = Math.min(1, ROTATION_LERP_SPEED * delta);
    group.rotation.y += (targetY - group.rotation.y) * step;
  });

  return (
    <group ref={groupRef}>
      <CortexBusteMesh zones={zones} />
    </group>
  );
}
