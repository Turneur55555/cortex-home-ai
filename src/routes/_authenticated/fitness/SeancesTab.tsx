import { useMemo, useState, useCallback } from "react";
import { Dumbbell, Loader2, AlertCircle, ChevronDown, Trophy, Repeat } from "lucide-react";
import { SeancesHero } from "@/components/fitness/SeancesHero";
import { ChoisirEpreuveCard } from "@/components/fitness/ChoisirEpreuveCard";
import { LaForgeCard } from "@/components/fitness/LaForgeCard";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { RepeatLiveConfirmDialog } from "@/components/fitness/RepeatLiveConfirmDialog";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { GenericHistoryCard } from "@/components/fitness/session/GenericHistoryCard";
import { GenericSessionReviewSheet } from "@/components/fitness/session/GenericSessionReviewSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { StartWorkoutSheet } from "@/components/fitness/StartWorkoutSheet";
import { NewSessionSheet } from "@/components/fitness/templates/NewSessionSheet";
import { SavedTemplatesSheet } from "@/components/fitness/templates/SavedTemplatesSheet";
import { TemplateEditorSheet } from "@/components/fitness/templates/TemplateEditorSheet";
import { ActiveWorkoutView } from "@/components/fitness/ActiveWorkoutView";
import { ActiveGenericSessionView } from "@/components/fitness/session/ActiveGenericSessionView";
import { ExerciseCatalogSheet } from "@/components/fitness/ExerciseCatalogSheet";
import { ForgeDisciplineChooser } from "@/components/fitness/ForgeDisciplineChooser";
import { DisciplineExerciseLibrarySheet } from "@/components/fitness/DisciplineExerciseLibrarySheet";
import { PostWorkoutAnalysisSheet } from "@/components/fitness/PostWorkoutAnalysisSheet";
import { GenericPostWorkoutAnalysisSheet } from "@/components/fitness/session/GenericPostWorkoutAnalysisSheet";
import { ChroniquePage } from "@/components/fitness/chronique/ChroniquePage";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import {
  useExerciseImageUrls,
  useWorkouts,
  useActiveWorkout,
  useStartWorkoutFromTemplate,
  type ActiveWorkout,
} from "@/hooks/use-fitness";
import {
  useActiveGenericWorkout,
  useStartGenericActiveWorkout,
  type ActiveGenericWorkout,
} from "@/hooks/useGenericActiveSession";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";

import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  isReadyEngine,
  type DisciplineId,
  type WorkoutRecordDraft,
} from "@/lib/fitness/engines/types";
import { workoutToTemplateSeed, type TemplateSeedExercise } from "@/lib/fitness/workoutTemplates";

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekdayLabel(iso: string) {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("fr-FR", { weekday: "short" })
    .replace(".", "");
}

// ── Composant principal ─────────────────────────────────────────────────────────

export function SeancesTab() {
  const { data, isLoading, error } = useWorkouts();
  const { data: activeWorkout, isLoading: activeLoading } = useActiveWorkout();
  // Phase pilote Course (2026-07-09) : séance active générique (segments
  // éditables live, voir useGenericActiveSession.ts) — musculation et
  // générique ne sont jamais actives simultanément (garde côté hook).
  const { data: activeGeneric, isLoading: activeGenericLoading } = useActiveGenericWorkout();
  const startGenericActive = useStartGenericActiveWorkout();
  const recoveryMap = useRecoveryMap(data);

  const recentWorkouts = useMemo(() => (data ?? []).slice(0, 5), [data]);

  const [startOpen, setStartOpen] = useState(false);
  // Phase A (15/07/2026) — porte d'entrée unique "Nouvelle séance" :
  // remplace l'ancien choix "Choisir une épreuve" (NewSessionChoiceSheet,
  // musculation uniquement) par un écran discipline -> mode couvrant les 6
  // disciplines (voir NewSessionSheet.tsx). NewSessionChoiceSheet.tsx
  // n'est pas supprimé (A.7), simplement plus monté depuis cet écran.
  const [newSessionSheetOpen, setNewSessionSheetOpen] = useState(false);
  const [savedTemplatesOpen, setSavedTemplatesOpen] = useState(false);
  const [open, setOpen] = useState(false);
  // C2 : le snapshot de la séance clôturée vit ici pour que la fiche d'analyse
  // IA survive au démontage d'ActiveWorkoutView.
  const [finishedSnapshot, setFinishedSnapshot] = useState<ActiveWorkout | null>(null);
  // Phase C, lot V2 (P0-2) : pendant générique — le bilan IA se déclenche
  // désormais aussi à la clôture des 5 autres disciplines (l'ancien
  // onFinished était un no-op, AUCUN retour après le confetti).
  const [finishedGenericSnapshot, setFinishedGenericSnapshot] =
    useState<ActiveGenericWorkout | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  // "Enregistrer comme séance sauvegardée" (menu ⋮) : ouvre l'éditeur de
  // modèle déjà développé (Module 2) en mode CRÉATION, pré-rempli depuis la
  // séance passée sélectionnée. Sans lien avec `template`/`open` ci-dessus,
  // qui restent la saisie rétroactive "Enregistrer comme séance passée".
  const [templateSeed, setTemplateSeed] = useState<{
    name: string;
    exercises: TemplateSeedExercise[];
  } | null>(null);
  const [genericDraft, setGenericDraft] = useState<WorkoutRecordDraft | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  // Phase A (15/07/2026) : discipline déjà choisie par NewSessionSheet
  // avant d'ouvrir CoachSheet en mode "Coach IA" — évite de la choisir
  // deux fois.
  const [coachInitialDiscipline, setCoachInitialDiscipline] = useState<DisciplineId | undefined>(
    undefined,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  // LOT C1 — module immersif « Chronique » : toucher une chronique de
  // musculation ouvre une page plein écran dédiée (ChroniquePage). La liste
  // des Chroniques ne change pas — seule l'action au clic ouvre ce module.
  const [chronicleWorkout, setChronicleWorkout] = useState<WorkoutRow | null>(null);
  const openChronicle = useCallback((w: WorkoutRow) => setChronicleWorkout(w), []);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // Phase 1 multi-discipline (2026-07-11) : une seule Forge, avec un choix
  // de discipline avant d'ouvrir soit le catalogue muscu existant
  // (inchangé), soit la nouvelle bibliothèque générique par discipline.
  const [forgeChooserOpen, setForgeChooserOpen] = useState(false);
  const [libraryDiscipline, setLibraryDiscipline] = useState<DisciplineId | null>(null);
  const handleForgePick = (discipline: DisciplineId) => {
    setForgeChooserOpen(false);
    if (discipline === "muscu") setCatalogOpen(true);
    else setLibraryDiscipline(discipline);
  };

  const { prByName, histByName, volByName, prByGym, histByGym, nameByKey, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const allImagePaths = useMemo(
    () =>
      historyOpen
        ? (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path))
        : [],
    [data, historyOpen],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);
  const latestDate = useMemo(() => data?.[0]?.date ?? "", [data]);

  // H1 : « Refaire » démarre une séance LIVE pré-remplie.
  const startFromTemplate = useStartWorkoutFromTemplate();
  // Étape 0.3 (U3, confirmation légère) : « Refaire en live » démarre
  // immédiatement une séance active — une confirmation évite un
  // déclenchement accidentel (double-tap, clic hâtif dans la liste
  // repliée). Centralisé ici : couvre les deux points d'entrée (↻ de la
  // liste repliée ci-dessous, et WorkoutCard.tsx dont le bouton/menu
  // "Refaire" appelle ce même callback via onRepeatLive). Phase C, lot V1
  // (P1-6) : le window.confirm() natif (hors charte, bloquait les onglets
  // de test Phase B) cède la place au dialogue custom partagé
  // RepeatLiveConfirmDialog — même comportement, même garde isPending.
  const [repeatCandidate, setRepeatCandidate] = useState<WorkoutRow | null>(null);
  const repeatLive = useCallback(
    (w: WorkoutRow) => {
      if (startFromTemplate.isPending) return;
      setRepeatCandidate(w);
    },
    [startFromTemplate],
  );
  const confirmRepeatLive = useCallback(() => {
    const w = repeatCandidate;
    setRepeatCandidate(null);
    if (!w || startFromTemplate.isPending) return;
    startFromTemplate.mutate({
      name: w.name,
      gym_location: (w as { gym_location?: string | null }).gym_location ?? null,
      exercises: w.exercises ?? [],
    });
  }, [repeatCandidate, startFromTemplate]);

  // Saisie rétroactive (ancien « Refaire ») — accessible via le menu ⋮ d'une séance.
  const openFromTemplate = useCallback((w: WorkoutRow) => {
    if (!w.id || !w.exercises) return;
    setTemplate({
      name: w.name || "Séance sans nom",
      exercises: (w.exercises ?? []).map((ex) => ({
        name: ex.name || "Exercice inconnu",
        sets: ex.sets != null ? String(ex.sets) : "",
        reps: ex.reps != null ? String(ex.reps) : "",
        weight: ex.weight != null ? String(ex.weight) : "",
        image_path: ex.image_path ?? null,
      })),
    });
    setOpen(true);
  }, []);

  // Crée un NOUVEAU modèle réutilisable à partir d'une séance passée —
  // accessible via le menu ⋮ d'une séance, distinct et sans impact sur
  // openFromTemplate ci-dessus.
  const saveAsTemplate = useCallback((w: WorkoutRow) => {
    setTemplateSeed({
      name: w.name || "",
      exercises: workoutToTemplateSeed(w.exercises ?? []),
    });
  }, []);

  const handleCoachResult = useCallback(
    (tpl: WorkoutTemplate, draft: WorkoutRecordDraft) => {
      setCoachOpen(false);
      // Musculation garde WorkoutSheet (édition fine, intouché). Phase
      // pilote Course (2026-07-09) : un moteur avec supportsLiveTracking
      // démarre directement une séance ACTIVE éditable (voir
      // ActiveGenericSessionView) au lieu de l'écran de relecture générique
      // — décision prise une seule fois ici, via le registre (aucun
      // if/switch sur "course" ailleurs), donc automatiquement applicable
      // à un futur moteur qui poserait le même flag.
      const entry = ENGINE_REGISTRY[draft.discipline];
      const isStrength =
        entry && isReadyEngine(entry) && entry.historyPresentation.cardVariant === "strength";
      const isLiveTrackable = entry && isReadyEngine(entry) && entry.supportsLiveTracking === true;
      if (isStrength) {
        setTemplate(tpl);
        setOpen(true);
      } else if (isLiveTrackable && entry.buildLiveSegments) {
        const seedSegments = entry.buildLiveSegments(tpl, draft);
        startGenericActive.mutate({ draft, seedSegments });
      } else {
        setGenericDraft(draft);
      }
    },
    [startGenericActive],
  );

  // Phase A (15/07/2026) : ouvre CoachSheet directement sur la discipline
  // choisie dans NewSessionSheet, sans repasser par son étape interne de
  // choix. Remplace l'ancien `openCoach()` (déclencheur retiré avec
  // SenseiIACard, qui l'appelait déjà systématiquement sans argument —
  // aucune fonctionnalité réelle perdue par ce nettoyage).
  const openCoachForDiscipline = useCallback((discipline: DisciplineId) => {
    setCoachInitialDiscipline(discipline);
    setCoachOpen(true);
  }, []);

  if ((activeLoading || activeGenericLoading) && isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── VUE SÉANCE ACTIVE GÉNÉRIQUE (phase pilote Course, 2026-07-09) ────────
  // Vérifiée AVANT activeWorkout : les deux requêtes sont mutuellement
  // exclusives (garde côté useStartGenericActiveWorkout/useStartWorkout),
  // mais on privilégie explicitement la vue musculation si jamais les deux
  // étaient renvoyées (comportement identique à avant ce chantier).
  if (!activeWorkout && activeGeneric) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveGenericSessionView workout={activeGeneric} onFinished={setFinishedGenericSnapshot} />
        {/* Lot V2 : monté aussi ici (comme le pendant muscu ci-dessous) pour
            survivre à la transition séance active → vue historique. */}
        {finishedGenericSnapshot && (
          <GenericPostWorkoutAnalysisSheet
            workout={finishedGenericSnapshot}
            onClose={() => setFinishedGenericSnapshot(null)}
          />
        )}
      </section>
    );
  }

  // ── VUE SÉANCE ACTIVE ──────────────────────────────────────────────────────
  if (activeWorkout) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveWorkoutView
          workout={activeWorkout}
          recoveryMap={recoveryMap}
          onFinished={setFinishedSnapshot}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
        {finishedSnapshot && (
          <PostWorkoutAnalysisSheet
            workout={finishedSnapshot}
            workoutId={finishedSnapshot.id}
            previousWorkouts={data ?? []}
            recoveryMap={recoveryMap}
            onClose={() => setFinishedSnapshot(null)}
          />
        )}
        {/* Catalogue accessible aussi pendant une séance active — bibliothèque
            de référence du module Exercices, atteignable partout dans l'app. */}
        {catalogOpen && (
          <ExerciseCatalogSheet
            onClose={() => setCatalogOpen(false)}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
          />
        )}
      </section>
    );
  }

  // ── VUE CHRONIQUE IMMERSIVE (LOT C1) ────────────────────────────────────────
  // Ouverte depuis la liste des Chroniques (carte ou ligne compacte muscu).
  // Rendue comme une vraie page (early-return, même pattern qu'ActiveWorkoutView) :
  // aucun modal, aucun drawer. « Retour » referme, prev/next navigue.
  if (chronicleWorkout) {
    return (
      <ChroniquePage
        workout={chronicleWorkout}
        allWorkouts={data ?? []}
        prByName={prByName}
        histByName={histByName}
        nameByKey={nameByKey}
        onBack={() => setChronicleWorkout(null)}
        onNavigate={setChronicleWorkout}
      />
    );
  }

  // ── VUE HISTORIQUE ─────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">
      {/* ── Hero — respiration d'ambiance ───────────────────────────── */}
      <SeancesHero />

      {/* ── Nouvelle séance — porte d'entrée unique (Phase A, A.1) ───── */}
      <ChoisirEpreuveCard onClick={() => setNewSessionSheetOpen(true)} />

      {/* ── La Forge — atelier de sélection des techniques ──────────── */}
      <SectionReveal delay={0.05}>
        <LaForgeCard onClick={() => setForgeChooserOpen(true)} />
      </SectionReveal>

      {error && !isLoading && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">Erreur de chargement</h3>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error ? error.message : "Une erreur est survenue"}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── CHRONIQUES COMPLÈTES — source unique de l'historique : vue
          compacte (dernières séances) repliée, vue détaillée (graphes
          + historique complet) dépliée. ─────────────────────────────── */}
      {data && !isLoading && data.length > 0 && (
        <SectionReveal>
          <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-card backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
              aria-expanded={historyOpen}
            >
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span className="font-serif text-[13px] font-semibold italic text-white/90">
                  Chroniques complètes
                </span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
                  {data.length}
                </span>
              </span>
              <ChevronDown
                className={
                  "h-4 w-4 text-muted-foreground transition-transform " +
                  (historyOpen ? "rotate-180" : "")
                }
              />
            </button>

            {!historyOpen && (
              <div className="px-5 pb-5">
                <ul className="space-y-2">
                  {recentWorkouts.map((w) => {
                    // Étape 0.3 (U3) : "Refaire" (repeatLive) passe par
                    // useStartWorkoutFromTemplate (use-fitness.ts), un
                    // parcours muscu-only (exercises, pas de segments/
                    // discipline) — même convention de détection que
                    // ligne 355 ci-dessous (routage WorkoutCard vs carte
                    // générique). Le bouton ↻ ne doit donc apparaître que
                    // pour les séances muscu ; les autres disciplines
                    // restent visibles dans la liste, simplement sans ↻.
                    const isMuscu = ((w.discipline as DisciplineId | null) ?? "muscu") === "muscu";
                    return (
                      <li
                        key={w.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                      >
                        {isMuscu ? (
                          <button
                            type="button"
                            onClick={() => openChronicle(w)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-70"
                            aria-label={`Ouvrir la chronique ${w.name || "Séance"}`}
                          >
                            <span className="w-9 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
                              {weekdayLabel(w.date)}
                            </span>
                            <span className="truncate text-xs font-semibold text-white/90">
                              {w.name || "Séance"}
                            </span>
                          </button>
                        ) : (
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="w-9 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
                              {weekdayLabel(w.date)}
                            </span>
                            <span className="truncate text-xs font-semibold text-white/90">
                              {w.name || "Séance"}
                            </span>
                          </div>
                        )}
                        {isMuscu && (
                          <button
                            type="button"
                            onClick={() => repeatLive(w)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary"
                            title="Refaire cette séance"
                            aria-label="Refaire cette séance"
                          >
                            <Repeat className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {historyOpen && (
              <div className="px-3 pb-4">
                <WorkoutProgressCharts
                  topExercises={topExercises}
                  histByName={histByName}
                  prByName={prByName}
                  nameByKey={nameByKey}
                />
                <ul className="mt-3 space-y-3">
                  {data.map((w) => {
                    // Musculation garde WorkoutCard tel quel (intouché) ; toute
                    // autre discipline route vers la carte générique — décision
                    // prise une seule fois ici, jamais dupliquée par discipline.
                    const entry = ENGINE_REGISTRY[(w.discipline as DisciplineId | null) ?? "muscu"];
                    const isStrength =
                      !entry ||
                      !isReadyEngine(entry) ||
                      entry.historyPresentation.cardVariant === "strength";
                    if (!isStrength) {
                      return <GenericHistoryCard key={w.id} workout={w} />;
                    }
                    return (
                      <WorkoutCard
                        key={w.id}
                        w={w}
                        prByName={prByName}
                        histByName={histByName}
                        volByName={volByName}
                        prByGym={prByGym}
                        histByGym={histByGym}
                        imageUrls={listImageUrls}
                        latestDate={latestDate}
                        onRepeatLive={repeatLive}
                        onOpenFromTemplate={openFromTemplate}
                        onSaveAsTemplate={saveAsTemplate}
                        onOpenChronicle={openChronicle}
                      />
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </SectionReveal>
      )}

      {data && data.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lance-toi, ta première légende t'attend.
          </p>
        </div>
      )}

      {/* ── SCAN DES TITANS — récupération musculaire ───────────────── */}
      {data && (
        <SectionReveal>
          <BodyMap mode="recovery" recoveryMap={recoveryMap} />
        </SectionReveal>
      )}

      {newSessionSheetOpen && (
        <NewSessionSheet
          onClose={() => setNewSessionSheetOpen(false)}
          onChooseBlankMuscu={() => setStartOpen(true)}
          onChooseSavedMuscu={() => setSavedTemplatesOpen(true)}
          onChooseCoach={openCoachForDiscipline}
        />
      )}

      {startOpen && <StartWorkoutSheet onClose={() => setStartOpen(false)} />}

      {savedTemplatesOpen && (
        <SavedTemplatesSheet
          onClose={() => setSavedTemplatesOpen(false)}
          onStarted={() => setSavedTemplatesOpen(false)}
        />
      )}

      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={() => {
            setOpen(false);
            setTemplate(null);
          }}
        />
      )}

      {templateSeed && (
        <TemplateEditorSheet
          seedName={templateSeed.name}
          seedExercises={templateSeed.exercises}
          onClose={() => setTemplateSeed(null)}
        />
      )}

      {coachOpen && (
        <CoachSheet
          onClose={() => {
            setCoachOpen(false);
            setCoachInitialDiscipline(undefined);
          }}
          onResult={handleCoachResult}
          initialDiscipline={coachInitialDiscipline}
        />
      )}

      {genericDraft && (
        <GenericSessionReviewSheet
          draft={genericDraft}
          onClose={() => setGenericDraft(null)}
          onSaved={() => setGenericDraft(null)}
        />
      )}

      {catalogOpen && (
        <ExerciseCatalogSheet
          onClose={() => setCatalogOpen(false)}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
        />
      )}

      {forgeChooserOpen && (
        <ForgeDisciplineChooser
          onClose={() => setForgeChooserOpen(false)}
          onPick={handleForgePick}
        />
      )}

      {libraryDiscipline && (
        <DisciplineExerciseLibrarySheet
          discipline={libraryDiscipline}
          onClose={() => setLibraryDiscipline(null)}
        />
      )}

      {/* Phase C, lot V1 (P1-6) : confirmation "Refaire en live" custom,
          partagée avec GenericHistoryCard — plus aucun window.confirm. */}
      {repeatCandidate && (
        <RepeatLiveConfirmDialog
          workoutName={repeatCandidate.name || "cette séance"}
          onConfirm={confirmRepeatLive}
          onCancel={() => setRepeatCandidate(null)}
        />
      )}

      {/* C2 : fiche d'analyse IA — rendue aussi hors séance active */}
      {finishedSnapshot && (
        <PostWorkoutAnalysisSheet
          workout={finishedSnapshot}
          workoutId={finishedSnapshot.id}
          previousWorkouts={data ?? []}
          recoveryMap={recoveryMap}
          onClose={() => setFinishedSnapshot(null)}
        />
      )}

      {/* Lot V2 : bilan IA générique — rendu aussi hors séance active */}
      {finishedGenericSnapshot && (
        <GenericPostWorkoutAnalysisSheet
          workout={finishedGenericSnapshot}
          onClose={() => setFinishedGenericSnapshot(null)}
        />
      )}
    </section>
  );
}
