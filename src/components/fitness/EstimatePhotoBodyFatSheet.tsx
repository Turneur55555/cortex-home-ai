import { useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, ImagePlus, X } from "lucide-react";
import { Field, Sheet } from "@/components/shared/FormComponents";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import {
  useEstimateBodyFatFromPhotos,
  useSaveBodyPhotoAnalysis,
  type PhotoPayload,
} from "@/hooks/useBodyPhotoEstimate";
import {
  computeFatMassRange,
  computeLeanMassRange,
  type PhotoBodyFatEstimate,
} from "@/lib/fitness/bodyFatPhotoEstimate";
import { CONFIDENCE_LABELS } from "@/lib/fitness/bodyComposition";

type ViewKey = "front" | "side" | "back";

interface PickedPhoto {
  previewUrl: string;
  payload: PhotoPayload;
}

/**
 * Sheet "Estimer avec des photos" (Phase 6C). Flux : sélection (face +
 * profil obligatoires, dos optionnel, §8/§9 du brief) → consentement
 * explicite via le bouton "Analyser mes photos" (jamais automatique dès
 * qu'une photo est choisie, §7) → preview de la fourchette avant tout
 * enregistrement (§24/§25) → "Enregistrer" upload les photos dans le
 * bucket PRIVÉ et crée la mesure ; "Recommencer" efface tout sans rien
 * envoyer au serveur.
 */
export function EstimatePhotoBodyFatSheet({
  onClose,
  latestWeightKg,
}: {
  onClose: () => void;
  latestWeightKg: number | null;
}) {
  const estimate = useEstimateBodyFatFromPhotos();
  const save = useSaveBodyPhotoAnalysis();

  const [photos, setPhotos] = useState<Partial<Record<ViewKey, PickedPhoto>>>({});
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weight, setWeight] = useState(latestWeightKg != null ? String(latestWeightKg) : "");
  const [result, setResult] = useState<PhotoBodyFatEstimate | null>(null);

  const camRefs: Record<ViewKey, React.RefObject<HTMLInputElement | null>> = {
    front: useRef<HTMLInputElement>(null),
    side: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
  };
  const fileRefs: Record<ViewKey, React.RefObject<HTMLInputElement | null>> = {
    front: useRef<HTMLInputElement>(null),
    side: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
  };

  const onPick = async (view: ViewKey, file: File | undefined) => {
    if (!file) return;
    const { b64, mime } = await fileToBase64Compressed(file);
    setPhotos((p) => ({
      ...p,
      [view]: { previewUrl: `data:${mime};base64,${b64}`, payload: { b64, mime } },
    }));
    setResult(null);
  };

  const removePhoto = (view: ViewKey) => {
    setPhotos((p) => {
      const next = { ...p };
      delete next[view];
      return next;
    });
    setResult(null);
  };

  const canAnalyze = photos.front != null && photos.side != null && !estimate.isPending;

  const runAnalysis = async () => {
    if (!photos.front || !photos.side) return;
    const r = await estimate.mutateAsync({
      front: photos.front.payload,
      side: photos.side.payload,
      back: photos.back?.payload ?? null,
    });
    setResult(r);
  };

  const restart = () => {
    setPhotos({});
    setResult(null);
  };

  const weightKg = weight.trim() === "" ? null : Number(weight);
  const fatRange =
    result?.status === "success"
      ? computeFatMassRange(weightKg, result.minPercent, result.maxPercent)
      : null;
  const leanRange =
    result?.status === "success"
      ? computeLeanMassRange(weightKg, result.minPercent, result.maxPercent)
      : null;

  const handleSave = async () => {
    if (!result || result.status !== "success" || !photos.front || !photos.side) return;
    await save.mutateAsync({
      date,
      weightKg,
      estimate: result,
      front: photos.front.payload,
      side: photos.side.payload,
      back: photos.back?.payload ?? null,
    });
    onClose();
  };

  const VIEWS: Array<{ key: ViewKey; label: string; instruction: string; required: boolean }> = [
    {
      key: "front",
      label: "Face",
      instruction: "Corps entier visible, posture naturelle, bras légèrement écartés du corps.",
      required: true,
    },
    {
      key: "side",
      label: "Profil",
      instruction: "De côté, corps entier, même distance/hauteur de caméra que la photo de face.",
      required: true,
    },
    {
      key: "back",
      label: "Dos (optionnel)",
      instruction: "De dos, corps entier — améliore la précision mais n'est pas obligatoire.",
      required: false,
    },
  ];

  return (
    <Sheet title="Estimer avec des photos" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cette estimation utilise une analyse visuelle par IA pour donner une FOURCHETTE indicative
          de Body Fat — jamais une mesure exacte. Elle peut différer d'une DEXA, d'une balance à
          impédancemétrie ou d'une estimation par mensurations. Tes photos restent privées : elles
          ne sont accessibles qu'à toi et jamais partagées.
        </p>

        {!result && (
          <>
            <div className="rounded-xl border border-border bg-card/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Pour un résultat fiable :</p>
              <ul className="space-y-0.5">
                <li>
                  • Éclairage homogène, évite les angles très plongeants ou contre-plongeants.
                </li>
                <li>• Caméra à peu près à hauteur du torse.</li>
                <li>
                  • Si possible, mêmes conditions à chaque nouvelle analyse pour pouvoir comparer.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              {VIEWS.map((v) => (
                <div key={v.key}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {v.label}
                  </p>
                  {photos[v.key] ? (
                    <div className="relative w-28">
                      <img
                        src={photos[v.key]!.previewUrl}
                        alt={v.label}
                        className="h-36 w-28 rounded-xl border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(v.key)}
                        aria-label="Supprimer"
                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white shadow"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => camRefs[v.key].current?.click()}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 py-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <Camera className="h-3.5 w-3.5" /> Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => fileRefs[v.key].current?.click()}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 py-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <ImagePlus className="h-3.5 w-3.5" /> Galerie
                      </button>
                      <input
                        ref={camRefs[v.key]}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => onPick(v.key, e.target.files?.[0])}
                      />
                      <input
                        ref={fileRefs[v.key]}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onPick(v.key, e.target.files?.[0])}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">{v.instruction}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={runAnalysis}
              disabled={!canAnalyze}
              className="w-full rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {estimate.isPending ? "Analyse en cours…" : "Analyser mes photos"}
            </button>
          </>
        )}

        {result && result.status !== "success" && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-4 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              {result.status === "insufficient_quality"
                ? "Photos insuffisamment exploitables pour une estimation."
                : "L'analyse a échoué."}
            </p>
            {result.warnings[0] && (
              <p className="mt-1 text-[11px] text-muted-foreground/70">{result.warnings[0]}</p>
            )}
            <button
              type="button"
              onClick={restart}
              className="mt-3 text-[11px] font-semibold text-primary"
            >
              Reprendre les photos
            </button>
          </div>
        )}

        {result && result.status === "success" && (
          <div className="space-y-4">
            <Field label="Date" type="date" value={date} onChange={setDate} required />
            <Field
              label="Poids au moment de la mesure (kg)"
              type="number"
              step="0.1"
              value={weight}
              onChange={setWeight}
            />

            <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Body Fat estimé
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {result.minPercent}–{result.maxPercent} %
              </p>
              <p className="text-[11px] text-muted-foreground">
                Référence ≈ {result.referencePercent} %
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Estimation photo</span>
                <span>·</span>
                <span>{CONFIDENCE_LABELS[result.confidence!]}</span>
              </div>

              {fatRange?.minKg != null && leanRange?.minKg != null && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Masse grasse estimée
                    </p>
                    <p className="text-sm font-bold">
                      {fatRange.minKg}–{fatRange.maxKg} kg
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Masse maigre estimée
                    </p>
                    <p className="text-sm font-bold">
                      {leanRange.minKg}–{leanRange.maxKg} kg
                    </p>
                  </div>
                </div>
              )}

              {result.warnings.length > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {result.warnings.join(" ")}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={restart}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-[12px] font-semibold text-foreground"
              >
                Recommencer
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={save.isPending}
                className="flex-[2] inline-flex h-12 items-center justify-center rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {save.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
