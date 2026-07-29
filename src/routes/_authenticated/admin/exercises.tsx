import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useExerciseSearch,
  useSimilarityPairs,
  useMergeLog,
  compareExercises,
  useMergeExercises,
  useUndoMerge,
  useArchiveExercise,
  useRestoreExercise,
  useDeleteExercise,
  useDismissSimilarityPair,
  useExerciseUsageStats,
  useExerciseMediaSummary,
  useExerciseMedia,
  useLibraryStats,
  useImportDataset,
  useDetectSimilarities,
  deriveExerciseOrigin,
  type ExerciseRow,
  type ExerciseOrigin,
  type ExerciseUsageStats,
  type ExerciseMediaSummary,
  type LibraryFilter,
  type ImportDatasetSummary,
} from "@/hooks/useExerciseAdmin";
import { resolveMuscleGroup } from "@/lib/fitness/muscleGroupInference";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/exercises")({
  head: () => ({
    meta: [
      { title: "Administration exercices — Cortex" },
      {
        name: "description",
        content: "Bibliothèque d'exercices : recherche, similarité, fusion manuelle.",
      },
    ],
  }),
  component: AdminExercisesPage,
});

// Gate applicatif (UX uniquement) : le vrai garde-fou est côté serveur dans
// l'edge function admin-exercise-actions (voir _shared/adminAuth.ts), qui
// vérifie l'email de l'utilisateur authentifié avant toute écriture. Ceci
// n'évite qu'un aller-retour inutile pour un compte non autorisé.
const ADMIN_EMAIL = "Turneur555@gmail.com";

function AdminExercisesPage() {
  const { user } = useAuth();
  if ((user?.email ?? "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-muted-foreground">
        Cette page est réservée à l'administration de la bibliothèque d'exercices.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Bibliothèque d'exercices</h1>
        <p className="text-sm text-muted-foreground">
          Cortex reste la source de vérité — aucune fusion n'est jamais automatique. Une seule
          bibliothèque : Cortex, Dataset et Fusionnés.
        </p>
      </header>
      <LibraryStatsBar />
      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Recherche & fusion</TabsTrigger>
          <TabsTrigger value="similarity">Suggestions de similarité</TabsTrigger>
          <TabsTrigger value="history">Fusions récentes</TabsTrigger>
          <TabsTrigger value="import">Import du dataset</TabsTrigger>
        </TabsList>
        <TabsContent value="search" className="mt-4">
          <SearchAndMergeTab />
        </TabsContent>
        <TabsContent value="similarity" className="mt-4">
          <SimilarityTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportDatasetTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bandeau de statistiques globales — toute la bibliothèque, tous filtres confondus
// ─────────────────────────────────────────────────────────────────────────
function LibraryStatsBar() {
  const { data: stats, isLoading } = useLibraryStats();
  if (isLoading || !stats) {
    return <div className="text-sm text-muted-foreground">Chargement des statistiques…</div>;
  }
  const items: Array<{ label: string; value: number }> = [
    { label: "Total", value: stats.total },
    { label: "Cortex", value: stats.cortex },
    { label: "Dataset", value: stats.dataset },
    { label: "Fusionnés", value: stats.merged },
    { label: "Archivés", value: stats.archived },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border p-2 text-center">
          <div className="text-lg font-semibold">{item.value}</div>
          <div className="text-xs text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

const ORIGIN_LABEL: Record<ExerciseOrigin, string> = {
  cortex: "Cortex",
  dataset: "Dataset",
  merged: "Fusionné",
};

const ORIGIN_BADGE_VARIANT: Record<ExerciseOrigin, "secondary" | "outline"> = {
  cortex: "secondary",
  dataset: "outline",
  merged: "outline",
};

function OriginBadge({ origin }: { origin: ExerciseOrigin }) {
  return <Badge variant={ORIGIN_BADGE_VARIANT[origin]}>{ORIGIN_LABEL[origin]}</Badge>;
}

function MediaBadges({ media }: { media: ExerciseMediaSummary | undefined }) {
  if (!media || (!media.hasPhoto && !media.hasGif && !media.hasVideo)) return null;
  return (
    <>
      {media.hasPhoto && (
        <Badge variant="outline" className="text-xs">
          Photo
        </Badge>
      )}
      {media.hasGif && (
        <Badge variant="outline" className="text-xs">
          GIF
        </Badge>
      )}
      {media.hasVideo && (
        <Badge variant="outline" className="text-xs">
          Vidéo
        </Badge>
      )}
    </>
  );
}

function usageLabel(stats: ExerciseUsageStats | undefined): string {
  const sessionCount = stats?.sessionCount ?? 0;
  const totalUses = stats?.totalUses ?? 0;
  if (totalUses === 0) return "Jamais utilisé";
  return `${sessionCount} séance${sessionCount > 1 ? "s" : ""} · ${totalUses} utilisation${totalUses > 1 ? "s" : ""}`;
}

const FILTER_OPTIONS: Array<{ value: LibraryFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "cortex", label: "Cortex" },
  { value: "dataset", label: "Dataset" },
  { value: "merged", label: "Fusionnés" },
  { value: "archived", label: "Archivés" },
];

// ─────────────────────────────────────────────────────────────────────────
// Onglet Recherche & fusion — sur toute la bibliothèque, "Tous" par défaut
// ─────────────────────────────────────────────────────────────────────────
function SearchAndMergeTab() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [selected, setSelected] = useState<ExerciseRow[]>([]);
  const { data: results, isLoading } = useExerciseSearch(query, filter);
  const archiveMutation = useArchiveExercise();
  const restoreMutation = useRestoreExercise();
  const deleteMutation = useDeleteExercise();

  const ids = (results ?? []).map((row) => row.id);
  const { data: usageStats } = useExerciseUsageStats(ids);
  const { data: mediaSummary } = useExerciseMediaSummary(ids);

  function toggleSelect(row: ExerciseRow) {
    setSelected((prev) => {
      const already = prev.find((r) => r.id === row.id);
      if (already) return prev.filter((r) => r.id !== row.id);
      if (prev.length >= 2) return [prev[1], row];
      return [...prev, row];
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Rechercher un exercice — Cortex, dataset ou fusionné…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={filter === opt.value ? "default" : "outline"}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {selected.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {selected.length}/2 sélectionné{selected.length > 1 ? "s" : ""} pour comparaison
          </span>
        )}
      </div>

      {selected.length === 2 && (
        <CompareCard a={selected[0]} b={selected[1]} onClose={() => setSelected([])} />
      )}

      <div className="rounded-lg border">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">Chargement…</div>}
        {!isLoading && (results ?? []).length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Aucun exercice trouvé.</div>
        )}
        {(results ?? []).map((row) => {
          const stats = usageStats?.[row.id];
          const media = mediaSummary?.[row.id];
          const origin = deriveExerciseOrigin(row);
          const muscleGroup = resolveMuscleGroup(row, row.name);
          return (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0"
          >
            <button
              className="flex-1 text-left"
              onClick={() => toggleSelect(row)}
              aria-pressed={!!selected.find((r) => r.id === row.id)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <Badge variant="secondary">{muscleGroup}</Badge>
                <OriginBadge origin={origin} />
                {!row.is_active && <Badge variant="outline">Archivé</Badge>}
                <MediaBadges media={media} />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{usageLabel(stats)}</div>
              {row.aliases && row.aliases.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Alias : {row.aliases.join(", ")}
                </div>
              )}
            </button>
            <div className="flex shrink-0 gap-2">
              {row.is_active ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    archiveMutation.mutate(
                      { id: row.id },
                      { onSuccess: () => toast.success(`"${row.name}" archivé.`) },
                    )
                  }
                >
                  Archiver
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    restoreMutation.mutate(
                      { id: row.id },
                      { onSuccess: () => toast.success(`"${row.name}" restauré.`) },
                    )
                  }
                >
                  Restaurer
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  deleteMutation.mutate(
                    { id: row.id },
                    {
                      onSuccess: (res) => {
                        if (res.deleted) toast.success(`"${row.name}" supprimé.`);
                        else toast.warning(res.reason as string);
                      },
                    },
                  )
                }
              >
                Supprimer
              </Button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

interface CompareField {
  label: string;
  value: (row: ExerciseRow) => string | null;
}

const COMPARE_FIELDS: CompareField[] = [
  { label: "Groupe musculaire", value: (row) => resolveMuscleGroup(row, row.name) },
  { label: "Muscles secondaires", value: (row) => row.config?.secondary_muscles?.join(", ") ?? null },
  { label: "Équipement", value: (row) => row.config?.equipment ?? null },
  { label: "Catégorie", value: (row) => row.category ?? null },
  { label: "Instructions", value: (row) => row.description ?? null },
  { label: "Alias", value: (row) => (row.aliases && row.aliases.length > 0 ? row.aliases.join(", ") : null) },
];

function mediaCounts(media: { media_type: string }[] | undefined) {
  const list = media ?? [];
  return {
    photos: list.filter((m) => m.media_type === "image").length,
    gifs: list.filter((m) => m.media_type === "gif").length,
    videos: list.filter((m) => m.media_type === "video").length,
  };
}

function CompareCard({ a, b, onClose }: { a: ExerciseRow; b: ExerciseRow; onClose: () => void }) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [keepSide, setKeepSide] = useState<"a" | "b">("a");
  const mergeMutation = useMergeExercises();
  const result = compareExercises(a, b);
  const pct = Math.round(result.score * 100);
  const { data: mediaA } = useExerciseMedia(a.id);
  const { data: mediaB } = useExerciseMedia(b.id);
  const originA = deriveExerciseOrigin(a);
  const originB = deriveExerciseOrigin(b);
  const countsA = mediaCounts(mediaA);
  const countsB = mediaCounts(mediaB);
  const sameFamily = a.family_id !== null && a.family_id === b.family_id;

  const keep = keepSide === "a" ? a : b;
  const other = keepSide === "a" ? b : a;

  function confirmMerge() {
    const archive = keepSide === "a" ? b : a;
    mergeMutation.mutate(
      { keep_id: keep.id, archive_id: archive.id },
      {
        onSuccess: () => {
          toast.success(`"${archive.name}" fusionné dans "${keep.name}".`);
          setMergeOpen(false);
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Échec de la fusion."),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Comparaison</CardTitle>
          <CardDescription>
            Score de correspondance : <span className="font-semibold text-foreground">{pct} %</span>
            {result.reasons.length > 0 && ` — ${result.reasons[0]}`}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            { row: a, origin: originA, counts: countsA },
            { row: b, origin: originB, counts: countsB },
          ].map(({ row, origin, counts }) => (
            <div key={row.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <OriginBadge origin={origin} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  Photos : {counts.photos}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  GIF : {counts.gifs}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Vidéos : {counts.videos}
                </Badge>
              </div>
              {COMPARE_FIELDS.map((field) => (
                <div key={field.label} className="text-xs text-muted-foreground">
                  {field.label} : {field.value(row) ?? "—"}
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                Variantes : {sameFamily ? "même famille que l'autre fiche" : "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Si « {keep.name} » est conservée : les champs suivants sont vides sur la fiche conservée et
          seront complétés depuis « {other.name} » —{" "}
          {COMPARE_FIELDS.filter((field) => !field.value(keep) && field.value(other)).map((field) => (
            <Badge key={field.label} variant="secondary" className="mr-1">
              + {field.label}
            </Badge>
          ))}
          {COMPARE_FIELDS.every((field) => field.value(keep) || !field.value(other)) && (
            <span>aucun — la fiche conservée a déjà toutes ces informations.</span>
          )}
        </div>

        <Button onClick={() => setMergeOpen(true)}>Fusionner ces deux fiches…</Button>
      </CardContent>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Fusionner "{a.name}" et "{b.name}"
            </DialogTitle>
            <DialogDescription>
              La fiche conservée garde son identifiant, tout son historique (séances, séries,
              répétitions, charges, records, programmes) et reçoit en plus les informations de
              l'autre fiche (description, muscles, équipement, alias, médias) — jamais l'inverse.
              L'autre fiche est archivée, pas supprimée, et cette fusion peut être annulée depuis
              l'onglet "Fusions récentes".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <input
                type="radio"
                name="keep"
                checked={keepSide === "a"}
                onChange={() => setKeepSide("a")}
              />
              Conserver « {a.name} »{" "}
              {!a.dataset_source && <Badge variant="secondary">fiche Cortex</Badge>}
            </label>
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <input
                type="radio"
                name="keep"
                checked={keepSide === "b"}
                onChange={() => setKeepSide("b")}
              />
              Conserver « {b.name} »{" "}
              {!b.dataset_source && <Badge variant="secondary">fiche Cortex</Badge>}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Annuler
            </Button>
            <Button onClick={confirmMerge} disabled={mergeMutation.isPending}>
              Confirmer la fusion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Onglet Suggestions de similarité
// ─────────────────────────────────────────────────────────────────────────
function SimilarityTab() {
  const { data: pairs, isLoading } = useSimilarityPairs("suggested");
  const dismissMutation = useDismissSimilarityPair();
  const mergeMutation = useMergeExercises();

  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!pairs || pairs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Aucune suggestion pour le moment. Lancer le job `detect-exercise-similarities` pour en
        calculer.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pairs.map((pair) => {
        const a = pair.exerciseA;
        const b = pair.exerciseB;
        if (!a || !b) return null;
        return (
          <div
            key={pair.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="text-sm">
              <span className="font-medium">{a.name}</span>
              <span className="mx-2 text-muted-foreground">↔</span>
              <span className="font-medium">{b.name}</span>
              <Badge className="ml-2" variant="secondary">
                {Math.round(pair.score * 100)} %
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  mergeMutation.mutate(
                    { keep_id: a.id, archive_id: b.id },
                    { onSuccess: () => toast.success(`"${b.name}" fusionné dans "${a.name}".`) },
                  )
                }
              >
                Fusionner (garder {a.name})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  dismissMutation.mutate(
                    { pair_id: pair.id },
                    { onSuccess: () => toast.success("Suggestion ignorée.") },
                  )
                }
              >
                Ignorer
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Onglet Fusions récentes
// ─────────────────────────────────────────────────────────────────────────
function HistoryTab() {
  const { data: log, isLoading } = useMergeLog();
  const undoMutation = useUndoMerge();

  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!log || log.length === 0) {
    return <div className="text-sm text-muted-foreground">Aucune fusion effectuée.</div>;
  }

  return (
    <div className="space-y-2">
      {log.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-3 rounded-md border p-3"
        >
          <div className="text-sm">
            <span className="text-muted-foreground">{entry.archivedName ?? "?"}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="font-medium">{entry.keptName ?? "?"}</span>
            {entry.undone_at && (
              <Badge className="ml-2" variant="outline">
                Annulée
              </Badge>
            )}
          </div>
          {!entry.undone_at && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                undoMutation.mutate(
                  { merge_log_id: entry.id },
                  { onSuccess: () => toast.success("Fusion annulée.") },
                )
              }
            >
              Annuler
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Onglet Import du dataset
// ─────────────────────────────────────────────────────────────────────────
function ImportDatasetTab() {
  const { data: stats } = useLibraryStats();
  const importMutation = useImportDataset();
  const detectMutation = useDetectSimilarities();
  const [lastDryRun, setLastDryRun] = useState<ImportDatasetSummary | null>(null);
  const [lastRealImport, setLastRealImport] = useState<ImportDatasetSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function runDryRun() {
    importMutation.mutate(true, {
      onSuccess: (summary) => setLastDryRun(summary),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Échec du dry-run."),
    });
  }

  function runRealImport() {
    importMutation.mutate(false, {
      onSuccess: (summary) => {
        setLastRealImport(summary);
        setConfirmOpen(false);
        toast.success(`${summary.createdIndependentFiches} exercice(s) importé(s).`);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Échec de l'import."),
    });
  }

  function runDetection() {
    detectMutation.mutate(false, {
      onSuccess: (summary) =>
        toast.success(
          `${summary.written} suggestion(s) de similarité ajoutée(s) sur ${summary.pairsFound} paire(s) détectée(s).`,
        ),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Échec de la détection."),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importer le dataset externe</CardTitle>
          <CardDescription>
            Chaque exercice du dataset devient une fiche indépendante (hors doublons techniques
            évidents) — jamais une fusion automatique avec un exercice Cortex existant. Les
            similarités éventuelles se consultent ensuite depuis l'onglet "Suggestions de
            similarité", jamais appliquées sans validation manuelle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-2 text-center">
              <div className="text-lg font-semibold">{stats?.cortex ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Exercices Cortex (actuel)</div>
            </div>
            <div className="rounded-md border p-2 text-center">
              <div className="text-lg font-semibold">
                {lastDryRun?.createdIndependentFiches ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Dataset à importer</div>
            </div>
            <div className="rounded-md border p-2 text-center">
              <div className="text-lg font-semibold">
                {lastDryRun?.technicalDuplicatesSkipped ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Doublons techniques ignorés</div>
            </div>
          </div>

          {!lastDryRun && (
            <p className="text-xs text-muted-foreground">
              Lance d'abord un dry-run pour voir le résumé exact avant tout import réel — aucune
              écriture n'a lieu tant que l'import réel n'est pas explicitement confirmé.
            </p>
          )}

          {lastDryRun && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Dernier dry-run : {lastDryRun.datasetRecords} enregistrements analysés,{" "}
              {lastDryRun.createdIndependentFiches} nouvelle(s) fiche(s) seraient créées,{" "}
              {lastDryRun.technicalDuplicatesSkipped} doublon(s) technique(s) ignoré(s)
              {lastDryRun.skippedNoName > 0 && `, ${lastDryRun.skippedNoName} sans nom ignoré(s)`}.
              Les fusions potentielles et exercices à valider se calculent après l'import via la
              détection de similarité (bouton ci-dessous).
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runDryRun} disabled={importMutation.isPending}>
              Dry-run
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!lastDryRun || importMutation.isPending}
            >
              Importer le dataset
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastRealImport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import terminé</CardTitle>
            <CardDescription>
              {lastRealImport.createdIndependentFiches} fiche(s) créée(s). Lance la détection de
              similarité pour peupler l'onglet "Suggestions de similarité" avec ces nouveaux
              exercices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runDetection} disabled={detectMutation.isPending}>
              Lancer la détection de similarité
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer réellement le dataset ?</DialogTitle>
            <DialogDescription>
              {lastDryRun?.createdIndependentFiches} fiche(s) indépendante(s) vont être créées dans
              la bibliothèque (aucun exercice Cortex existant n'est modifié ni fusionné). Cette
              opération est journalisée et peut être restaurée exactement en cas de besoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button onClick={runRealImport} disabled={importMutation.isPending}>
              Confirmer l'import réel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
