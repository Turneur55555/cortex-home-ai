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
  type ExerciseRow,
} from "@/hooks/useExerciseAdmin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  if ((user?.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
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
          Cortex reste la source de vérité — aucune fusion n'est jamais automatique.
        </p>
      </header>
      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Recherche & fusion</TabsTrigger>
          <TabsTrigger value="similarity">Suggestions de similarité</TabsTrigger>
          <TabsTrigger value="history">Fusions récentes</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Onglet Recherche & fusion
// ─────────────────────────────────────────────────────────────────────────
function SearchAndMergeTab() {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<ExerciseRow[]>([]);
  const { data: results, isLoading } = useExerciseSearch(query, includeArchived);
  const archiveMutation = useArchiveExercise();
  const restoreMutation = useRestoreExercise();
  const deleteMutation = useDeleteExercise();

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
          placeholder="Rechercher un exercice…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="include-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <Label htmlFor="include-archived" className="text-sm">
            Inclure les archivés
          </Label>
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
        {(results ?? []).map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0"
          >
            <button
              className="flex-1 text-left"
              onClick={() => toggleSelect(row)}
              aria-pressed={!!selected.find((r) => r.id === row.id)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.name}</span>
                {row.category && <Badge variant="secondary">{row.category}</Badge>}
                {!row.is_active && <Badge variant="outline">Archivé</Badge>}
                {row.dataset_source && <Badge variant="outline">dataset</Badge>}
              </div>
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
        ))}
      </div>
    </div>
  );
}

function CompareCard({ a, b, onClose }: { a: ExerciseRow; b: ExerciseRow; onClose: () => void }) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [keepSide, setKeepSide] = useState<"a" | "b">("a");
  const mergeMutation = useMergeExercises();
  const result = compareExercises(a, b);
  const pct = Math.round(result.score * 100);

  function confirmMerge() {
    const keep = keepSide === "a" ? a : b;
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
          {[a, b].map((row) => (
            <div key={row.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-muted-foreground">Catégorie : {row.category ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                Muscle principal : {row.config?.muscle_group ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Équipement : {row.config?.equipment ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Alias : {row.aliases && row.aliases.length > 0 ? row.aliases.join(", ") : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Source : {row.dataset_source ? "dataset" : "Cortex"}
              </div>
            </div>
          ))}
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
