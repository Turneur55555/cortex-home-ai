import { useEffect, useMemo } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ChevronLeft, Pencil, Plus, Star, Trash2, Zap } from "lucide-react";
import { Portal } from "@/components/Portal";
import { useExerciseAnalysis } from "@/hooks/useExerciseAnalysis";
import { useExerciseCatalogEntry } from "@/hooks/useExerciseCatalogEntry";
import { exerciseDifficulty } from "@/lib/fitness/exerciseRanks";
import { RELEVANCE_LABELS } from "@/lib/fitness/analysis";
import { ExerciseActionsMenu, type ExerciseMenuAction } from "./ExerciseActionsMenu";
import { StarRating } from "./ExerciseAnalysisPrimitives";
import { ExerciseMediaSection } from "./exercise-sheet/ExerciseMedia";
import { ExercisePresentationCard } from "./exercise-sheet/ExercisePresentation";
import { ExerciseTechniqueCard, ExerciseMistakesCard } from "./exercise-sheet/ExerciseTechnique";
import { ExerciseMuscleSection } from "./exercise-sheet/ExerciseMuscleSection";
import { ExercisePhysicalImpactCard } from "./exercise-sheet/ExercisePhysicalImpact";
import { ExerciseProgressionSection } from "./exercise-sheet/ExerciseProgressionSection";
import {
  ExerciseVariantsCard,
  ExerciseSimilarCard,
} from "./exercise-sheet/ExerciseVariantsAndSimilar";
import { ExerciseAIAdviceCard } from "./exercise-sheet/ExerciseAIAdvice";

// ============================================================
// Fiche exercice — nouvelle génération (2026-07-29). Remplace
// ExerciseAnalysisSheet + ExerciseDiscoveryPage : une seule expérience,
// identique quelle que soit l'origine de l'exercice (Cortex, importé du
// dataset, fusionné) et quel que soit son historique (déjà pratiqué ou
// non). Le média (photo/GIF/vidéo du dataset) est l'élément principal de
// la page ; toutes les sections omettent silencieusement les données
// absentes plutôt que d'en inventer (voir composants de
// exercise-sheet/ pour le détail par section).
// ============================================================

export interface ExerciseSheetActions {
  /** "Démarrer une séance avec cet exercice" — fournir seulement si aucune séance n'est active. */
  onStartSession?: () => void;
  /** "Ajouter à la séance en cours" — fournir seulement si une séance est active. */
  onAddToActiveWorkout?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPromote?: () => void;
}

export function ExerciseSheet({
  exerciseName,
  weightHistory,
  volumeHistory,
  pr,
  imageUrl,
  onClose,
  actions,
  similarExercises,
  onSelectSimilar,
}: {
  exerciseName: string;
  weightHistory: Array<{ date: string; weight: number }>;
  volumeHistory: Array<{ date: string; volume: number }>;
  pr: number | undefined;
  imageUrl?: string | null;
  onClose: () => void;
  /** Actions contextuelles (Catalogue/Picker uniquement) — absentes ⇒ aucun bouton "...". */
  actions?: ExerciseSheetActions;
  /** Suggestions de variantes (même muscle principal), fournies par le Catalogue. */
  similarExercises?: Array<{ name: string; group: string }>;
  onSelectSimilar?: (name: string) => void;
}) {
  const { analysis, sessionCount } = useExerciseAnalysis(exerciseName);
  const { data: catalog } = useExerciseCatalogEntry(exerciseName);

  // Actions contextuelles (menu "..." + CTA) — construites une seule fois à
  // partir des callbacks fournis par l'appelant (Catalogue/Picker). Aucune
  // action ⇒ aucun bouton, comportement identique aux 3 autres appelants
  // (WorkoutCard, ExerciseRankStrip, ActiveWorkoutView) qui ne passent pas
  // `actions`.
  const primaryActionLabel = actions?.onAddToActiveWorkout
    ? "Ajouter à la séance en cours"
    : actions?.onStartSession
      ? "Démarrer une séance avec cet exercice"
      : null;
  const primaryActionFn = actions?.onAddToActiveWorkout ?? actions?.onStartSession;

  const menuActions: ExerciseMenuAction[] = useMemo(() => {
    if (!actions) return [];
    const list: ExerciseMenuAction[] = [];
    if (primaryActionFn && primaryActionLabel) {
      list.push({
        key: "primary",
        label: primaryActionLabel,
        icon: actions.onAddToActiveWorkout ? (
          <Plus className="h-4 w-4" />
        ) : (
          <Zap className="h-4 w-4" />
        ),
        onClick: primaryActionFn,
      });
    }
    if (actions.onEdit) {
      list.push({
        key: "edit",
        label: "Modifier",
        icon: <Pencil className="h-4 w-4" />,
        onClick: actions.onEdit,
      });
    }
    if (actions.onPromote) {
      list.push({
        key: "promote",
        label: "Ajouter au catalogue",
        icon: <Star className="h-4 w-4" />,
        onClick: actions.onPromote,
      });
    }
    if (actions.onDelete) {
      list.push({
        key: "delete",
        label: "Supprimer",
        icon: <Trash2 className="h-4 w-4" />,
        onClick: actions.onDelete,
        destructive: true,
      });
    }
    return list;
  }, [actions, primaryActionFn, primaryActionLabel]);

  // Badges du Hero — dérivés de signaux déjà validés ailleurs (moteur
  // d'analyse + catalogue), jamais un champ fabriqué : groupe musculaire
  // (catalogue), équipement (dataset), polyarticulaire/isolation (moteur de
  // difficulté déjà utilisé par computePhysicalImpact), traits physiques
  // dominants (score ≥ 60).
  const heroBadges = useMemo(() => {
    const chips: string[] = [];
    if (catalog?.category) chips.push(catalog.category);
    if (catalog?.equipment) chips.push(catalog.equipment);
    chips.push(exerciseDifficulty(exerciseName) >= 1.4 ? "Polyarticulaire" : "Isolation");
    for (const t of analysis?.physicalImpact ?? []) {
      if (t.score >= 60 && !chips.includes(t.label)) chips.push(t.label);
    }
    return chips.slice(0, 5);
  }, [catalog, analysis, exerciseName]);

  // Page plein écran (transition push iOS + swipe-back).
  const dragX = useMotionValue(0);
  const overlayOpacity = useTransform(dragX, [0, 200], [0.35, 0]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 120 || info.velocity.x > 500) onClose();
    else dragX.set(0);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <motion.div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
          aria-hidden
        />

        <motion.div
          className="absolute inset-0 flex flex-col overflow-hidden bg-background"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.6 }}
          style={{ x: dragX }}
          onDragEnd={handleDragEnd}
        >
          <div
            className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-background/85 backdrop-blur-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="relative flex h-12 items-center px-2">
              <button
                onClick={onClose}
                className="flex h-10 items-center gap-0.5 rounded-full px-2 text-primary transition-colors hover:bg-white/5 active:opacity-70"
                aria-label="Retour"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2.4} />
                <span className="text-[15px] font-medium">Retour</span>
              </button>
              <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                <h1 className="max-w-[55%] truncate text-[15px] font-semibold capitalize">
                  {exerciseName}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-1.5 pr-1">
                {menuActions.length > 0 && (
                  <ExerciseActionsMenu
                    title={exerciseName}
                    actions={menuActions}
                    triggerClassName="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  />
                )}
              </div>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pt-4"
            style={{
              paddingBottom:
                "calc(var(--bottom-nav-height, 5.75rem) + env(safe-area-inset-bottom) + 2rem)",
            }}
          >
            {/* Hero média — toujours en premier, badges dérivés dedans */}
            <ExerciseMediaSection
              exerciseName={exerciseName}
              media={catalog?.media ?? []}
              fallbackImageUrl={imageUrl}
              badges={heroBadges.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm"
                >
                  {label}
                </span>
              ))}
            />

            {catalog && catalog.aliases.length > 0 && (
              <p className="-mt-2 text-center text-[10.5px] text-muted-foreground">
                Aussi appelé : {catalog.aliases.join(", ")}
              </p>
            )}

            {analysis && (
              <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-2.5">
                <StarRating stars={analysis.relevance.stars} />
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {RELEVANCE_LABELS[analysis.relevance.label]}
                </span>
              </div>
            )}

            <ExercisePresentationCard
              description={catalog?.description ?? null}
              smartSummary={analysis?.smartSummary}
            />

            <ExerciseTechniqueCard steps={catalog?.instructionSteps ?? []} />
            <ExerciseMistakesCard />

            <ExerciseMuscleSection
              muscles={analysis?.muscles ?? []}
              equipment={catalog?.equipment}
            />

            <ExercisePhysicalImpactCard impact={analysis?.physicalImpact ?? []} />

            {sessionCount > 0 ? (
              <ExerciseProgressionSection
                exerciseName={exerciseName}
                weightHistory={weightHistory}
                volumeHistory={volumeHistory}
                pr={pr}
                analysis={analysis}
              />
            ) : (
              <div className="rounded-2xl border border-border bg-surface/60 p-4 text-center text-xs text-muted-foreground">
                Pas encore pratiqué — lance-toi pour débloquer le rang, la progression et les
                records.
              </div>
            )}

            {analysis && <ExerciseAIAdviceCard analysis={analysis} />}

            <ExerciseVariantsCard variants={catalog?.variants ?? []} onSelect={onSelectSimilar} />
            <ExerciseSimilarCard items={similarExercises ?? []} onSelect={onSelectSimilar} />

            {primaryActionLabel && primaryActionFn && (
              <button
                type="button"
                onClick={primaryActionFn}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all active:scale-[0.99]"
              >
                <Zap className="h-4 w-4" />
                {primaryActionLabel}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
