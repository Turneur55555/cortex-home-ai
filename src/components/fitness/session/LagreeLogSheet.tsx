// Enregistrer un cours de Lagree déjà suivi : date, durée, zones travaillées.
// Réutilise useAddWorkout (séance discipline="guided", statut terminé) — aucune
// table ni aucun circuit parallèle. Les zones sont une indication, pas une mesure.
import { useState } from "react";
import { format } from "date-fns";
import { Loader2, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { MuscleZonesBodyMap } from "@/components/fitness/BodyMap";
import { useAddWorkout } from "@/hooks/use-fitness";
import { MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";
import {
  LAGREE_DEFAULT_DURATION_MIN,
  LAGREE_DEFAULT_ZONES,
  LAGREE_SELECTABLE_ZONES,
  buildLagreeMetadata,
  toggleZone,
} from "@/lib/fitness/lagree";

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";
const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function LagreeLogSheet({ onClose }: { onClose: () => void }) {
  const add = useAddWorkout();
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(String(LAGREE_DEFAULT_DURATION_MIN));
  const [zones, setZones] = useState<MuscleId[]>([...LAGREE_DEFAULT_ZONES]);
  const [notes, setNotes] = useState("");

  const durationMin = Number(duration);
  const valid = date && date <= today && durationMin > 0 && durationMin <= 300 && zones.length > 0;

  const toggle = (id: MuscleId) => setZones((z) => toggleZone(z, id));

  const handleSave = async () => {
    if (!valid || add.isPending) return;
    try {
      await add.mutateAsync({
        name: "Lagree",
        date,
        duration_minutes: Math.round(durationMin),
        notes: notes.trim() || null,
        discipline: "guided",
        metadata: buildLagreeMetadata(Math.round(durationMin), zones),
        exercises: [],
      });
      onClose();
    } catch {
      /* toast déjà affiché par useAddWorkout */
    }
  };

  return (
    <Sheet title="Cours de Lagree" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="lagree-date">
              Date
            </label>
            <input
              id="lagree-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="lagree-duration">
              Durée (min)
            </label>
            <input
              id="lagree-duration"
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={labelCls + " mb-0"}>Zones travaillées</span>
            <button
              type="button"
              onClick={() => setZones([...LAGREE_DEFAULT_ZONES])}
              className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Par défaut
            </button>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Indication des zones sollicitées pendant le cours, pas une mesure précise. Touche la
            silhouette ou les zones pour ajuster.
          </p>
          <div className="rounded-2xl border border-border bg-surface/60 p-3">
            <MuscleZonesBodyMap zones={zones} onToggle={toggle} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {LAGREE_SELECTABLE_ZONES.map((id) => {
              const on = zones.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (on
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground")
                  }
                >
                  {MUSCLE_META[id].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="lagree-notes">
            Notes (optionnel)
          </label>
          <textarea
            id="lagree-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Coach, studio, ressenti…"
            className={inputCls + " resize-none"}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!valid || add.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer le cours
        </button>
      </div>
    </Sheet>
  );
}
