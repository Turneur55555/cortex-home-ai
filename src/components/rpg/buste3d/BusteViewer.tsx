import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { RotateCcw } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { useCortexPower } from "@/hooks/useCortexPower";
import { useBusteMuscleRanks } from "@/hooks/useBusteMuscleRanks";
import { isWebGLAvailable } from "@/lib/webglSupport";
import { BusteErrorBoundary } from "./BusteErrorBoundary";
import { BusteRotationRig } from "./BusteRotationRig";

/**
 * Buste 3D évolutif — élément central de la page Progression RPG (Phase I).
 * Représente les 8 Rangs musculaires du buste (`useBusteMuscleRanks`,
 * jamais le Titre global directement — voir
 * docs/architecture/rpg-buste-3d-blender-workflow.md §6).
 *
 * Repli 2D (`RankIllustration`, système existant, jamais retiré) dans TROIS
 * cas, sans jamais casser l'écran : WebGL indisponible, chargement du GLB en
 * échec (asset absent tant que l'artiste n'a pas déposé la version
 * définitive — voir `BusteErrorBoundary`), ou joueur non classé (rien à
 * représenter, jamais un buste "Mortel" par défaut).
 */
export function BusteViewer() {
  const { isLoading: powerLoading, title } = useCortexPower();
  const { isLoading: zonesLoading, zones } = useBusteMuscleRanks();
  const [showBack, setShowBack] = useState(false);

  const isLoading = powerLoading || zonesLoading;
  const ranked = title.status === "ranked" ? title : null;

  if (isLoading) {
    return <div className="aspect-[4/5] w-full animate-pulse rounded-[22px] bg-white/[0.03]" />;
  }

  if (!ranked || !isWebGLAvailable()) {
    return (
      <RankIllustration
        rankKey={ranked?.title.key ?? "mortel"}
        label={ranked?.title.label ?? "Non classé"}
        className="aspect-[4/5] w-full rounded-[22px]"
      />
    );
  }

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] bg-black/20">
      <BusteErrorBoundary
        fallback={
          <RankIllustration
            rankKey={ranked.title.key}
            label={ranked.title.label}
            className="h-full w-full"
          />
        }
      >
        <Suspense
          fallback={<div className="h-full w-full animate-pulse bg-white/[0.03]" />}
        >
          <Canvas camera={{ position: [0, 1.35, 2.4], fov: 32 }} dpr={[1, 2]}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 3, 2]} intensity={1.1} />
            <Environment preset="city" />
            <BusteRotationRig zones={zones} showBack={showBack} />
          </Canvas>
        </Suspense>
      </BusteErrorBoundary>

      <button
        type="button"
        onClick={() => setShowBack((v) => !v)}
        aria-label={showBack ? "Voir de face" : "Voir de dos"}
        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur transition-colors hover:bg-black/70"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}
