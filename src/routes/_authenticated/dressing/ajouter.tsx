import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
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
import {
  WARDROBE_FIT_OPTIONS,
  WARDROBE_PATTERN_OPTIONS,
  WARDROBE_SLEEVE_LENGTH_OPTIONS,
  WARDROBE_USAGE_OPTIONS,
  findSubcategory,
  getCharacteristicsConfig,
  getSizeConfig,
  getSubcategoriesForCategory,
  hasAnyCharacteristic,
  type WardrobeFit,
  type WardrobePattern,
  type WardrobeSleeveLength,
  type WardrobeUsage,
} from "@/lib/wardrobe/taxonomy";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import { processWardrobePhoto } from "@/lib/wardrobe/backgroundRemoval";
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
type CutoutStatus = "idle" | "processing" | "done" | "error";
type SuggestedKey =
  | "name"
  | "color"
  | "subcategory"
  | "sleeveLength"
  | "fit"
  | "material"
  | "pattern"
  | "usage";

const CUSTOM_SIZE_VALUE = "__custom__";

function AddWardrobeItemPage() {
  const navigate = useNavigate();
  const createItem = useCreateWardrobeItem();
  const analyzePhoto = useAnalyzeWardrobePhoto();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Toujours visibles
  const [category, setCategory] = useState<WardrobeAddCategoryKey | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [color, setColor] = useState("");

  // Caractéristiques (dépliant, dépend de la catégorie)
  const [charOpen, setCharOpen] = useState(false);
  const [sleeveLength, setSleeveLength] = useState<WardrobeSleeveLength | null>(null);
  const [fit, setFit] = useState<WardrobeFit | null>(null);
  const [material, setMaterial] = useState("");
  const [pattern, setPattern] = useState<WardrobePattern | null>(null);
  const [usage, setUsage] = useState<WardrobeUsage[]>([]);

  // Champs conservés en arrière-plan pour le futur Outfit Engine, jamais affichés.
  const [analysisResult, setAnalysisResult] = useState<WardrobeAnalysisResult | null>(null);

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Partial<Record<SuggestedKey, boolean>>>({});

  // Détourage / normalisation (Phase 5) — jamais bloquant, jamais obligatoire.
  const [cutoutStatus, setCutoutStatus] = useState<CutoutStatus>("idle");
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [cutoutPreviewUrl, setCutoutPreviewUrl] = useState<string | null>(null);
  const [useProcessedPhoto, setUseProcessedPhoto] = useState(true);

  const canSubmit = !!file && !!category && !createItem.isPending;
  const characteristicsConfig = category ? getCharacteristicsConfig(category) : null;
  const showCharacteristics =
    !!characteristicsConfig && hasAnyCharacteristic(characteristicsConfig);
  const sizeConfig = category ? getSizeConfig(category) : null;
  const subcategoryOptions = category ? getSubcategoriesForCategory(category) : [];

  function clearSuggested(key: SuggestedKey) {
    setSuggested((prev) => ({ ...prev, [key]: false }));
  }

  function resetAnalysisState() {
    setAnalysisStatus("idle");
    setAnalysisError(null);
    setAnalysisResult(null);
    setSuggested({});
  }

  function resetCutoutState() {
    if (cutoutPreviewUrl) URL.revokeObjectURL(cutoutPreviewUrl);
    setCutoutStatus("idle");
    setCutoutBlob(null);
    setCutoutPreviewUrl(null);
    setUseProcessedPhoto(true);
  }

  function handleCategoryChange(next: WardrobeAddCategoryKey) {
    setCategory(next);
    // Le type précis, la taille et les manches sont spécifiques à la catégorie.
    setSubcategory(null);
    setSize("");
    setIsCustomSize(false);
    setSleeveLength(null);
    clearSuggested("subcategory");
    clearSuggested("sleeveLength");
  }

  function handleSubcategoryChange(value: string) {
    const next = value || null;
    setSubcategory(next);
    clearSuggested("subcategory");
    const def = findSubcategory(next);
    if (def?.defaultUsage?.length && usage.length === 0) {
      setUsage(def.defaultUsage);
    }
  }

  async function runAnalysis(selected: File) {
    setAnalysisStatus("loading");
    setAnalysisError(null);
    try {
      const { b64, mime } = await fileToBase64Compressed(selected);
      const analysis = await analyzePhoto.mutateAsync({ base64: b64, mime });
      const prefill = buildWardrobePrefill(analysis);
      const nextSuggested: Partial<Record<SuggestedKey, boolean>> = {};

      if (prefill.category.value) setCategory(prefill.category.value);
      if (prefill.subcategory.value) {
        setSubcategory(prefill.subcategory.value);
        nextSuggested.subcategory = prefill.subcategory.suggested;
      }
      if (prefill.name.value) {
        setName(prefill.name.value);
        nextSuggested.name = prefill.name.suggested;
      }
      if (prefill.primaryColor.value) {
        setColor(prefill.primaryColor.value);
        nextSuggested.color = prefill.primaryColor.suggested;
      }
      if (prefill.sleeveLength.value) {
        setSleeveLength(prefill.sleeveLength.value);
        nextSuggested.sleeveLength = prefill.sleeveLength.suggested;
      }
      if (prefill.fit.value) {
        setFit(prefill.fit.value);
        nextSuggested.fit = prefill.fit.suggested;
      }
      if (prefill.material.value) {
        setMaterial(prefill.material.value);
        nextSuggested.material = prefill.material.suggested;
      }
      if (prefill.pattern.value) {
        setPattern(prefill.pattern.value);
        nextSuggested.pattern = prefill.pattern.suggested;
      }

      let usageValue = prefill.usage.value;
      if (usageValue) {
        nextSuggested.usage = prefill.usage.suggested;
      } else {
        // Pas d'usage détecté par Cortex : on retombe sur la suggestion de
        // la taxonomie si le type précis identifié est un maillot de bain.
        const def = findSubcategory(prefill.subcategory.value);
        if (def?.defaultUsage?.length) usageValue = def.defaultUsage;
      }
      if (usageValue) setUsage(usageValue);

      setSuggested(nextSuggested);
      setAnalysisResult(analysis);
      setAnalysisStatus("done");
      if (
        prefill.sleeveLength.value ||
        prefill.fit.value ||
        prefill.material.value ||
        prefill.pattern.value ||
        usageValue
      ) {
        setCharOpen(true);
      }
    } catch (err) {
      setAnalysisStatus("error");
      setAnalysisError(err instanceof Error ? err.message : "Analyse impossible.");
    }
  }

  async function runCutout(selected: File) {
    setCutoutStatus("processing");
    try {
      const processed = await processWardrobePhoto(selected);
      setCutoutBlob(processed);
      setCutoutPreviewUrl(URL.createObjectURL(processed));
      setUseProcessedPhoto(true);
      setCutoutStatus("done");
    } catch (err) {
      // Ne bloque jamais l'ajout : l'original reste utilisable tel quel (§2).
      console.error("[dressing] détourage impossible, original conservé :", err);
      setCutoutStatus("error");
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
    resetCutoutState();
    void runAnalysis(selected);
    void runCutout(selected);
  }

  function clearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    resetAnalysisState();
    resetCutoutState();
  }

  function toggleUsage(value: WardrobeUsage) {
    clearSuggested("usage");
    setUsage((prev) => (prev.includes(value) ? prev.filter((u) => u !== value) : [...prev, value]));
  }

  function handleSubmit() {
    if (!file || !category) return;
    const config = getCharacteristicsConfig(category);
    createItem.mutate(
      {
        file,
        category,
        name,
        brand,
        primaryColor: color,
        subcategory,
        size: size.trim() || undefined,
        secondaryColors: analysisResult?.secondary_colors ?? [],
        sleeveLength: config.sleeveLength ? sleeveLength : null,
        fit: config.fit ? fit : null,
        material: config.material ? material.trim() || null : null,
        pattern: config.pattern ? pattern : null,
        usage: config.usage ? usage : [],
        // Champs conservés en arrière-plan pour le futur Outfit Engine —
        // jamais exposés dans ce formulaire.
        formality: analysisResult?.formality ?? null,
        seasons: analysisResult?.seasons ?? [],
        aiDescription: analysisResult?.description ?? null,
        aiMetadata: analysisResult ? (JSON.parse(JSON.stringify(analysisResult)) as Json) : null,
        processedFile: useProcessedPhoto && cutoutStatus === "done" ? cutoutBlob : null,
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
            <>
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
                          {analysisError ?? "Analyse impossible."} Tu peux compléter les
                          informations manuellement.
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
                  {cutoutStatus === "processing" && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cortex détoure ta pièce…
                    </div>
                  )}
                </div>
              </div>

              {cutoutStatus === "done" && cutoutPreviewUrl && (
                <div className="mt-3 rounded-2xl border border-border bg-card/40 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Détourage
                  </p>
                  <div className="flex items-center gap-3">
                    <img
                      src={cutoutPreviewUrl}
                      alt="Aperçu détouré"
                      className="h-24 w-24 shrink-0 rounded-xl border border-border bg-muted/30 object-contain"
                    />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUseProcessedPhoto(true)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          useProcessedPhoto
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        Utiliser cette image
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseProcessedPhoto(false)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          !useProcessedPhoto
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        Utiliser l'original
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
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
                  onClick={() => handleCategoryChange(c.key)}
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

        {/* Type précis */}
        {category && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Type précis
              {suggested.subcategory && (
                <span className="normal-case text-primary/80">· proposé par Cortex</span>
              )}
            </label>
            <select
              value={subcategory ?? ""}
              onChange={(e) => handleSubcategoryChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none focus:border-primary"
            >
              <option value="">Choisir…</option>
              {subcategoryOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Nom */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nom
            {suggested.name && (
              <span className="normal-case text-primary/80">· proposé par Cortex</span>
            )}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearSuggested("name");
            }}
            placeholder="T-shirt noir"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>

        {/* Marque */}
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

        {/* Taille — adaptative selon la catégorie */}
        {category && sizeConfig && (
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Taille
            </label>
            <select
              value={isCustomSize ? CUSTOM_SIZE_VALUE : size}
              onChange={(e) => {
                if (e.target.value === CUSTOM_SIZE_VALUE) {
                  setIsCustomSize(true);
                  setSize("");
                } else {
                  setIsCustomSize(false);
                  setSize(e.target.value);
                }
              }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none focus:border-primary"
            >
              <option value="">Facultatif</option>
              {sizeConfig.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value={CUSTOM_SIZE_VALUE}>Personnalisée…</option>
            </select>
            {isCustomSize && (
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="Ex: 44 long"
                className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
              />
            )}
          </div>
        )}

        {/* Couleur principale */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Couleur
            {suggested.color && (
              <span className="normal-case text-primary/80">· proposé par Cortex</span>
            )}
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              clearSuggested("color");
            }}
            placeholder="Facultatif"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>

        {/* Caractéristiques — dépliant, champs pilotés par la taxonomie */}
        {showCharacteristics && characteristicsConfig && (
          <div className="rounded-2xl border border-border bg-card/40">
            <button
              type="button"
              onClick={() => setCharOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold"
            >
              Caractéristiques
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${charOpen ? "rotate-180" : ""}`}
              />
            </button>

            {charOpen && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                {characteristicsConfig.sleeveLength && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Manches
                      {suggested.sleeveLength && (
                        <span className="normal-case text-primary/80">· proposé par Cortex</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_SLEEVE_LENGTH_OPTIONS.map((o) => {
                        const active = sleeveLength === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => {
                              setSleeveLength(o.value);
                              clearSuggested("sleeveLength");
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {characteristicsConfig.fit && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Coupe
                      {suggested.fit && (
                        <span className="normal-case text-primary/80">· proposé par Cortex</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_FIT_OPTIONS.map((o) => {
                        const active = fit === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => {
                              setFit(o.value);
                              clearSuggested("fit");
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {characteristicsConfig.material && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Matière
                      {suggested.material && (
                        <span className="normal-case text-primary/80">· estimation Cortex</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={material}
                      onChange={(e) => {
                        setMaterial(e.target.value);
                        clearSuggested("material");
                      }}
                      placeholder="Coton, laine, denim…"
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                    />
                  </div>
                )}

                {characteristicsConfig.pattern && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Motif
                      {suggested.pattern && (
                        <span className="normal-case text-primary/80">· proposé par Cortex</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_PATTERN_OPTIONS.map((o) => {
                        const active = pattern === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => {
                              setPattern(o.value);
                              clearSuggested("pattern");
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {characteristicsConfig.usage && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Usage
                      {suggested.usage && (
                        <span className="normal-case text-primary/80">· proposé par Cortex</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_USAGE_OPTIONS.map((o) => {
                        const active = usage.includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => toggleUsage(o.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
