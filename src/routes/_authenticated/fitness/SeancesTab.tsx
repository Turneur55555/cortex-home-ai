import { useMemo, useState, useCallback } from "react";
import { Dumbbell, Loader2, AlertCircle } from "lucide-react";
import { SeancesHero } from "@/components/fitness/SeancesHero";
import { ChoisirEpreuveCard } from "@/components/fitness/ChoisirEpreuveCard";
import { LaForgeCard } from "@/components/fitness/LaForgeCard";
import { BodyMap } from "@/components/fitness/BodyMap";
import { type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { RepeatLiveConfirmDialog } from "@/components/fitness/RepeatLiveConfirmDialog";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { GenericSessionReviewSheet } from "@/components/fitness/session/GenericSessionReviewSheet";
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
import { LivreChroniquesCard } from "@/components/fitness/chronique/LivreChroniquesCard";
import { LivreChroniquesPage } from "@/components/fitness/chronique/LivreChroniquesPage";
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
  // LOT C2 — « Le Livre des Chroniques » : troisième pilier de la page,
  // ouvert par la Hero Card (l'accordéon historique est supprimé). Page
  // plein écran (early-return, même système qu'ActiveWorkoutView).
  const [bookOpen, setBookOpen] = useState(false);
  // LOT C1 — module immersif « Chronique » : toucher une chronique de
  // musculation (désormais depuis la Chronologie du Livre) ouvre une page
  // plein écran dédiée (ChroniquePage).
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

  const { prByName, histByName, volByName, prByGym, histByGym, nameByKey } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  // Les URLs signées des photos d'exercices ne sont résolues que quand le
  // Livre est ouvert (même optimisation que l'ancien accordéon déplié).
  const allImagePaths = useMemo(
    () =>
      bookOpen ? (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)) : [],
    [data, bookOpen],
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

  // ── VUE « LE LIVRE DES CHRONIQUES » (LOT C2) ────────────────────────────────
  // Ouverte par la Hero Card. Vraie page plein écran (early-return, même
  // système qu'ActiveWorkoutView) — Hall of Fame, Légendes, Techniques
  // oubliées, Potentiel caché, Spécialisations, Galerie des Records, puis la
  // Chronologie (les cartes de séances, chacune ouvre la Chronique immersive
  // du C1). Vérifiée AVANT la Chronique : ouvrir une chronique se fait depuis
  // le Livre, on doit donc pouvoir revenir au Livre, pas à la page Séances.
  if (bookOpen && !chronicleWorkout) {
    return (
      <LivreChroniquesPage
        workouts={data ?? []}
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
        onBack={() => setBookOpen(false)}
      />
    );
  }

  // ── VUE CHRONIQUE IMMERSIVE (LOT C1) ────────────────────────────────────────
  // Ouverte depuis la Chronologie du Livre. Rendue comme une vraie page
  // (early-return, même pattern qu'ActiveWorkoutView) : aucun modal, aucun
  // drawer. « Retour » revient au Livre (bookOpen reste vrai), prev/next navigue.
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

      {/* ── LE LIVRE DES CHRONIQUES — troisième pilier (LOT C2) : plus
          d'accordéon ni de liste ici, une Hero Card au même poids visuel
          que l'Arène et La Forge, qui ouvre le module plein écran. ──── */}
      {data && !isLoading && (
        <SectionReveal delay={0.1}>
          <LivreChroniquesCard onClick={() => setBookOpen(true)} />
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
