import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dumbbell, Loader2, AlertCircle } from "lucide-react";
import { SeancesHero } from "@/components/fitness/SeancesHero";
import { ChoisirEpreuveCard } from "@/components/fitness/ChoisirEpreuveCard";
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
import { PostWorkoutAnalysisSheet } from "@/components/fitness/PostWorkoutAnalysisSheet";
import { GenericPostWorkoutAnalysisSheet } from "@/components/fitness/session/GenericPostWorkoutAnalysisSheet";
import { SessionRewardScreen } from "@/components/fitness/session/SessionRewardScreen";
import { SessionRecapScreen } from "@/components/fitness/session/SessionRecapScreen";
import { ChroniquePage } from "@/components/fitness/chronique/ChroniquePage";
import { ChroniquesPage } from "@/components/fitness/chronique/ChroniquesPage";
import type { ChroniquesRouting } from "@/lib/fitness/chroniquesRouting";
import { SeancesStageSwitch } from "@/components/fitness/SeancesStageSwitch";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { WeekPlanCard } from "@/components/fitness/plan/WeekPlanCard";
import {
  useExerciseImageUrls,
  useWorkouts,
  useActiveWorkout,
  useStartWorkoutFromTemplate,
  useStartHybridStrengthWorkout,
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
import { buildGenericSessionRecap, buildSessionRecap } from "@/lib/fitness/rpg/sessionRecap";
import { computeRecordsBySession } from "@/lib/fitness/chronicles";

// ── Composant principal ─────────────────────────────────────────────────────────

type SeancesTabProps = {
  /** Deep-link (`?demarrer=nouvelle`) depuis la Carte du jour de l'Accueil :
   *  ouvre « Choisir une épreuve » d'office, UNE seule fois, et seulement si
   *  aucune séance n'est en cours (voir l'effet plus bas). */
  initialNewSession?: boolean;
} & (
  | { view?: "arene"; chroniques?: undefined }
  | { view: "chroniques"; chroniques: ChroniquesRouting }
);

export function SeancesTab(props: SeancesTabProps = {}) {
  const { initialNewSession } = props;
  const routing = props.view === "chroniques" ? props.chroniques : null;
  const { data, isLoading, error } = useWorkouts();
  const { data: activeWorkout, isLoading: activeLoading } = useActiveWorkout();
  // Phase pilote Course (2026-07-09) : séance active générique (segments
  // éditables live, voir useGenericActiveSession.ts) — musculation et
  // générique ne sont jamais actives simultanément (garde côté hook).
  const { data: activeGeneric, isLoading: activeGenericLoading } = useActiveGenericWorkout();
  const startGenericActive = useStartGenericActiveWorkout();
  // Musculation hybride générée par le Sensei (2026-08-05) — voir
  // handleCoachResult.
  const startHybridStrength = useStartHybridStrengthWorkout();
  const recoveryMap = useRecoveryMap(data);
  // RECORDS de la carte récap : réutilise le système existant (Hall of Fame,
  // ChroniquePage) — jamais de nouvelle logique de détection de PR.
  const muscuWorkouts = useMemo(
    () => (data ?? []).filter((w) => ((w.discipline as string | undefined) ?? "muscu") === "muscu"),
    [data],
  );
  const recordsBySession = useMemo(() => computeRecordsBySession(muscuWorkouts), [muscuWorkouts]);

  const [startOpen, setStartOpen] = useState(false);
  // Phase A (15/07/2026) — porte d'entrée unique "Nouvelle séance" :
  // remplace l'ancien choix "Choisir une épreuve" (NewSessionChoiceSheet,
  // musculation uniquement) par un écran discipline -> mode couvrant les 6
  // disciplines (voir NewSessionSheet.tsx). NewSessionChoiceSheet.tsx
  // n'est pas supprimé (A.7), simplement plus monté depuis cet écran.
  const [newSessionSheetOpen, setNewSessionSheetOpen] = useState(false);
  // Ouverture demandée par la Carte du jour de l'Accueil : consommée une seule
  // fois, une fois la séance active CONNUE. Ouvrir la feuille d'office à l'état
  // initial la laisserait « armée » derrière la séance en cours, et elle
  // surgirait à la clôture. Si une séance est en cours, on n'ouvre rien : c'est
  // elle qui s'affiche.
  const pendingAutoOpen = useRef(initialNewSession === true);
  useEffect(() => {
    if (!pendingAutoOpen.current) return;
    if (activeLoading || activeGenericLoading) return;
    pendingAutoOpen.current = false;
    if (!activeWorkout && !activeGeneric) setNewSessionSheetOpen(true);
  }, [activeLoading, activeGenericLoading, activeWorkout, activeGeneric]);
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
  // R2 : à la clôture, l'écran de récompense (SessionRewardScreen) s'affiche
  // d'abord ; le bilan IA détaillé n'apparaît que si l'utilisateur le demande
  // (jamais empilé automatiquement — « un seul écran »).
  const [analysisRequested, setAnalysisRequested] = useState(false);
  // 2e écran du flow de clôture : carte récap partageable, affichée après
  // « Continuer » sur l'écran de récompense (inchangé).
  const [recapOpen, setRecapOpen] = useState(false);
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
  // Les Chroniques sont une VRAIE ROUTE (`/chroniques`, E20) : ni état local « ouvert / fermé »,
  // ni Chronique ouverte retenue en mémoire — tout vient de l'URL, via `routing`. Le retour
  // arrière du navigateur, le lien direct et la reprise après rechargement fonctionnent donc.
  // Refonte Chroniques (23/07/2026) : troisième pilier de la page, trois modules pairs — Légendes,
  // Forge, Progression (voir docs/architecture/rpg-chroniques.md).
  const chroniquesView = routing !== null;
  const chronicleId = routing?.chronicleId;
  // LOT C1 — module immersif « Chronique » : toucher une chronique de musculation (depuis la
  // Chronologie du module Progression) ouvre une page plein écran dédiée (ChroniquePage).
  const chronicleWorkout = useMemo(
    () => (chronicleId ? ((data ?? []).find((w) => w.id === chronicleId) ?? null) : null),
    [chronicleId, data],
  );
  // Le contrat de routage est relu à travers une ref : la route le reconstruit à chaque rendu, et
  // l'effet ci-dessous ne doit pas se relancer pour autant (il pourrait naviguer deux fois).
  const routingRef = useRef(routing);
  routingRef.current = routing;
  const openChronicle = useCallback(
    (w: WorkoutRow) => routingRef.current?.onChronicleOpen(w.id, "push"),
    [],
  );
  // Un identifiant de Chronique qui ne correspond à aucune séance (séance supprimée, lien périmé) :
  // on retombe sur la liste des Chroniques plutôt que de rester sur un écran vide. On attend que
  // l'historique soit lu — sinon chaque chargement fermerait la Chronique qu'on vient d'ouvrir.
  useEffect(() => {
    if (!chronicleId || isLoading || !data) return;
    if (data.some((w) => w.id === chronicleId)) return;
    routingRef.current?.onChronicleClose({ replace: true });
  }, [chronicleId, isLoading, data]);
  // Partagé entre le module Forge (Chroniques) et l'accès pendant une
  // séance active (ActiveWorkoutView) — une seule porte pour le catalogue
  // musculation, quel que soit le point d'entrée.
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { prByName, histByName, volByName, prByGym, histByGym, nameByKey, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  // Les URLs signées des photos d'exercices ne sont résolues que quand les
  // Chroniques sont ouvertes (même optimisation que l'ancien accordéon déplié).
  const allImagePaths = useMemo(
    () =>
      chroniquesView
        ? (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path))
        : [],
    [data, chroniquesView],
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
      // Musculation hybride (2026-08-05) : quand le Sensei a composé des
      // blocs métriques (course/HYROX) en plus de la force — voir
      // StrengthWorkoutEngine.toWorkoutRecord, `metadata.blockDiscipline` —
      // démarre directement une séance active hybride (mêmes cartes/mêmes
      // mutations qu'un bloc ajouté à la main) au lieu du chemin classique
      // "relire dans WorkoutSheet puis enregistrer" réservé à la force pure.
      const hybridBlockDiscipline = (
        draft.metadata as { blockDiscipline?: DisciplineId } | undefined
      )?.blockDiscipline;
      if (isStrength && hybridBlockDiscipline && tpl.segments && tpl.segments.length > 0) {
        startHybridStrength.mutate({
          name: tpl.name,
          gym_location: typeof draft.gym_location === "string" ? draft.gym_location : undefined,
          exercises: tpl.exercises,
          segments: tpl.segments,
          blockDiscipline: hybridBlockDiscipline,
        });
      } else if (isStrength) {
        setTemplate(tpl);
        setOpen(true);
      } else if (isLiveTrackable && entry.buildLiveSegments) {
        const seedSegments = entry.buildLiveSegments(tpl, draft);
        startGenericActive.mutate({ draft, seedSegments });
      } else {
        setGenericDraft(draft);
      }
    },
    [startGenericActive, startHybridStrength],
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

  // CHANTIER 9 (B3) — CE LOADER NE CONCERNE QUE LA SÉANCE ACTIVE.
  //
  // Il existe pour une seule raison : tant qu'on ignore s'il y a une séance
  // en cours, afficher la vue historique (« Choisir une épreuve », les
  // Chroniques…) serait un contresens, immédiatement remplacé par la séance
  // active dès la réponse — l'écran clignote.
  //
  // La condition était `(activeLoading || activeGenericLoading) && isLoading`
  // : elle exigeait que l'HISTORIQUE soit AUSSI en cours de chargement pour
  // couvrir la séance active. Or `isLoading` (useWorkouts) est servi par le
  // store local et retombe donc à `false` presque tout de suite, y compris
  // hors ligne : dans le cas courant, le loader disparaissait alors que la
  // séance active n'était pas encore connue, et c'est précisément le
  // clignotement qu'il devait éviter.
  //
  // L'historique, lui, a déjà son propre indicateur dans la vue (le bloc
  // `isLoading` plus bas) : le sortir d'ici n'enlève aucun retour visuel.
  if (activeLoading || activeGenericLoading) {
    return (
      <div
        className="flex h-40 items-center justify-center"
        data-testid="seances-active-workout-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Post-clôture (R2) : écran de récompense premium, puis carte récap ──
  // Flow : clôture → SessionRewardScreen (XP/progression, inchangé) →
  // « Continuer » → SessionRecapScreen (carte partageable) → « Terminer ».
  // Le bilan IA détaillé n'apparaît QUE si l'utilisateur tape « Voir le
  // bilan » depuis l'écran de récompense, jamais empilé automatiquement.
  const closeMuscu = () => {
    setFinishedSnapshot(null);
    setRecapOpen(false);
    setAnalysisRequested(false);
  };
  const closeGeneric = () => {
    setFinishedGenericSnapshot(null);
    setRecapOpen(false);
    setAnalysisRequested(false);
  };

  const muscuPostClose = finishedSnapshot ? (
    !analysisRequested ? (
      recapOpen ? (
        <SessionRecapScreen
          recap={buildSessionRecap(finishedSnapshot.exercises ?? [])}
          date={finishedSnapshot.created_at ? new Date(finishedSnapshot.created_at) : undefined}
          prCount={(recordsBySession.get(finishedSnapshot.id) ?? []).filter((r) => !r.isNew).length}
          onFinish={closeMuscu}
        />
      ) : (
        <SessionRewardScreen
          workoutId={finishedSnapshot.id}
          title={finishedSnapshot.name}
          onContinue={() => setRecapOpen(true)}
          onViewAnalysis={() => setAnalysisRequested(true)}
        />
      )
    ) : (
      <PostWorkoutAnalysisSheet
        workout={finishedSnapshot}
        workoutId={finishedSnapshot.id}
        previousWorkouts={data ?? []}
        recoveryMap={recoveryMap}
        onClose={closeMuscu}
      />
    )
  ) : null;

  const genericPostClose = finishedGenericSnapshot ? (
    !analysisRequested ? (
      recapOpen ? (
        <SessionRecapScreen
          recap={buildGenericSessionRecap(finishedGenericSnapshot.segments ?? [])}
          date={
            finishedGenericSnapshot.created_at
              ? new Date(finishedGenericSnapshot.created_at)
              : undefined
          }
          prCount={0}
          onFinish={closeGeneric}
        />
      ) : (
        <SessionRewardScreen
          workoutId={finishedGenericSnapshot.id}
          title={finishedGenericSnapshot.name}
          onContinue={() => setRecapOpen(true)}
          onViewAnalysis={() => setAnalysisRequested(true)}
        />
      )
    ) : (
      <GenericPostWorkoutAnalysisSheet workout={finishedGenericSnapshot} onClose={closeGeneric} />
    )
  ) : null;

  // ── VUE SÉANCE ACTIVE GÉNÉRIQUE (phase pilote Course, 2026-07-09) ────────
  // Vérifiée AVANT activeWorkout : les deux requêtes sont mutuellement
  // exclusives (garde côté useStartGenericActiveWorkout/useStartWorkout),
  // mais on privilégie explicitement la vue musculation si jamais les deux
  // étaient renvoyées (comportement identique à avant ce chantier).
  if (!activeWorkout && activeGeneric) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveGenericSessionView
          workout={activeGeneric}
          onFinished={(w) => {
            setAnalysisRequested(false);
            setRecapOpen(false);
            setFinishedGenericSnapshot(w);
          }}
        />
        {/* R2 : récompense puis bilan opt-in — monté aussi ici (comme le
            pendant muscu) pour survivre à la transition active → historique. */}
        {genericPostClose}
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
          onFinished={(w) => {
            setAnalysisRequested(false);
            setRecapOpen(false);
            setFinishedSnapshot(w);
          }}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
        {muscuPostClose}
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

  // ── BLOCS PARTAGÉS PAR LES DEUX ÉTAGES ─────────────────────────────────────
  // Feuilles déclenchées depuis l'historique (« Refaire en live », « Enregistrer comme séance
  // passée », « Enregistrer comme séance sauvegardée ») et écrans de récompense de fin de séance.
  // Les Chroniques les déclenchent aussi : montés SEULEMENT dans l'Arène, un appui sur « Refaire »
  // depuis les Chroniques ne montrait rien (mesuré : 0 dialogue visible) — et une séance terminée
  // depuis `/chroniques` aurait perdu son écran de récompense en changeant de vue.
  const sharedSheets = (
    <>
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

      {/* Phase C, lot V1 (P1-6) : confirmation "Refaire en live" custom,
          partagée avec GenericHistoryCard — plus aucun window.confirm. */}
      {repeatCandidate && (
        <RepeatLiveConfirmDialog
          workoutName={repeatCandidate.name || "cette séance"}
          onConfirm={confirmRepeatLive}
          onCancel={() => setRepeatCandidate(null)}
        />
      )}

      {/* R2 : écran de récompense puis bilan IA opt-in — rendus aussi hors
          séance active (survit à la transition active → historique). */}
      {muscuPostClose}
      {genericPostClose}
    </>
  );

  // ── VUE CHRONIQUE IMMERSIVE (LOT C1) ────────────────────────────────────────
  // Ouverte depuis la Chronologie du module Progression (`/chroniques?seance=`). Vraie page plein
  // écran. « Retour » referme (retour arrière du navigateur), précédent / suivant remplace.
  // Vérifiée AVANT la liste : tant que l'historique charge ou que l'identifiant n'est pas résolu,
  // on affiche un chargement, jamais la liste qui clignoterait avant la Chronique.
  if (routing && chronicleId) {
    if (!chronicleWorkout) {
      return (
        <div className="flex h-40 items-center justify-center" data-testid="chronique-loading">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <ChroniquePage
        workout={chronicleWorkout}
        allWorkouts={data ?? []}
        prByName={prByName}
        histByName={histByName}
        nameByKey={nameByKey}
        onBack={() => routing.onChronicleClose()}
        onNavigate={(w) => routing.onChronicleOpen(w.id, "replace")}
      />
    );
  }

  // ── VUE « LES CHRONIQUES » — second étage de Séances (`/chroniques`) ────────
  // Trois modules pairs (Légendes, Forge, Progression) derrière un sélecteur segmenté, sous le
  // sélecteur d'étages « Arène | Chroniques ».
  if (routing) {
    return (
      <section className="flex flex-col gap-4">
        <ChroniquesPage
          module={routing.module}
          onModuleChange={routing.onModuleChange}
          workouts={data ?? []}
          prByName={prByName}
          histByName={histByName}
          volByName={volByName}
          prByGym={prByGym}
          histByGym={histByGym}
          nameByKey={nameByKey}
          topExercises={topExercises}
          imageUrls={listImageUrls}
          latestDate={latestDate}
          onRepeatLive={repeatLive}
          onOpenFromTemplate={openFromTemplate}
          onSaveAsTemplate={saveAsTemplate}
          onOpenChronicle={openChronicle}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
        {/* Le catalogue musculation (module Forge) partage la même porte que
            l'accès pendant une séance active — un seul ExerciseCatalogSheet
            monté pour toute l'app. */}
        {catalogOpen && (
          <ExerciseCatalogSheet
            onClose={() => setCatalogOpen(false)}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
          />
        )}
        {sharedSheets}
      </section>
    );
  }

  // ── VUE HISTORIQUE ─────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">
      {/* ── Les deux étages de Séances : Arène | Chroniques (E20) ─────── */}
      <SeancesStageSwitch active="arene" />

      {/* ── Hero — respiration d'ambiance ───────────────────────────── */}
      <SeancesHero />

      {/* ── Nouvelle séance — porte d'entrée unique (Phase A, A.1) ───── */}
      <ChoisirEpreuveCard onClick={() => setNewSessionSheetOpen(true)} />

      {/* ── Mon rythme — le plan de la semaine (B06) : ce qui est prévu, ce
          qui est fait, ce qui reste. Porte son propre éditeur. ─────────── */}
      <WeekPlanCard />

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

      {sharedSheets}
    </section>
  );
}
