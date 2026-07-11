import { useMemo, useRef, useState } from "react";
import {
  Book,
  BookOpen,
  Camera,
  Check,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { CATALOG_GROUPS, normalize } from "@/lib/fitness/exerciseCatalog";
import { defaultWorkoutName } from "@/lib/fitness/config";
import { findSimilarExercises } from "@/lib/fitness/exerciseSimilar";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useFullExerciseCatalog,
  useAddExercise,
  useDeleteExercise,
  useUpdateExercise,
  usePromoteExercise,
  type DbCatalogRow,
} from "@/hooks/useExerciseCatalog";
import { useUserExercisePhotos } from "@/hooks/useUserExercisePhotos";
import { useActiveWorkout, useAddExerciseToActiveWorkout, useStartWorkoutFromTemplate } from "@/hooks/use-fitness";
import { ExerciseListBrowser, type BrowserExercise } from "./ExerciseListBrowser";
import { ExerciseActionsMenu, type ExerciseMenuAction } from "./ExerciseActionsMenu";
import { ExerciseAnalysisSheet, type ExerciseAnalysisActions } from "./ExerciseAnalysisSheet";
import type { RecentExercise } from "@/lib/fitness/recentExercises";

export type { RecentExercise };

export type PickedExercise = {
  name: string;
  sets: string;
  reps: string;
  weight: string;
};

type Suggestion = {
  name: string;
  group: string;
  confidence: number;
  reason?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALL_GROUPS = [...CATALOG_GROUPS, "Mes exercices"];

async function fileToCompressedBase64(file: File): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

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
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
    return { base64: b64, mime };
  }
}

export interface ExerciseExplorerSheetProps {
  /** "catalog" : tap principal ouvre la fiche. "picker" : tap principal
   *  sélectionne l'exercice immédiatement (onPick). Le reste de l'écran —
   *  recherche, liste, menu "..." — est strictement identique dans les
   *  deux modes : c'est le même écran, pas deux composants qui se
   *  ressemblent. */
  mode: "catalog" | "picker";
  onClose: () => void;
  /** Mode picker uniquement : sélection rapide (tap sur une ligne, un
   *  suggestion IA, un exercice récent, ou "créer x"). */
  onPick?: (picked: PickedExercise) => void;
  recentExercises?: RecentExercise[];
  initialQuery?: string;
  /** Mode picker uniquement : active le scan caméra IA. */
  enableScan?: boolean;
  /** Historique/records déjà calculés (computePRs) pour la fiche — optionnels,
   *  la fiche dégrade gracieusement si absents (ses propres requêtes internes
   *  restent la source de vérité pour sessionCount/analysis). */
  histByName?: Map<string, Array<{ date: string; weight: number }>>;
  volByName?: Map<string, Array<{ date: string; volume: number }>>;
  prByName?: Map<string, number>;
}

/**
 * Écran unique du module Exercices — sert à la fois de Catalogue
 * (bibliothèque de référence, tap → fiche) et de Picker (sélection rapide,
 * tap → ajout immédiat). Voir ExerciseCatalogSheet/ExercisePickerSheet
 * (fines coquilles) pour les deux points d'entrée publics.
 */
export function ExerciseExplorerSheet({
  mode,
  onClose,
  onPick,
  recentExercises = [],
  initialQuery = "",
  enableScan = false,
  histByName = new Map(),
  volByName = new Map(),
  prByName = new Map(),
}: ExerciseExplorerSheetProps) {
  const { data: catalog, isLoading } = useFullExerciseCatalog();
  const { data: userPhotos } = useUserExercisePhotos();
  const addExercise = useAddExercise();
  const deleteExercise = useDeleteExercise();
  const updateExercise = useUpdateExercise();
  const promoteExercise = usePromoteExercise();
  const { data: activeWorkout } = useActiveWorkout();
  const addToActiveWorkout = useAddExerciseToActiveWorkout();
  const startFromTemplate = useStartWorkoutFromTemplate();

  const [query, setQuery] = useState(initialQuery);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(CATALOG_GROUPS[0]);
  const [editingExercise, setEditingExercise] = useState<DbCatalogRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [promotingExercise, setPromotingExercise] = useState<DbCatalogRow | null>(null);
  const [promoteGroup, setPromoteGroup] = useState(CATALOG_GROUPS[0]);
  const [openExercise, setOpenExercise] = useState<BrowserExercise | null>(null);

  // Picker uniquement : scan caméra IA.
  const [scanning, setScanning] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [detectedMachine, setDetectedMachine] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const items: BrowserExercise[] = useMemo(
    () => (catalog ?? []).map((r) => ({ id: r.id, name: r.name, group: r.category ?? "" })),
    [catalog],
  );

  const isCustom = (id: string) => id.startsWith("custom__");
  const findRow = (id: string): DbCatalogRow | undefined => catalog?.find((r) => r.id === id);

  const getPhoto = (name: string) => {
    if (userPhotos) {
      const userUrl = userPhotos.get(normalize(name));
      if (userUrl) return userUrl;
    }
    return exerciseIllustration(name);
  };

  const normQuery = normalize(query);
  const filteredRecents = useMemo(() => {
    if (!normQuery) return recentExercises;
    return recentExercises.filter((e) => normalize(e.name).includes(normQuery));
  }, [recentExercises, normQuery]);

  const exactMatchExists =
    filteredRecents.some((e) => normalize(e.name) === normQuery) || items.some((e) => normalize(e.name) === normQuery);
  const showCreateNew = mode === "picker" && Boolean(normQuery && !exactMatchExists);

  // ── Gestion du catalogue (identique dans les deux modes) ───────────────────

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addExercise.mutateAsync({ name: newName.trim(), category: newGroup });
      toast.success(`"${newName.trim()}" ajouté`);
      setNewName("");
      setShowAdd(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'ajout");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (isCustom(id)) {
      toast.error("Exercice hors catalogue — supprime-le depuis tes séances.");
      return;
    }
    try {
      await deleteExercise.mutateAsync(id);
      toast.success(`"${name}" supprimé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleEditSave = async () => {
    if (!editingExercise || !editName.trim()) return;
    try {
      await updateExercise.mutateAsync({ id: editingExercise.id, name: editName.trim(), category: editGroup });
      toast.success("Exercice modifié");
      setEditingExercise(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handlePromote = async () => {
    if (!promotingExercise) return;
    try {
      await promoteExercise.mutateAsync({ name: promotingExercise.name, category: promoteGroup });
      toast.success(`"${promotingExercise.name}" ajouté au catalogue`);
      setPromotingExercise(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const openEdit = (row: DbCatalogRow) => {
    setEditingExercise(row);
    setEditName(row.name);
    setEditGroup(row.category ?? "");
  };

  const openPromote = (ex: BrowserExercise) => {
    setPromotingExercise({ id: ex.id, name: ex.name, category: ex.group, sort_order: 999, created_at: "" });
    setPromoteGroup(CATALOG_GROUPS[0]);
  };

  // ── "Utiliser" l'exercice — comportement contextuel ────────────────────────
  // Catalogue : mutation directe (démarre une vraie séance / alimente la
  // séance active en base). Picker : alias du tap principal — délègue
  // toujours à `onPick`, jamais de mutation directe, pour rester cohérent
  // avec ce que l'écran appelant fait réellement de la sélection (ajout à
  // un formulaire pas encore sauvegardé, séance active, séance passée
  // éditée...). Le libellé s'adapte au contexte (séance active ou non),
  // mais l'action sous-jacente en mode picker reste toujours "sélectionner".
  const handleStartSession = async (name: string) => {
    try {
      await startFromTemplate.mutateAsync({ name: defaultWorkoutName(), gym_location: null, exercises: [{ name }] });
      onClose();
    } catch {
      // erreur déjà notifiée par le hook (toast.error)
    }
  };

  const handleAddToActive = async (name: string) => {
    if (!activeWorkout) return;
    try {
      await addToActiveWorkout.mutateAsync({ workoutId: activeWorkout.id, name });
      toast.success(`"${name}" ajouté à la séance en cours`);
      onClose();
    } catch {
      // erreur déjà notifiée par le hook (toast.error)
    }
  };

  const handlePrimaryUseAction = (name: string, recent?: RecentExercise) => {
    if (mode === "picker") {
      onPick?.({
        name,
        sets: recent?.lastSets != null ? String(recent.lastSets) : "",
        reps: recent?.lastReps != null ? String(recent.lastReps) : "",
        weight: recent?.lastWeight != null ? String(recent.lastWeight) : "",
      });
      return;
    }
    if (activeWorkout) handleAddToActive(name);
    else handleStartSession(name);
  };

  const handleRowTap = (ex: BrowserExercise) => {
    if (mode === "picker") handlePrimaryUseAction(ex.name);
    else setOpenExercise(ex);
  };

  // ── Menu "..." — identique dans les deux modes, actions activées/désactivées
  //    selon le contexte (séance active, exercice custom ou officiel). ───────

  const buildMenuActions = (ex: BrowserExercise): ExerciseMenuAction[] => {
    const row = findRow(ex.id);
    const custom = isCustom(ex.id);
    const actions: ExerciseMenuAction[] = [
      { key: "open", label: "Voir la fiche", icon: <BookOpen className="h-4 w-4" />, onClick: () => setOpenExercise(ex) },
    ];
    if (activeWorkout) {
      actions.push({
        key: "add-active",
        label: "Ajouter à la séance en cours",
        icon: <Plus className="h-4 w-4" />,
        onClick: () => handlePrimaryUseAction(ex.name),
      });
    } else {
      actions.push({
        key: "start",
        label: "Démarrer une séance avec cet exercice",
        icon: <Zap className="h-4 w-4" />,
        onClick: () => handlePrimaryUseAction(ex.name),
      });
    }
    if (custom) {
      actions.push({
        key: "promote",
        label: "Ajouter au catalogue",
        icon: <Star className="h-4 w-4" />,
        onClick: () => openPromote(ex),
      });
    } else if (row) {
      actions.push(
        { key: "edit", label: "Modifier", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) },
        {
          key: "delete",
          label: "Supprimer",
          icon: <Trash2 className="h-4 w-4" />,
          onClick: () => handleDelete(ex.id, ex.name),
          destructive: true,
        },
      );
    }
    return actions;
  };

  const analysisActionsFor = (ex: BrowserExercise): ExerciseAnalysisActions => {
    const custom = isCustom(ex.id);
    const row = findRow(ex.id);
    return {
      onStartSession: !activeWorkout ? () => handlePrimaryUseAction(ex.name) : undefined,
      onAddToActiveWorkout: activeWorkout ? () => handlePrimaryUseAction(ex.name) : undefined,
      onEdit: !custom && row ? () => openEdit(row) : undefined,
      onDelete: !custom ? () => handleDelete(ex.id, ex.name) : undefined,
      onPromote: custom ? () => openPromote(ex) : undefined,
    };
  };

  const similarFor = (ex: BrowserExercise) =>
    findSimilarExercises({ name: ex.name, group: ex.group }, items.map((i) => ({ name: i.name, group: i.group })));

  // ── Scan caméra IA (picker uniquement) ─────────────────────────────────────

  const handleScanClick = () => {
    if (scanning) return;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
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
        body: { image_base64: base64, mime_type: mime, catalog: items.map((i) => ({ name: i.name, group: i.group })) },
      });
      if (error) {
        toast.error(error.message ?? "Erreur lors du scan.");
        return;
      }
      const payload = data as { error?: string; suggestions?: Suggestion[]; detected_machine?: string };
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative flex h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header — identique dans les deux modes */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Catalogue d'exercices</h2>
            {catalog && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {catalog.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary transition-colors active:bg-primary/30"
              aria-label="Ajouter un exercice"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Add form — identique dans les deux modes */}
        {showAdd && (
          <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Nouvel exercice</p>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Nom de l'exercice…"
              className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {CATALOG_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setNewGroup(g)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newGroup === g
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-card/50 text-muted-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || addExercise.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {addExercise.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* Liste — identique dans les deux modes ; seul le tap principal change */}
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <ExerciseListBrowser
            items={items}
            isLoading={isLoading}
            query={query}
            onQueryChange={setQuery}
            autoFocusSearch={mode === "picker"}
            groupOrder={ALL_GROUPS}
            highlightGroups={new Set(["Mes exercices"])}
            getPhoto={getPhoto}
            onRowTap={handleRowTap}
            renderRowMenu={(ex) => <ExerciseActionsMenu title={ex.name} actions={buildMenuActions(ex)} />}
            emptyLabel={query ? "Aucun résultat." : "Catalogue vide — ajoutez des exercices."}
            trailingSearchSlot={
              enableScan ? (
                <button
                  type="button"
                  onClick={handleScanClick}
                  disabled={scanning}
                  aria-label="Scanner une machine"
                  className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary transition-colors active:bg-primary/20 disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                </button>
              ) : undefined
            }
            beforeListSlot={
              mode === "picker" ? (
                <>
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
                                const recent = recentExercises.find((r) => normalize(r.name) === normalize(s.name));
                                handlePrimaryUseAction(s.name, recent);
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

                  {showCreateNew && (
                    <button
                      type="button"
                      onClick={() => handlePrimaryUseAction(query.trim())}
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
                              onClick={() => handlePrimaryUseAction(r.name, r)}
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

                  {items.length > 0 && (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Book className="h-3 w-3" />
                      {normQuery ? "Catalogue" : "Tous les exercices"}
                    </div>
                  )}
                </>
              ) : undefined
            }
          />
        </div>

        {enableScan && (
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        )}
      </div>

      {/* Fiche d'analyse — page de référence de l'exercice, dans les deux modes */}
      {openExercise && (
        <ExerciseAnalysisSheet
          exerciseName={openExercise.name}
          weightHistory={histByName.get(normalize(openExercise.name)) ?? []}
          volumeHistory={volByName.get(normalize(openExercise.name)) ?? []}
          pr={prByName.get(normalize(openExercise.name))}
          imageUrl={getPhoto(openExercise.name)}
          onClose={() => setOpenExercise(null)}
          actions={analysisActionsFor(openExercise)}
          similarExercises={similarFor(openExercise)}
          onSelectSimilar={(name) => {
            const found = items.find((i) => normalize(i.name) === normalize(name));
            if (found) setOpenExercise(found);
          }}
        />
      )}

      {/* Modifier */}
      {editingExercise && (
        <EditExerciseSheet
          name={editName}
          group={editGroup}
          pending={updateExercise.isPending}
          onNameChange={setEditName}
          onGroupChange={setEditGroup}
          onCancel={() => setEditingExercise(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Promouvoir */}
      {promotingExercise && (
        <PromoteExerciseSheet
          name={promotingExercise.name}
          group={promoteGroup}
          pending={promoteExercise.isPending}
          onGroupChange={setPromoteGroup}
          onCancel={() => setPromotingExercise(null)}
          onConfirm={handlePromote}
        />
      )}
    </div>
  );
}

// ── Petites feuilles de gestion (modifier / promouvoir) ──────────────────────

function EditExerciseSheet({
  name,
  group,
  pending,
  onNameChange,
  onGroupChange,
  onCancel,
  onSave,
}: {
  name: string;
  group: string;
  pending: boolean;
  onNameChange: (v: string) => void;
  onGroupChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Modifier l'exercice</p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave()}
          className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {CATALOG_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupChange(g)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                group === g ? "border-primary bg-primary/20 text-primary" : "border-border bg-card/50 text-muted-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground">
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!name.trim() || pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoteExerciseSheet({
  name,
  group,
  pending,
  onGroupChange,
  onCancel,
  onConfirm,
}: {
  name: string;
  group: string;
  pending: boolean;
  onGroupChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Ajouter "{name}" au catalogue</p>
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {CATALOG_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupChange(g)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                group === g ? "border-primary bg-primary/20 text-primary" : "border-border bg-card/50 text-muted-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
