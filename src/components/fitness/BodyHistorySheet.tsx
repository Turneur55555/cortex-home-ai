import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Pencil, Trash2, X } from "lucide-react";
import {
  useBodyMeasurements,
  useDeleteBodyMeasurement,
  useUpdateBodyMeasurement,
} from "@/hooks/use-fitness";
import { Field, FormGroup, Sheet, SubmitButton } from "@/components/shared/FormComponents";

type Row = NonNullable<ReturnType<typeof useBodyMeasurements>["data"]>[number];

const FIELDS: Array<{ key: keyof Row; label: string; unit: string }> = [
  { key: "weight", label: "Poids", unit: "kg" },
  { key: "muscle_mass", label: "Masse musc.", unit: "kg" },
  { key: "body_fat", label: "MG", unit: "%" },
  { key: "chest", label: "Poitrine", unit: "cm" },
  { key: "waist", label: "Taille", unit: "cm" },
  { key: "hips", label: "Hanches", unit: "cm" },
  { key: "left_arm", label: "Bras G.", unit: "cm" },
  { key: "right_arm", label: "Bras D.", unit: "cm" },
  { key: "left_thigh", label: "Cuisse G.", unit: "cm" },
  { key: "right_thigh", label: "Cuisse D.", unit: "cm" },
];

export function BodyHistorySheet({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useBodyMeasurements();
  const del = useDeleteBodyMeasurement();
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-bold">Historique des mesures</h2>
            <p className="text-[11px] text-muted-foreground">
              {rows.length} entrée{rows.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted-foreground active:scale-95"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Aucune mesure enregistrée pour le moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const filled = FIELDS.filter((f) => {
                  const v = r[f.key];
                  return typeof v === "number" && Number.isFinite(v);
                });
                const time = format(new Date(r.created_at), "HH:mm", { locale: fr });
                return (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-border bg-card/60 p-3 shadow-card"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold capitalize">
                          {format(parseISO(r.date), "EEE d MMM yyyy", { locale: fr })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Enregistré à {time}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary active:scale-95"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(r.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive active:scale-95"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {filled.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Aucune valeur numérique.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {filled.map((f) => (
                          <div
                            key={String(f.key)}
                            className="rounded-lg border border-border/60 bg-background/40 px-2 py-1.5"
                          >
                            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                              {f.label}
                            </p>
                            <p className="text-xs font-semibold tabular-nums">
                              {r[f.key] as number}
                              <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                                {f.unit}
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {r.notes && (
                      <p className="mt-2 text-[11px] italic text-muted-foreground">
                        « {r.notes} »
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <EditMeasurementSheet row={editing} onClose={() => setEditing(null)} />
      )}

      {confirmId && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="mb-20 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-semibold">Supprimer cette mesure ?</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const id = confirmId;
                  setConfirmId(null);
                  await del.mutateAsync(id);
                }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditMeasurementSheet({ row, onClose }: { row: Row; onClose: () => void }) {
  const update = useUpdateBodyMeasurement();
  const toStr = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? "" : String(v);
  const [form, setForm] = useState({
    date: row.date,
    weight: toStr(row.weight),
    muscle_mass: toStr(row.muscle_mass),
    body_fat: toStr(row.body_fat),
    chest: toStr(row.chest),
    waist: toStr(row.waist),
    hips: toStr(row.hips),
    left_arm: toStr(row.left_arm),
    right_arm: toStr(row.right_arm),
    left_thigh: toStr(row.left_thigh),
    right_thigh: toStr(row.right_thigh),
    notes: row.notes ?? "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await update.mutateAsync({
      id: row.id,
      patch: {
        date: form.date,
        weight: num(form.weight),
        muscle_mass: num(form.muscle_mass),
        body_fat: num(form.body_fat),
        chest: num(form.chest),
        waist: num(form.waist),
        hips: num(form.hips),
        left_arm: num(form.left_arm),
        right_arm: num(form.right_arm),
        left_thigh: num(form.left_thigh),
        right_thigh: num(form.right_thigh),
        notes: form.notes.trim() || null,
      },
    });
    onClose();
  };

  return (
    <Sheet title="Modifier la mesure" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Date"
          type="date"
          value={form.date}
          onChange={(v) => setForm({ ...form, date: v })}
          required
        />

        <FormGroup title="Composition corporelle" subtitle="Données globales">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Poids (kg)" type="number" step="0.1" value={form.weight}
              onChange={(v) => setForm({ ...form, weight: v })} />
            <Field label="MM (kg)" type="number" step="0.1" value={form.muscle_mass}
              onChange={(v) => setForm({ ...form, muscle_mass: v })} />
            <Field label="MG (%)" type="number" step="0.1" value={form.body_fat}
              onChange={(v) => setForm({ ...form, body_fat: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Tronc" subtitle="Tour en cm">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Poitrine" type="number" step="0.1" value={form.chest}
              onChange={(v) => setForm({ ...form, chest: v })} />
            <Field label="Taille" type="number" step="0.1" value={form.waist}
              onChange={(v) => setForm({ ...form, waist: v })} />
            <Field label="Hanches" type="number" step="0.1" value={form.hips}
              onChange={(v) => setForm({ ...form, hips: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Bras" subtitle="Tour contracté en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bras gauche" type="number" step="0.1" value={form.left_arm}
              onChange={(v) => setForm({ ...form, left_arm: v })} />
            <Field label="Bras droit" type="number" step="0.1" value={form.right_arm}
              onChange={(v) => setForm({ ...form, right_arm: v })} />
          </div>
        </FormGroup>

        <FormGroup title="Jambes" subtitle="Tour de cuisse en cm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cuisse gauche" type="number" step="0.1" value={form.left_thigh}
              onChange={(v) => setForm({ ...form, left_thigh: v })} />
            <Field label="Cuisse droite" type="number" step="0.1" value={form.right_thigh}
              onChange={(v) => setForm({ ...form, right_thigh: v })} />
          </div>
        </FormGroup>

        <Field label="Notes" textarea value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })} />

        <SubmitButton pending={update.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
