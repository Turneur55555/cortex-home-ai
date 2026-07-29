import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ChevronLeft, Pencil, Plus, Star, Trash2, Zap } from "lucide-react";
import { Portal } from "@/components/Portal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExerciseAnalysis } from "@/hooks/useExerciseAnalysis";
import { useExerciseCatalogEntry } from "@/hooks/useExerciseCatalogEntry";
import { deriveExerciseBadges } from "@/lib/fitness/exerciseBadges";
import { ExerciseActionsMenu, type ExerciseMenuAction } from "./ExerciseActionsMenu";
import { ExerciseHero } from "./exercise-sheet/ExerciseHero";
import { ExerciseMediaGrid } from "./exercise-sheet/ExerciseMedia";
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
// Fiche exercice — 2e itération (2026-07-29). Le Hero (média + rang RPG)
// reste toujours visible au-dessus, sans scroll : le rang est la
// récompense principale du joueur, il doit se voir immédiatement à
// l'ouverture. Le reste de la fiche est organisé en onglets (inspiré de
// "Mes aliments" — @/components/ui/tabs) plutôt qu'un long scroll unique.
// Un onglet dont le contenu serait entièrement vide n'apparaît pas — aucune
// section vide affichée, jamais de donnée inventée (voir composants de
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

type SheetTab = "overview" | "technique" | "muscles" | "progression" | "media" | "variants";

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
  // d'analyse + catalogue), jamais un champ fabriqué (voir lib/fitness/exerciseBadges).
  const heroBadges = useMemo(() => {
    const chips = deriveExerciseBadges(exerciseName, {
      category: catalog?.category,
      equipment: catalog?.equipment,
    });
    for (const t of analysis?.physicalImpact ?? []) {
      if (t.score >= 60 && !chips.includes(t.label)) chips.push(t.label);
    }
    return chips.slice(0, 5);
  }, [catalog, analysis, exerciseName]);

  // Contenu de chaque onglet — un onglet dont le contenu serait entièrement
  // vide (aucune donnée) n'apparaît pas dans la barre.
  const hasTechnique = (catalog?.instructionSteps.length ?? 0) > 0;
  const hasMuscles = (analysis?.muscles.length ?? 0) > 0 || !!catalog?.equipment;
  const hasMedia = (catalog?.media.length ?? 0) > 0;
  const hasVariants = (catalog?.variants.length ?? 0) > 0 || (similarExercises?.length ?? 0) > 0;

  const availableTabs = useMemo(() => {
    const list: SheetTab[] = ["overview"];
    if (hasTechnique) list.push("technique");
    if (hasMuscles) list.push("muscles");
    list.push("progression");
    if (hasMedia) list.push("media");
    if (hasVariants) list.push("variants");
    return list;
  }, [hasTechnique, hasMuscles, hasMedia, hasVariants]);

  const [tab, setTab] = useState<SheetTab>("overview");
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0];

  const TAB_LABELS: Record<SheetTab, string> = {
    overview: "Vue d'ensemble",
    technique: "Technique",
    muscles: "Muscles",
    progression: "Progression",
    media: "Médias",
    variants: "Variantes",
  };

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
            {/* Hero — média + rang, toujours visible en premier, avant tout scroll */}
            <ExerciseHero
              exerciseName={exerciseName}
              media={catalog?.media ?? []}
              fallbackImageUrl={imageUrl}
              badges={heroBadges}
              aliases={catalog?.aliases ?? []}
              analysis={analysis}
            />

            {/* Onglets — le reste de la fiche, jamais un long scroll unique */}
            <Tabs value={activeTab} onValueChange={(v) => setTab(v as SheetTab)}>
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
                {availableTabs.map((t) => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    {TAB_LABELS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <ExercisePresentationCard
                  description={catalog?.description ?? null}
                  smartSummary={analysis?.smartSummary}
                />
                {analysis && <ExerciseAIAdviceCard analysis={analysis} />}
              </TabsContent>

              {hasTechnique && (
                <TabsContent value="technique" className="mt-4 space-y-4">
                  <ExerciseTechniqueCard steps={catalog?.instructionSteps ?? []} />
                  <ExerciseMistakesCard />
                </TabsContent>
              )}

              {hasMuscles && (
                <TabsContent value="muscles" className="mt-4 space-y-4">
                  <ExerciseMuscleSection
                    muscles={analysis?.muscles ?? []}
                    equipment={catalog?.equipment}
                  />
                  <ExercisePhysicalImpactCard impact={analysis?.physicalImpact ?? []} />
                </TabsContent>
              )}

              <TabsContent value="progression" className="mt-4 space-y-4">
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
                    Pas encore pratiqué — lance-toi pour débloquer la progression et les records.
                  </div>
                )}
              </TabsContent>

              {hasMedia && (
                <TabsContent value="media" className="mt-4">
                  <ExerciseMediaGrid exerciseName={exerciseName} media={catalog?.media ?? []} />
                </TabsContent>
              )}

              {hasVariants && (
                <TabsContent value="variants" className="mt-4 space-y-4">
                  <ExerciseVariantsCard
                    variants={catalog?.variants ?? []}
                    onSelect={onSelectSimilar}
                  />
                  <ExerciseSimilarCard items={similarExercises ?? []} onSelect={onSelectSimilar} />
                </TabsContent>
              )}
            </Tabs>

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
