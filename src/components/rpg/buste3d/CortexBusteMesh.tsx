import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { BusteZoneEvolution } from "@/lib/fitness/rpg/busteEvolution";

// public/ (pas src/assets/) : URL fixe, servie telle quelle, jamais résolue
// par le pipeline de build Vite — voir
// docs/architecture/rpg-buste-3d-blender-workflow.md §5. L'absence du
// fichier est une erreur de CHARGEMENT normale (repli 2D géré par
// `BusteErrorBoundary`), jamais un échec de build.
export const BUSTE_GLB_URL = "/buste/cortex-buste.glb";

/** Vitesse de lissage de l'interpolation d'influence (par seconde) — une
 *  montée de Rang doit se lire comme une progression, jamais un saut brutal
 *  d'une frame à l'autre. */
const INFLUENCE_LERP_SPEED = 1.5;

interface CortexBusteMeshProps {
  zones: BusteZoneEvolution[];
}

/**
 * Charge le GLB du buste et pilote, PAR ZONE, l'influence du shape key
 * `evolution` (voir docs/architecture/rpg-buste-3d-blender-workflow.md §3
 * et §6). Chaque zone n'est jamais influencée que par SON PROPRE Rang
 * musculaire (`zones`, déjà calculé par `useBusteMuscleRanks` — aucun accès
 * direct au Titre global ici).
 *
 * `useGLTF` suspend pendant le chargement et lève une erreur si le fichier
 * est absent/invalide — capturé par `BusteErrorBoundary` (composant parent,
 * `BusteViewer.tsx`), jamais par ce composant lui-même.
 */
export function CortexBusteMesh({ zones }: CortexBusteMeshProps) {
  const { scene } = useGLTF(BUSTE_GLB_URL);
  const targetInfluenceByZone = useRef(new Map<string, number>());

  useEffect(() => {
    const map = new Map<string, number>();
    for (const z of zones) map.set(z.zone, z.influence);
    targetInfluenceByZone.current = map;
  }, [zones]);

  useFrame((_, delta) => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.morphTargetInfluences || !obj.morphTargetDictionary) return;
      const index = obj.morphTargetDictionary["evolution"];
      if (index == null) return;

      const target = targetInfluenceByZone.current.get(obj.name) ?? 0;
      const current = obj.morphTargetInfluences[index] ?? 0;
      const step = Math.min(1, INFLUENCE_LERP_SPEED * delta);
      obj.morphTargetInfluences[index] = current + (target - current) * step;
    });
  });

  return <primitive object={scene} />;
}

useGLTF.preload(BUSTE_GLB_URL);
