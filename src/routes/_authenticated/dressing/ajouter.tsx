import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, ChevronLeft, ImagePlus, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import {
  WARDROBE_ADD_CATEGORIES,
  buildWardrobePrefill,
  useAnalyzeWardrobePhoto,
  useCreateWardrobeItem,
  validateWardrobePhotoFile,
  type WardrobeAddCategoryKey,
  type WardrobeAnalysisResult,
} from "@/hooks/useWardrobe";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/dressing/ajouter")({
  head: () => ({
    meta: [
      { title: "Ajouter une pièce — ICORTEX" },
      {
        name: "description",
        content: "Ajoute une pièce à ton dressing ICORTEX avec une photo.",
      },
      { property: "og:title", content: "Ajouter une pièce — ICORTEX" },
      {
        property: "og:description",
        content: "Ajoute une pièce à ton dressing ICORTEX avec une photo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddWardrobeItemPage,
});

type AnalysisStatus = "idle" | "loading" | "done" | "error";

function AddWardrobeItemPage() {
  const navigate = useNavigate();
  const createItem = useCreateWardrobeItem();
  const analyzePhoto = useAnalyzeWardrobePhoto();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<WardrobeAddCategoryKey | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<WardrobeAnalysisResult | null>(null);
  const [nameSuggested, setNameSuggested] = useState(false);
  const [colorSuggested, setColorSuggested] = useState(false);

  const canSubmit = !!file && !!category && !createItem.isPending;

  function resetAnalysisState() {
    setAnalysisStatus("idle");
    setAnalysisError(null);
    setAnalysisResult(null);
    setNameSuggested(false);
    setColorSuggested(false);
  }

  async function runAnalysis(selected: File) {
    setAnalysisStatus("loading");
    setAnalysisError(null);
    try {
      const { b64, mime } = await fileToBase64Compressed(selected);
      const analysis = await analyzePhoto.mutateAsync({ base64: b64, mime });
      const prefill = buildWardrobePrefill(analysis);

      if (prefill.category.value) setCategory(prefill.category.value);
      if (prefill.name.value) {
        setName(prefill.name.value);
        setNameSuggested(prefill.name.suggested);
      }
      if (prefill.primaryColor.value) {
        setColor(prefill.primaryColor.value);
        setColorSuggested(prefill.primaryColor.suggested);
      }

      setAnalysisResult(analysis);
      setAnalysisStatus("done");
    } catch (err) {
      setAnalysisStatus("error");
      setAnalysisError(err instanceof Error ? err.message : "Analyse impossible.");
    }
  }

  function handlePick(selected: File | undefined) {
    if (!selected) return;
    const validation = validateWardrobePhotoFile(selected);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    resetAnalysisState();
    void runAnalysis(selected);
  }

  function clearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    resetAnalysisState();
  }

  function handleSubmit() {
    if (!file || !category) return;
    createItem.mutate(
      {
        file,
        category,
        name,
        brand,
        primaryColor: color,
        subcategory: analysisResult?.subcategory ?? null,
        secondaryColors: analysisResult?.secondary_colors ?? [],
        pattern: analysisResult?.pattern ?? null,
        material: analysisResult?.material ?? null,
        fit: analysisResult?.fit ?? null,
        formality: analysisResult?.formality ?? null,
        seasons: analysisResult?.seasons ?? [],
        aiDescription: analysisResult?.description ?? null,
        aiMetadata: analysisResult ? (JSON.parse(JSON.stringify(analysisResult)) as Json) : null,
      },
      {
        onSuccess: () => {
          void navigate({ to: "/dressing" });
        },
      },
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <Link
          to="/dressing"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Ajouter une pièce</h1>
      </header>

      <section className="space-y-5">
        {/* Photo */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Photo
          </p>
          {previewUrl ? (
            <div className="flex items-start gap-3">
              <div className="relative w-32 shrink-0">
                <img
                  src={previewUrl}
                  alt="Aperçu de la pièce"
                  className="h-40 w-32 rounded-2xl border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  aria-label="Retirer la photo"
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white shadow"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 pt-1">
                {analysisStatus === "loading" && (
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cortex analyse ta pièce…
                  </div>
                )}
                {analysisStatus === "error" && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>
                        {analysisError ?? "Analyse impossible."} Tu peux compléter les informations
                        manuellement.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runAnalysis(file!)}
                      className="text-xs font-semibold text-primary"
                    >
                      Réessayer l'analyse
                    </button>
                  </div>
                )}
                {analysisStatus === "done" && analysisResult && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>Cortex propose : {analysisResult.description}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 py-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Camera className="h-4 w-4" /> Photo
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 py-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ImagePlus className="h-4 w-4" /> Photothèque
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePick(e.target.files?.[0])}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => handlePick(e.target.files?.[0])}
              />
            </div>
          )}
        </div>

        {/* Catégorie */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Catégorie
          </p>
          <div className="flex flex-wrap gap-2">
            {WARDROBE_ADD_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Champs facultatifs */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nom
            {nameSuggested && (
              <span className="normal-case text-primary/80">· proposé par Cortex</span>
            )}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSuggested(false);
            }}
            placeholder="T-shirt noir"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Marque
          </label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Facultatif"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Couleur
            {colorSuggested && (
              <span className="normal-case text-primary/80">· proposé par Cortex</span>
            )}
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setColorSuggested(false);
            }}
            placeholder="Facultatif"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>
      </section>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-6 flex items-center justify-center rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-opacity active:opacity-80 disabled:opacity-50"
      >
        {createItem.isPending ? "Enregistrement…" : "Ajouter au dressing"}
      </button>
    </main>
  );
}
