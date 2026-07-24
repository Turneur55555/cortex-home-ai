// ============================================================
// LES CHRONIQUES — refonte premium (23/07/2026, décisions Nathan).
//
// Le livre de vie du joueur : rétrospectif (on vient se souvenir, jamais
// agir), organisé en TROIS modules pairs — Les Légendes (maîtrise par
// groupe musculaire), La Forge (bibliothèque d'exercices, "pas un
// créateur de séance"), Progression (tout ce qui raconte l'évolution :
// records, tendances, chronologie). Aucune quatrième destination. Chaque
// information vit à UN seul endroit (voir docs/architecture/rpg-chroniques.md).
//
// Remplace l'ancien « Livre des Chroniques » (page unique, défilement de
// 9 sections empilées sans hiérarchie) : même contenu, migré intégralement
// dans les trois modules ci-dessus. Navigation par sélecteur segmenté (un
// tap, contenu échangé en place) au lieu d'un long scroll — le pouce reste
// toujours à portée du sélecteur.
//
// Vraie page plein écran (early-return dans SeancesTab, même système
// qu'ActiveWorkoutView) : aucun modal, aucun drawer pour la navigation
// entre modules.
// ============================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Crown, Hammer, TrendingUp } from "lucide-react";

import type { WorkoutRow } from "@/components/fitness/WorkoutCard";
import { ProfileRPGData } from "@/components/profile/rpg/ProfileRPGData";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import { LegendesModule } from "./modules/LegendesModule";
import { ForgeModule } from "./modules/ForgeModule";
import { ProgressionModule } from "./modules/ProgressionModule";

type ModuleKey = "legendes" | "forge" | "progression";

const MODULES: Array<{
  key: ModuleKey;
  label: string;
  icon: React.ReactNode;
  /** Rappelle la mission unique du module sous le sélecteur — un
   *  utilisateur qui ouvre l'onglet pour la première fois doit savoir ce
   *  qu'il regarde sans avoir à deviner. */
  mission: string;
}> = [
  {
    key: "legendes",
    label: "Légendes",
    icon: <Crown className="h-3.5 w-3.5" />,
    mission: "Ta maîtrise, groupe musculaire par groupe musculaire.",
  },
  {
    key: "forge",
    label: "Forge",
    icon: <Hammer className="h-3.5 w-3.5" />,
    mission: "La bibliothèque complète de tes exercices.",
  },
  {
    key: "progression",
    label: "Progression",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    mission: "Tes preuves : records, tendances, chronologie.",
  },
];

export function ChroniquesPage({
  initialModule,
  workouts,
  prByName,
  histByName,
  volByName,
  prByGym,
  histByGym,
  nameByKey,
  topExercises,
  imageUrls,
  latestDate,
  onRepeatLive,
  onOpenFromTemplate,
  onSaveAsTemplate,
  onOpenChronicle,
  onOpenCatalog,
  onBack,
}: {
  /** Module à ouvrir directement (deep-link depuis `/progression`,
   *  désormais redirigée vers ce domicile unique). */
  initialModule?: ModuleKey;
  workouts: WorkoutRow[];
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByGym: Map<string, Map<string, number>>;
  histByGym: Map<string, Map<string, Array<{ date: string; weight: number }>>>;
  nameByKey: Map<string, string>;
  topExercises: string[];
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
  onRepeatLive: (w: WorkoutRow) => void;
  onOpenFromTemplate: (w: WorkoutRow) => void;
  onSaveAsTemplate: (w: WorkoutRow) => void;
  onOpenChronicle: (w: WorkoutRow) => void;
  onOpenCatalog: () => void;
  onBack: () => void;
}) {
  // Ouvre directement sur Les Légendes — le module le plus identitaire et le
  // plus "capturable" (illustrations de rang), jamais sur un lanceur de
  // cartes ni sur des graphiques (règle DA : le Rang est la star) — sauf
  // deep-link explicite depuis une route redirigée vers son nouveau domicile.
  const [active, setActive] = useState<ModuleKey>(initialModule ?? "legendes");
  const activeModule = MODULES.find((m) => m.key === active)!;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="flex flex-col gap-5 pb-4"
    >
      {/* ── Couverture du livre + sélecteur segmenté — collants ─────────── */}
      <div className="sticky top-0 z-30 -mx-1 flex flex-col gap-3 bg-background/80 px-1 pb-3 pt-2 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-2 pl-2.5 pr-4 text-sm font-semibold text-white/90 transition-all active:scale-95 hover:bg-white/[0.1]"
            aria-label="Retour aux Séances"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </button>
          <span className="truncate font-serif text-[14px] font-semibold italic text-white/70">
            Les Chroniques
          </span>
        </div>

        <div className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
          {MODULES.map((m) => {
            const isActive = m.key === active;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                className={
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-semibold transition-colors " +
                  (isActive ? "text-black" : "text-white/60 hover:text-white/85")
                }
              >
                {isActive && (
                  <motion.span
                    layoutId="chroniques-segment"
                    className="absolute inset-0 rounded-full bg-white"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {m.icon}
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="px-1 text-[11px] leading-snug text-white/50">{activeModule.mission}</p>
      </div>

      {/* ── Contenu du module actif ──────────────────────────────────────
          Les trois modules sont des PAIRS (pas de push/retour entre eux) :
          on échange le contenu en place. Les drill-down (fiche de groupe,
          Chronique de séance) restent, eux, de vraies pages plein écran. */}
      <ProfileRPGData>
        {({ rankAggregate, workouts: classWorkouts }) => (
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              {active === "legendes" && (
                <LegendesModule
                  workouts={workouts}
                  rankAggregate={rankAggregate}
                  prByName={prByName}
                  histByName={histByName}
                  volByName={volByName}
                  nameByKey={nameByKey}
                  classWorkouts={classWorkouts}
                />
              )}
              {active === "forge" && (
                <ForgeModule rankAggregate={rankAggregate} onOpenCatalog={onOpenCatalog} />
              )}
              {active === "progression" && (
                <ProgressionModule
                  workouts={workouts}
                  prByName={prByName}
                  histByName={histByName}
                  volByName={volByName}
                  prByGym={prByGym}
                  histByGym={histByGym}
                  nameByKey={nameByKey}
                  topExercises={topExercises}
                  imageUrls={imageUrls}
                  latestDate={latestDate}
                  onRepeatLive={onRepeatLive}
                  onOpenFromTemplate={onOpenFromTemplate}
                  onSaveAsTemplate={onSaveAsTemplate}
                  onOpenChronicle={onOpenChronicle}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </ProfileRPGData>
    </motion.section>
  );
}
