// ============================================================
// Rendu partagé du BILAN de séance — Phase C, lot V2.
//
// Extrait de PostWorkoutAnalysisSheet.tsx (musculation, inchangé dans son
// comportement) pour être réutilisé par trois écrans sans duplication :
// 1. le bilan post-clôture musculation (PostWorkoutAnalysisSheet),
// 2. le bilan post-clôture générique (session/GenericPostWorkoutAnalysisSheet),
// 3. la relecture d'un bilan depuis les Chroniques (StoredWorkoutAnalysisSheet)
//    — le bilan est déjà persisté dans `workout_analyses` par la fonction
//    Edge analyze-workout depuis le 29/06, mais n'était JAMAIS relu (voir
//    docs/architecture/phase-c-convergence-ux-finale.md, §8.2).
//
// Le contrat JSON (WorkoutAnalysis) est UNIQUE pour toutes les disciplines
// — même schéma que la fonction Edge, seules les descriptions de prompt
// changent côté serveur. `variant` n'ajuste que les libellés de section
// (vocabulaire muscles vs zones/axes de travail) : équivalence, jamais
// deux structures parallèles.
// ============================================================

import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Heart,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

// ── Contrat JSON du bilan (identique à la sortie de l'Edge analyze-workout) ──

export type WorkoutAnalysis = {
  summary: {
    headline: string;
    tonnage_comment: string;
    duration_comment?: string;
  };
  muscles: {
    trained: string[];
    balance_comment: string;
    overloaded?: string[];
  };
  performance: {
    prs?: Array<{ exercise: string; detail: string }>;
    intensity_comment: string;
    progression_comment?: string;
  };
  recovery: {
    rest_hours: number;
    priority_muscles: string[];
    recovery_tip: string;
    overtraining_risk: "low" | "medium" | "high";
  };
  next_session: {
    recommended_muscles: string[];
    session_type: string;
    load_adjustment?: string;
    timing: string;
  };
};

export type AnalysisVariant = "muscu" | "generic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(risk: "low" | "medium" | "high") {
  return risk === "low"
    ? "text-green-400 bg-green-500/10"
    : risk === "medium"
      ? "text-amber-400 bg-amber-500/10"
      : "text-red-400 bg-red-500/10";
}

function riskLabel(risk: "low" | "medium" | "high") {
  return risk === "low" ? "Faible" : risk === "medium" ? "Modéré" : "Élevé";
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Coquille de sheet (header + chargement + erreur), partagée ───────────────

export function AnalysisSheetShell({
  title,
  subtitle,
  loading,
  loadingHint,
  error,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  loadingHint?: string;
  error: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated animate-in slide-in-from-bottom-4 duration-300">
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="shrink-0 px-5 pb-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-bold">{title}</h2>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="relative">
                <Brain className="h-10 w-10 text-primary/40" />
                <Loader2 className="absolute -right-2 -top-2 h-5 w-5 animate-spin text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Analyse en cours…</p>
                {loadingHint && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{loadingHint}</p>
                )}
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          )}

          {!loading && !error && children}
        </div>
      </div>
    </div>
  );
}

// ── Sections du bilan ─────────────────────────────────────────────────────────

const SECTION_LABELS: Record<AnalysisVariant, { muscles: string }> = {
  muscu: { muscles: "Muscles travaillés" },
  generic: { muscles: "Ce que tu as sollicité" },
};

export function WorkoutAnalysisContent({
  analysis,
  variant,
  onClose,
}: {
  analysis: WorkoutAnalysis;
  variant: AnalysisVariant;
  onClose: () => void;
}) {
  const labels = SECTION_LABELS[variant];

  return (
    <div className="flex flex-col gap-3">
      {/* ── 1. Bilan ── */}
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
        <p className="text-sm font-bold leading-snug">{analysis.summary.headline}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{analysis.summary.tonnage_comment}</p>
        {analysis.summary.duration_comment && (
          <p className="mt-1 text-xs text-muted-foreground">{analysis.summary.duration_comment}</p>
        )}
      </div>

      {/* ── 2. Muscles / zones sollicitées ── */}
      <SectionCard
        icon={
          variant === "muscu" ? <Dumbbell className="h-4 w-4" /> : <Activity className="h-4 w-4" />
        }
        title={labels.muscles}
      >
        {analysis.muscles.trained.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {analysis.muscles.trained.map((m) => (
              <span
                key={m}
                className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
              >
                {m}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{analysis.muscles.balance_comment}</p>
        {analysis.muscles.overloaded && analysis.muscles.overloaded.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-400">
              Potentiellement sur-sollicités : {analysis.muscles.overloaded.join(", ")}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── 3. Performances ── */}
      <SectionCard icon={<TrendingUp className="h-4 w-4" />} title="Performances">
        {analysis.performance.prs && analysis.performance.prs.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {analysis.performance.prs.map((pr, i) => (
              <div key={i} className="flex items-start gap-2">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-semibold">{pr.exercise}</p>
                  <p className="text-[11px] text-muted-foreground">{pr.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{analysis.performance.intensity_comment}</p>
        {analysis.performance.progression_comment && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {analysis.performance.progression_comment}
          </p>
        )}
      </SectionCard>

      {/* ── 4. Récupération ── */}
      <SectionCard icon={<Heart className="h-4 w-4" />} title="Récupération">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">{analysis.recovery.rest_hours}h</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Repos recommandé
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${riskColor(analysis.recovery.overtraining_risk)}`}
          >
            Surmenage : {riskLabel(analysis.recovery.overtraining_risk)}
          </span>
        </div>

        {analysis.recovery.priority_muscles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {analysis.recovery.priority_muscles.map((m) => (
              <span
                key={m}
                className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400"
              >
                {m}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
          <p className="text-xs text-muted-foreground">{analysis.recovery.recovery_tip}</p>
        </div>
      </SectionCard>

      {/* ── 5. Prochaine séance ── */}
      <SectionCard icon={<Target className="h-4 w-4" />} title="Prochaine séance">
        <p className="mb-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {analysis.next_session.session_type}
          </span>
          {" · "}
          {analysis.next_session.timing}
        </p>
        {analysis.next_session.recommended_muscles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {analysis.next_session.recommended_muscles.map((m) => (
              <span
                key={m}
                className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
              >
                {m}
              </span>
            ))}
          </div>
        )}
        {analysis.next_session.load_adjustment && (
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-primary" />
            <p className="text-xs text-muted-foreground">{analysis.next_session.load_adjustment}</p>
          </div>
        )}
      </SectionCard>

      {/* Fermer */}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow"
      >
        Fermer l'analyse
      </button>
    </div>
  );
}
