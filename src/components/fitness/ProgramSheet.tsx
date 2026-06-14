import { useMemo, useState } from "react";
import { CalendarRange, Loader2, Trash2, TrendingUp } from "lucide-react";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import {
  usePrograms,
  useProgramWeeks,
  useCreateProgram,
  useDeleteProgram,
  type TrainingProgram,
} from "@/hooks/usePrograms";
import {
  generateProgramWeeks,
  phaseLabel,
  type PeriodizationModel,
  type ProgramGoal,
  type WeekPhase,
} from "@/lib/fitness/periodization";

/**
 * Coach IA V2 — création de programmes multi-semaines avec aperçu live de la
 * périodisation (intensité / RPE cible / volume par semaine), liste des
 * programmes et détail semaine-par-semaine.
 *
 * UI uniquement : toute la logique vit dans lib/fitness/periodization (pur) et
 * hooks/usePrograms (Supabase). Tokens sémantiques, mobile first.
 */

const GOALS: { value: ProgramGoal; label: string }[] = [
  { value: "hypertrophy", label: "Hypertrophie" },
  { value: "strength", label: "Force" },
  { value: "endurance", label: "Endurance" },
  { value: "peaking", label: "Pic de forme" },
];

const MODELS: { value: PeriodizationModel; label: string }[] = [
  { value: "linear", label: "Linéaire" },
  { value: "undulating", label: "Ondulatoire" },
  { value: "block", label: "Bloc" },
];

function WeekRow({
  weekNumber,
  phase,
  intensityPct,
  targetRpe,
  volumeMultiplier,
  isDeload,
}: {
  weekNumber: number;
  phase: string;
  intensityPct: number | null;
  targetRpe: number | null;
  volumeMultiplier: number;
  isDeload: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm " +
        (isDeload ? "border-primary/30 bg-primary/5" : "border-border bg-card")
      }
    >
      <span className="w-7 shrink-0 text-center text-xs font-bold text-muted-foreground">
        S{weekNumber}
      </span>
      <span className="flex-1">
        <span className="font-medium">{phaseLabel(phase as WeekPhase)}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {intensityPct != null ? `${intensityPct}%` : "—"} · RPE {targetRpe ?? "—"} · vol ×{volumeMultiplier}
      </span>
    </div>
  );
}

function ProgramDetail({ program }: { program: TrainingProgram }) {
  const { data: weeks, isLoading } = useProgramWeeks(program.id);
  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="space-y-1.5 pt-2">
      {(weeks ?? []).map((w) => (
        <WeekRow
          key={w.id}
          weekNumber={w.week_number}
          phase={w.phase}
          intensityPct={w.intensity_pct}
          targetRpe={w.target_rpe}
          volumeMultiplier={w.volume_multiplier}
          isDeload={w.is_deload}
        />
      ))}
    </div>
  );
}

export function ProgramSheet({ onClose }: { onClose: () => void }) {
  const { data: programs, isLoading } = usePrograms();
  const createProgram = useCreateProgram();
  const deleteProgram = useDeleteProgram();

  const [form, setForm] = useState({
    name: "",
    goal: "hypertrophy" as ProgramGoal,
    model: "linear" as PeriodizationModel,
    totalWeeks: "8",
    deloadEvery: "4",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Aperçu live de la périodisation (domaine pur), recalculé à chaque changement.
  const preview = useMemo(
    () =>
      generateProgramWeeks({
        goal: form.goal,
        model: form.model,
        totalWeeks: Number(form.totalWeeks) || 1,
        deloadEvery: Number(form.deloadEvery),
      }),
    [form.goal, form.model, form.totalWeeks, form.deloadEvery],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await createProgram.mutateAsync({
      name: form.name.trim(),
      goal: form.goal,
      model: form.model,
      totalWeeks: Number(form.totalWeeks) || 1,
      deloadEvery: Number(form.deloadEvery),
    });
    setForm((f) => ({ ...f, name: "" }));
  };

  return (
    <Sheet title="Coach IA — Programmes" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Nom du programme"
          type="text"
          value={form.name}
          onChange={(v: string) => setForm({ ...form, name: v })}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objectif
            </label>
            <select
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value as ProgramGoal })}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Périodisation
            </label>
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value as PeriodizationModel })}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Durée (semaines)"
            type="number"
            value={form.totalWeeks}
            onChange={(v: string) => setForm({ ...form, totalWeeks: v })}
          />
          <Field
            label="Décharge tous les"
            type="number"
            value={form.deloadEvery}
            onChange={(v: string) => setForm({ ...form, deloadEvery: v })}
          />
        </div>

        {/* Aperçu live de la périodisation */}
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
            Aperçu — {preview.length} semaine{preview.length > 1 ? "s" : ""}
          </div>
          <div className="space-y-1.5">
            {preview.map((w) => (
              <WeekRow
                key={w.weekNumber}
                weekNumber={w.weekNumber}
                phase={w.phase}
                intensityPct={w.intensityPct}
                targetRpe={w.targetRpe}
                volumeMultiplier={w.volumeMultiplier}
                isDeload={w.isDeload}
              />
            ))}
          </div>
        </div>

        <SubmitButton pending={createProgram.isPending}>Créer le programme</SubmitButton>
      </form>

      {/* Programmes existants */}
      <div className="mt-6">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          Mes programmes
        </h3>
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (programs ?? []).length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">Aucun programme pour le moment</p>
        )}
        <div className="space-y-2">
          {(programs ?? []).map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setExpandedId((id) => (id === p.id ? null : p.id))}
                  className="flex-1 text-left"
                >
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {GOALS.find((g) => g.value === p.goal)?.label ?? p.goal} ·{" "}
                    {MODELS.find((m) => m.value === p.periodization_model)?.label ?? p.periodization_model} ·{" "}
                    {p.total_weeks} sem.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteProgram.mutate(p.id)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {expandedId === p.id && (
                <div className="border-t border-border px-3 pb-3">
                  <ProgramDetail program={p} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
