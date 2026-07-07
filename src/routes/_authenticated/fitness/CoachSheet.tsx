// ============================================================
// Sensei^IA — orchestrateur conversationnel (phase 2).
//
// Ce composant ne connaît AUCUNE règle propre à une discipline : il
// lit ENGINE_REGISTRY, pose les questions déclarées par le moteur
// choisi (WorkoutEngine.questions), délègue le rendu de chaque
// question à QuestionRenderer (générique + registre de widgets
// spéciaux) et appelle engine.generate() pour produire la séance.
// Ajouter une discipline (phase 3+) ne nécessite AUCUNE modification
// de ce fichier — seulement une entrée dans ENGINE_REGISTRY.
//
// Props externes inchangées depuis la phase 1 (onClose/onResult/
// initialMuscles/recoveryMap) : SeancesTab.tsx n'a rien à changer.
// ============================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { DisciplineIcon } from "@/components/fitness/session/DisciplineIcon";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { ENGINE_REGISTRY, listEngines } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import type {
  DisciplineId,
  SenseiAnswerValue,
  SenseiAnswers,
  WorkoutRecordDraft,
  WorkoutTemplate,
} from "@/lib/fitness/engines/types";
import {
  QuestionRenderer,
  formatAnswerForSummary,
  isAnswerValid,
} from "@/components/fitness/sensei/QuestionRenderer";
import { DISCIPLINE_CONTEXT_BUILDERS } from "@/components/fitness/sensei/senseiCustomRenderers";
import type { SenseiRuntimeInputs } from "@/components/fitness/sensei/senseiCustomRenderers";
import { useWorkouts } from "@/hooks/use-fitness";
import { useGoalsWithProgress } from "@/hooks/useGoalsWithProgress";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { buildSenseiBriefing, type SenseiBriefing } from "@/lib/fitness/engines/senseiBriefing";

// Réexporté pour rétro-compat : WorkoutSheet.tsx et SeancesTab.tsx importent
// ce type depuis ce fichier. La définition canonique vit dans l'interface
// commune des moteurs (src/lib/fitness/engines/types.ts) depuis la phase 1.
export type { WorkoutTemplate } from "@/lib/fitness/engines/types";

// Phase 7 : l'icône n'est plus dupliquée ici — chaque moteur porte la
// sienne (EngineDescriptor.icon, voir types.ts), résolue par le même
// composant que l'historique (DisciplineIcon.tsx). Ajouter une
// discipline ne touche plus ce fichier, même pour son icône.

type Step = "discipline" | "question" | "summary";

export function CoachSheet({
  onClose,
  onResult,
  initialMuscles,
  recoveryMap,
}: {
  onClose: () => void;
  /** `draft` porte déjà `discipline` — SeancesTab route sur cardVariant
   *  sans avoir besoin d'un paramètre séparé. `template` reste fourni
   *  pour WorkoutSheet.tsx (musculation), intouché depuis la phase 1. */
  onResult: (template: WorkoutTemplate, draft: WorkoutRecordDraft) => void;
  initialMuscles?: string[];
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
}) {
  const recovery = useMemo(() => recoveryMap ?? new Map<MuscleId, MuscleRecovery>(), [recoveryMap]);
  const hasInitialMuscles = Boolean(initialMuscles && initialMuscles.length > 0);

  // Phase 8 — "Sensei briefing" : le Sensei PRÉPARE ces informations (lecture
  // seule, purement informatif) sans jamais en déduire un choix — c'est
  // exactement la frontière avec le futur Planner Engine (voir SenseiContext
  // dans types.ts, et l'en-tête de senseiBriefing.ts). N'affecte ni le
  // dialogue ni answers/disciplineId.
  const { data: briefingWorkouts } = useWorkouts();
  const { goals: briefingGoals } = useGoalsWithProgress();
  const { prByName: briefingPrByName, nameByKey: briefingNameByKey } = useMemo(
    () => computePRs(briefingWorkouts ?? []),
    [briefingWorkouts],
  );
  const briefingBestPR = useMemo(() => {
    let bestKey: string | null = null;
    let bestWeight = 0;
    for (const [key, weight] of briefingPrByName) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestKey = key;
      }
    }
    return bestKey ? { name: briefingNameByKey.get(bestKey) ?? bestKey, weight: bestWeight } : null;
  }, [briefingPrByName, briefingNameByKey]);
  const briefing = useMemo(
    () =>
      buildSenseiBriefing({
        workouts: briefingWorkouts ?? [],
        bestPR: briefingBestPR,
        goals: briefingGoals,
        recoveryMap: recovery,
      }),
    [briefingWorkouts, briefingBestPR, briefingGoals, recovery],
  );

  // Si on arrive avec des muscles pré-sélectionnés (tap sur la BodyMap), on
  // saute directement dans le flux Musculation — comme aujourd'hui, où le
  // mode par défaut était déjà "muscu". L'utilisateur peut revenir en
  // arrière vers le choix de discipline via "Précédent".
  const [step, setStep] = useState<Step>(hasInitialMuscles ? "question" : "discipline");
  const [disciplineId, setDisciplineId] = useState<DisciplineId | null>(
    hasInitialMuscles ? "muscu" : null,
  );
  const [answers, setAnswers] = useState<SenseiAnswers>(() => {
    if (!hasInitialMuscles) return {};
    const defaults: SenseiAnswers = {};
    for (const q of ENGINE_REGISTRY.muscu.questions ?? []) {
      if (q.defaultValue !== undefined) defaults[q.id] = q.defaultValue;
    }
    return { ...defaults, muscles: initialMuscles };
  });
  const [questionIndex, setQuestionIndex] = useState(0);

  const entry = disciplineId ? ENGINE_REGISTRY[disciplineId] : null;
  const engine = entry && isReadyEngine(entry) ? entry : null;

  const questions = useMemo(
    () => (engine ? engine.questions.filter((q) => !q.when || q.when(answers)) : []),
    [engine, answers],
  );
  const currentQuestion = questions[questionIndex];

  const selectDiscipline = (id: DisciplineId) => {
    const candidate = ENGINE_REGISTRY[id];
    if (!isReadyEngine(candidate)) return; // comingSoon — désactivé dans l'UI, garde défensive.

    const defaults: SenseiAnswers = {};
    for (const q of candidate.questions) {
      if (q.defaultValue !== undefined) defaults[q.id] = q.defaultValue;
    }
    setDisciplineId(id);
    setAnswers({
      ...defaults,
      ...(id === "muscu" && hasInitialMuscles ? { muscles: initialMuscles } : {}),
    });
    setQuestionIndex(0);
    setStep("question");
  };

  const answerCurrent = (value: SenseiAnswerValue) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const goNext = () => {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      setStep("summary");
    }
  };

  const goBack = () => {
    if (step === "summary") {
      setQuestionIndex(Math.max(0, questions.length - 1));
      setStep("question");
      return;
    }
    if (questionIndex > 0) {
      setQuestionIndex((i) => i - 1);
      return;
    }
    setStep("discipline");
    setDisciplineId(null);
  };

  const generate = useMutation({
    mutationFn: async (): Promise<{ template: WorkoutTemplate; draft: WorkoutRecordDraft }> => {
      if (!engine) throw new Error("Aucun moteur disponible pour cette discipline.");
      // Phase 5 : sac générique (voir SenseiRuntimeInputs) — `wearable` reste
      // undefined tant qu'aucun connecteur (Apple Santé/Garmin/Strava...)
      // n'est branché ; un moteur (ex: Course) peut le lire sans jamais
      // supposer qu'il est renseigné.
      const runtimeInputs: SenseiRuntimeInputs = { recoveryMap: recovery };
      const context = DISCIPLINE_CONTEXT_BUILDERS[engine.id]?.(answers, runtimeInputs) ?? {};
      const template = await engine.generate(answers, context);
      const draft = engine.toWorkoutRecord(template, answers);
      return { template, draft };
    },
    onSuccess: ({ template, draft }: { template: WorkoutTemplate; draft: WorkoutRecordDraft }) => {
      toast.success("Séance générée — ajuste-la avant d'enregistrer");
      onResult(template, draft);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title =
    step === "discipline"
      ? "Sensei — Quel entraînement aujourd'hui ?"
      : step === "summary"
        ? "Sensei — Résumé"
        : `Sensei — ${currentQuestion?.prompt ?? ""}`;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-4">
        {step !== "discipline" && (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Précédent
          </button>
        )}

        {step === "discipline" && <SenseiBriefingPanel briefing={briefing} />}

        {step === "discipline" && (
          <div className="grid grid-cols-2 gap-2">
            {listEngines().map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={e.comingSoon}
                onClick={() => selectDiscipline(e.id)}
                className={
                  "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-semibold transition-colors " +
                  (e.comingSoon
                    ? "cursor-not-allowed border-border bg-surface/50 text-muted-foreground/50"
                    : `border-border bg-card text-foreground hover:border-primary/40 ${e.accentClassName}`)
                }
              >
                <DisciplineIcon icon={e.icon} className="h-5 w-5" />
                {e.label}
                {e.comingSoon && (
                  <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/70">
                    Bientôt disponible
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {step === "question" && currentQuestion && engine && (
          <div className="space-y-4">
            <QuestionRenderer
              disciplineId={engine.id}
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={answerCurrent}
              recoveryMap={recovery}
            />
            <button
              type="button"
              onClick={goNext}
              disabled={!isAnswerValid(currentQuestion, answers[currentQuestion.id])}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {questionIndex < questions.length - 1 ? "Suivant" : "Voir le résumé"}
            </button>
          </div>
        )}

        {step === "summary" && engine && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
              {questions.map((q) => (
                <div key={q.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{q.prompt}</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerForSummary(q, answers[q.id])}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {generate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {generate.isPending ? "Génération…" : "⚔️ Forger mon épreuve"}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// Phase 8 — panneau informatif, lecture seule, affiché uniquement à
// l'étape "quelle discipline ?" : prouve concrètement que "le Sensei
// connaît ces informations" sans jamais les utiliser pour décider à la
// place de l'utilisateur (aucun disciplineId ni answer n'est pré-rempli
// à partir de ce panneau).
function SenseiBriefingPanel({ briefing }: { briefing: SenseiBriefing }) {
  const hasContent =
    briefing.recentDisciplines.length > 0 ||
    briefing.activeGoals.length > 0 ||
    briefing.bestPR != null ||
    briefing.recovery.fatiguedCount > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-surface/60 p-3 text-[11px] text-muted-foreground">
      {briefing.recentDisciplines.length > 0 && (
        <p>
          <span className="font-semibold text-foreground/80">Dernièrement : </span>
          {briefing.recentDisciplines.map((d) => ENGINE_REGISTRY[d.discipline].label).join(", ")}
          {` · ${briefing.totalSessions} séances (${briefing.weeklySessions} cette semaine)`}
        </p>
      )}
      {briefing.bestPR && (
        <p>
          <span className="font-semibold text-foreground/80">Record : </span>
          {briefing.bestPR.name} {briefing.bestPR.weight} kg
        </p>
      )}
      {briefing.activeGoals.length > 0 && (
        <p>
          <span className="font-semibold text-foreground/80">Objectifs actifs : </span>
          {briefing.activeGoals.map((g) => `${g.title} (${g.progress}%)`).join(" · ")}
        </p>
      )}
      {briefing.recovery.fatiguedCount > 0 && (
        <p>
          <span className="font-semibold text-foreground/80">Récupération : </span>
          {briefing.recovery.readyCount} groupe(s) prêt(s)
          {briefing.recovery.mostFatigued.length > 0 &&
            ` · encore en repos : ${briefing.recovery.mostFatigued.join(", ")}`}
        </p>
      )}
    </div>
  );
}
