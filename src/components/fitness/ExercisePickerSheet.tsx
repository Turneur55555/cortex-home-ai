import { useMemo, useRef, useState } from "react";
import { Book, BookOpen, Camera, Clock, Loader2, Sparkles } from "lucide-react";
import {
  CATALOG_GROUPS,
  EXERCISE_CATALOG,
  normalize,
  searchExercises,
} from "@/lib/fitness/exerciseCatalog";
import { supabase } from "@/integrations/supabase/client";
import { useExerciseCatalog, dbRowsToCatalog } from "@/hooks/useExerciseCatalog";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { toast } from "sonner";
import { ExerciseListBrowser, type BrowserExercise } from "./ExerciseListBrowser";
import { ExerciseActionsMenu, type ExerciseMenuAction } from "./ExerciseActionsMenu";
import { ExerciseAnalysisSheet } from "./ExerciseAnalysisSheet";

export type RecentExercise = {
  name: string;
  lastSets: number | null;
  lastReps: number | null;
  lastWeight: number | null;
};

export type PickedExercise = {
  name: string;
  sets: string;
  reps: string;
  weight: string;
};

interface Props {
  onSelect: (ex: PickedExercise) => void;
  onClose: () => void;
  recentExercises: RecentExercise[];
  initialQuery?: string;
}

type Suggestion = {
  name: string;
  group: string;
  confidence: number;
  reason?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function fileToCompressedBase64(
  file: File,
): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // Compresse via canvas (max 1280 px, JPEG 0.82)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("image load failed"));
      im.src = dataUrl;
    });
    const MAX = 1280;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas ctx null");
    ctx.drawImage(img, 0, 0, w, h);
    const compressed = canvas.toDataURL("image/jpeg", 0.82);
    const [, b64] = compressed.split(",");
    return { base64: b64, mime: "image/jpeg" };
  } catch {
    // fallback : envoie tel quel
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
    return { base64: b64, mime };
  }
}

export function ExercisePickerSheet({
  onSelect,
  onClose,
  recentExercises,
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [scanning, setScanning] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [detectedMachine, setDetectedMachine] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: dbRows } = useExerciseCatalog();
  const effectiveCatalog = dbRows && dbRows.length > 0 ? dbRowsToCatalog(dbRows) : EXERCISE_CATALOG;

  const normQuery = normalize(query);

  const filteredRecents = useMemo(() => {
    if (!normQuery) return recentExercises;
    return recentExercises.filter((e) => normalize(e.name).includes(normQuery));
  }, [recentExercises, normQuery]);

  const filteredCatalog = useMemo(
    () => searchExercises(query, effectiveCatalog),
    [query, effectiveCatalog],
  );

  const browserItems: BrowserExercise[] = useMemo(
    () => effectiveCatalog.map((e) => ({ id: e.name, name: e.name, group: e.group })),
    [effectiveCatalog],
  );

  const exactMatchExists =
    filteredRecents.some((e) => normalize(e.name) === normQuery) ||
    filteredCatalog.some((e) => normalize(e.name) === normQuery);

  const showCreateNew = Boolean(normQuery && !exactMatchExists);

  const pick = (name: string, recent?: RecentExercise) => {
    onSelect({
      name,
      sets: recent?.lastSets != null ? String(recent.lastSets) : "",
      reps: recent?.lastReps != null ? String(recent.lastReps) : "",
      weight: recent?.lastWeight != null ? String(recent.lastWeight) : "",
    });
  };

  const handleScanClick = () => {
    if (scanning) return;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset for re-pick
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image trop volumineuse (max 8 Mo).");
      return;
    }
    setScanning(true);
    setSuggestions(null);
    setDetectedMachine(null);
    try {
      const { base64, mime } = await fileToCompressedBase64(file);
      const { data, error } = await supabase.functions.invoke("scan-exercise", {
        body: {
          image_base64: base64,
          mime_type: mime,
          catalog: effectiveCatalog,
        },
      });
      if (error) {
        toast.error(error.message ?? "Erreur lors du scan.");
        return;
      }
      const payload = data as {
        error?: string;
        suggestions?: Suggestion[];
        detected_machine?: string;
      };
      if (payload?.error) {
        toast.error(payload.error);
        return;
      }
      if (!payload?.suggestions?.length) {
        toast.error("Aucune correspondance trouvée.");
        return;
      }
      setSuggestions(payload.suggestions);
      setDetectedMachine(payload.detected_machine ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du scan.");
    } finally {
      setScanning(false);
    }
  };

  const rowMenu = (ex: BrowserExercise) => {
    const actions: ExerciseMenuAction[] = [
      {
        key: "open",
        label: "Voir la fiche",
        icon: <BookOpen className="h-4 w-4" />,
        onClick: () => setOpenExercise(ex.name),
      },
    ];
    return <ExerciseActionsMenu title={ex.name} actions={actions} />;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative flex h-[88vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Liste partagée (Catalogue ↔ Picker) : recherche + scan caméra + suggestions/récents + catalogue groupé */}
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <ExerciseListBrowser
            items={browserItems}
            query={query}
            onQueryChange={setQuery}
            autoFocusSearch
            searchPlaceholder="Développé couché, squat…"
            groupOrder={CATALOG_GROUPS}
            getPhoto={(name) => exerciseIllustration(name) ?? undefined}
            onRowTap={(ex) => pick(ex.name)}
            renderRowMenu={rowMenu}
            trailingSearchSlot={
              <button
                type="button"
                onClick={handleScanClick}
                disabled={scanning}
                aria-label="Scanner une machine"
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary transition-colors active:bg-primary/20 disabled:opacity-50"
              >
                {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </button>
            }
            beforeListSlot={
              <>
                {/* AI suggestions */}
                {suggestions && suggestions.length > 0 && (
                  <section className="mb-6">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        <Sparkles className="h-3 w-3" />
                        Détecté par IA
                        {detectedMachine && (
                          <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                            · {detectedMachine}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSuggestions(null);
                          setDetectedMachine(null);
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Masquer
                      </button>
                    </div>
                    <ul className="space-y-1.5">
                      {suggestions.map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          <button
                            type="button"
                            onClick={() => {
                              const recent = recentExercises.find(
                                (r) => normalize(r.name) === normalize(s.name),
                              );
                              pick(s.name, recent);
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left transition-colors active:bg-primary/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{s.name}</span>
                                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                                  {Math.round(s.confidence * 100)}%
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {s.group}
                                {s.reason ? ` · ${s.reason}` : ""}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Create custom */}
                {showCreateNew && (
                  <button
                    type="button"
                    onClick={() => pick(query.trim())}
                    className="mb-5 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-left transition-colors active:bg-primary/20"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-lg font-bold text-primary">
                      +
                    </span>
                    <div>
                      <span className="block text-sm font-semibold">Créer "{query.trim()}"</span>
                      <span className="text-[11px] text-muted-foreground">Exercice personnalisé</span>
                    </div>
                  </button>
                )}

                {/* Recent exercises */}
                {filteredRecents.length > 0 && (
                  <section className="mb-6">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Exercices récents
                    </div>
                    <ul className="space-y-1.5">
                      {filteredRecents.map((r) => (
                        <li key={r.name}>
                          <button
                            type="button"
                            onClick={() => pick(r.name, r)}
                            className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors active:bg-surface/60"
                          >
                            <span className="text-sm font-medium">{r.name}</span>
                            {(r.lastSets || r.lastReps || r.lastWeight) && (
                              <span className="ml-3 shrink-0 text-[11px] text-muted-foreground">
                                {[
                                  r.lastSets && r.lastReps ? `${r.lastSets}×${r.lastReps}` : null,
                                  r.lastWeight ? `${r.lastWeight} kg` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {filteredCatalog.length > 0 && (
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Book className="h-3 w-3" />
                    {normQuery ? "Catalogue" : "Tous les exercices"}
                  </div>
                )}
              </>
            }
            emptyLabel={
              normQuery && filteredRecents.length === 0
                ? 'Aucun résultat — appuyez sur "Créer" pour ajouter un exercice.'
                : undefined
            }
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Fiche d'analyse — consultation rapide sans quitter la sélection */}
      {openExercise && (
        <ExerciseAnalysisSheet
          exerciseName={openExercise}
          weightHistory={[]}
          volumeHistory={[]}
          pr={undefined}
          imageUrl={exerciseIllustration(openExercise)}
          onClose={() => setOpenExercise(null)}
        />
      )}
    </div>
  );
}
