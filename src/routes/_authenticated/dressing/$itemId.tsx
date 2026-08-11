import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ImageOff, Loader2, TriangleAlert } from "lucide-react";
import {
  WARDROBE_ADD_CATEGORIES,
  useUpdateWardrobeItem,
  useWardrobeItem,
  type WardrobeAddCategoryKey,
  type WardrobeItemDetail,
} from "@/hooks/useWardrobe";
import {
  WARDROBE_FIT_OPTIONS,
  WARDROBE_PATTERN_OPTIONS,
  WARDROBE_SLEEVE_LENGTH_OPTIONS,
  WARDROBE_USAGE_OPTIONS,
  getCharacteristicsConfig,
  getSizeConfig,
  getSubcategoriesForCategory,
  hasAnyCharacteristic,
  type WardrobeFit,
  type WardrobePattern,
  type WardrobeSleeveLength,
  type WardrobeUsage,
} from "@/lib/wardrobe/taxonomy";
import { supabase } from "@/integrations/supabase/client";
import { pickDisplayStoragePath } from "@/lib/wardrobe/imageProcessing";

export const Route = createFileRoute("/_authenticated/dressing/$itemId")({
  head: () => ({
    meta: [{ title: "Modifier une pièce — ICORTEX" }],
  }),
  component: EditWardrobeItemPage,
});

const CUSTOM_SIZE_VALUE = "__custom__";

function EditWardrobeItemPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useWardrobeItem(itemId);
  const updateItem = useUpdateWardrobeItem();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<WardrobeAddCategoryKey | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [color, setColor] = useState("");
  const [charOpen, setCharOpen] = useState(true);
  const [sleeveLength, setSleeveLength] = useState<WardrobeSleeveLength | null>(null);
  const [fit, setFit] = useState<WardrobeFit | null>(null);
  const [material, setMaterial] = useState("");
  const [pattern, setPattern] = useState<WardrobePattern | null>(null);
  const [usage, setUsage] = useState<WardrobeUsage[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Préremplit le formulaire une seule fois quand la pièce arrive.
  useEffect(() => {
    if (!item || hydrated) return;
    hydrateFromItem(item);
    setHydrated(true);
  }, [item, hydrated]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const path = pickDisplayStoragePath(item);
    if (!path) {
      setPreviewUrl(null);
      return;
    }
    void supabase.storage
      .from("wardrobe")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setPreviewUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  function hydrateFromItem(loaded: WardrobeItemDetail) {
    const uiCategory = (
      ["tops", "bottoms", "outerwear", "shoes", "accessories"] as WardrobeAddCategoryKey[]
    ).find(
      (key) => WARDROBE_ADD_CATEGORIES.find((c) => c.key === key)?.dbCategory === loaded.category,
    );
    setCategory(uiCategory ?? null);
    setSubcategory(loaded.subcategory);
    setName(loaded.name ?? "");
    setBrand(loaded.brand ?? "");
    setColor(loaded.primary_color ?? "");
    setSleeveLength((loaded.sleeve_length as WardrobeSleeveLength) ?? null);
    setFit((loaded.fit as WardrobeFit) ?? null);
    setMaterial(loaded.material ?? "");
    setPattern((loaded.pattern as WardrobePattern) ?? null);
    setUsage((loaded.usage as WardrobeUsage[]) ?? []);

    const sizeCfg = uiCategory ? getSizeConfig(uiCategory) : null;
    if (loaded.size) {
      const isKnown = sizeCfg?.options.includes(loaded.size);
      setIsCustomSize(!isKnown);
      setSize(loaded.size);
    } else {
      setSize("");
      setIsCustomSize(false);
    }
  }

  function handleCategoryChange(next: WardrobeAddCategoryKey) {
    setCategory(next);
    // Le type précis et la taille sont spécifiques à la catégorie — comme
    // dans le formulaire d'ajout, un changement de catégorie les réinitialise.
    setSubcategory(null);
    setSize("");
    setIsCustomSize(false);
    setSleeveLength(null);
  }

  function toggleUsage(value: WardrobeUsage) {
    setUsage((prev) => (prev.includes(value) ? prev.filter((u) => u !== value) : [...prev, value]));
  }

  const characteristicsConfig = category ? getCharacteristicsConfig(category) : null;
  const showCharacteristics =
    !!characteristicsConfig && hasAnyCharacteristic(characteristicsConfig);
  const sizeConfig = category ? getSizeConfig(category) : null;
  const subcategoryOptions = category ? getSubcategoriesForCategory(category) : [];
  const canSubmit = !!item && !!category && !updateItem.isPending;

  function handleSubmit() {
    if (!item || !category) return;
    const config = getCharacteristicsConfig(category);
    updateItem.mutate(
      {
        id: item.id,
        category,
        name,
        brand,
        primaryColor: color,
        subcategory,
        size: size.trim() || undefined,
        sleeveLength: config.sleeveLength ? sleeveLength : null,
        fit: config.fit ? fit : null,
        material: config.material ? material.trim() || null : null,
        pattern: config.pattern ? pattern : null,
        usage: config.usage ? usage : [],
      },
      {
        onSuccess: () => {
          void navigate({ to: "/dressing" });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (isError || !item) {
    return (
      <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <Link
          to="/dressing"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-destructive" />
          <p className="mt-2 text-sm font-medium">Pièce introuvable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Elle a peut-être été supprimée, ou n'est plus accessible.
          </p>
        </div>
      </main>
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
        <h1 className="text-2xl font-bold tracking-tight">Modifier la pièce</h1>
      </header>

      <section className="space-y-5">
        {/* Photo — lecture seule pour cette première version (§ édition photo hors périmètre) */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Photo
          </p>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={item.name ?? "Pièce du dressing"}
              className="h-40 w-32 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-40 w-32 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            La photo n'est pas modifiable pour l'instant.
          </p>
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
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Type précis
            </label>
            <select
              value={subcategory ?? ""}
              onChange={(e) => setSubcategory(e.target.value || null)}
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
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nom
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Couleur
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
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
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Manches
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_SLEEVE_LENGTH_OPTIONS.map((o) => {
                        const active = sleeveLength === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setSleeveLength(o.value)}
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
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Coupe
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_FIT_OPTIONS.map((o) => {
                        const active = fit === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setFit(o.value)}
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
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Matière
                    </label>
                    <input
                      type="text"
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      placeholder="Coton, laine, denim…"
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                    />
                  </div>
                )}

                {characteristicsConfig.pattern && (
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Motif
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WARDROBE_PATTERN_OPTIONS.map((o) => {
                        const active = pattern === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setPattern(o.value)}
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
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Usage
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
        {updateItem.isPending ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>
    </main>
  );
}
