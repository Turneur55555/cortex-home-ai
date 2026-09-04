import { useState } from "react";
import { AlertTriangle, Ban, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OfflineSyncState } from "@/hooks/useOfflineSync";
import { describeSyncFailure, technicalErrorDetail } from "@/lib/offline/syncErrors";
import type { SyncOperation } from "@/lib/offline/types";

const MAX_VISIBLE_OPERATIONS = 20;

/**
 * Panneau des opérations en attente / échouées / bloquées + résolution de
 * conflit. Visible seulement via `SyncStatusIndicator` quand il y a quelque
 * chose à montrer (pas de doublon d'entrée dans une nav — cohérent avec les
 * autres `*Sheet.tsx` du projet).
 */
export function SyncQueueSheet({ onClose, sync }: { onClose: () => void; sync: OfflineSyncState }) {
  // Ce qui demande une décision (bloqué), puis ce qui coince (échec
  // temporaire), puis le reste — l'ordre FIFO est conservé à l'intérieur de
  // chaque groupe. On plafonne l'affichage : une queue de 30 opérations ne
  // doit pas noyer les deux qui posent réellement problème.
  const sortedOperations = [...sync.operations].sort(
    (a, b) => operationPriority(a) - operationPriority(b),
  );
  const visibleOperations = sortedOperations.slice(0, MAX_VISIBLE_OPERATIONS);
  const hiddenOperationsCount = sortedOperations.length - visibleOperations.length;
  // Les opérations bloquées comptent dans le total : sinon le panneau
  // annoncerait « Tout est synchronisé » alors qu'une action attend une
  // décision juste au-dessus.
  const totalQueued = sync.pendingCount + sync.failedCount + sync.blockedCount;

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Synchronisation</SheetTitle>
          <SheetDescription>
            {sync.isOnline
              ? "Vos modifications se synchronisent automatiquement."
              : "Hors connexion — vos modifications sont enregistrées et partiront dès le retour du réseau."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {sync.conflicts.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Conflits à résoudre
              </h3>
              {sync.conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  onResolve={(strategy) => sync.resolveConflict(conflict.id, strategy)}
                />
              ))}
            </section>
          )}

          {visibleOperations.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Actions en cours</h3>
              {visibleOperations.map((operation) => (
                <OperationCard
                  key={operation.id}
                  operation={operation}
                  onRetry={() => sync.retryOperation(operation.id)}
                  onDiscard={() => sync.discardOperation(operation.id)}
                />
              ))}
              {hiddenOperationsCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  + {hiddenOperationsCount} autre{hiddenOperationsCount > 1 ? "s" : ""} action
                  {hiddenOperationsCount > 1 ? "s" : ""} en attente.
                </p>
              )}
            </section>
          )}

          <section className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {totalQueued === 0
                  ? "Tout est synchronisé"
                  : `${totalQueued} action${totalQueued > 1 ? "s" : ""} en attente`}
              </p>
              {sync.failedCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {sync.failedCount} en échec temporaire — nouvelle tentative prévue
                </p>
              )}
              {sync.blockedCount > 0 && (
                <p className="text-xs text-destructive">
                  {sync.blockedCount} bloquée{sync.blockedCount > 1 ? "s" : ""} — une action de
                  votre part est nécessaire
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!sync.isOnline || sync.isSyncing}
              onClick={() => sync.syncNow()}
            >
              <RefreshCw className={sync.isSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Réessayer
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Deux causes de conflit (`ConflictRecord.reason`, cf. `types.ts`) :
 * - `updated_at_mismatch` (historique) : la ligne serveur existe toujours,
 *   juste modifiée entre-temps — comparaison 2 colonnes, 2 actions.
 * - `server_row_deleted` (correctif PGRST116 du 02/09/2026) : la ligne a été
 *   supprimée côté serveur alors qu'une modification locale était encore en
 *   attente. Il n'existe AUCUNE version serveur à montrer ni à garder — on
 *   ne propose donc PAS « Garder ma version » (elle relancerait un UPDATE
 *   sur une ligne inexistante, donc une action impossible), seulement
 *   l'abandon explicite de la modification locale. Depuis le chantier
 *   « fiabilisation du moteur offline » (MIN-06), le MOTEUR refuse lui aussi
 *   cette résolution (`resolveConflict`) : la règle ne dépend plus du seul
 *   masquage côté UI.
 */
function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: OfflineSyncState["conflicts"][number];
  onResolve: (strategy: "keep-local" | "keep-server") => void;
}) {
  const local = conflict.localData as Record<string, unknown>;
  // MIN-08 — repli sur le libellé français de la table (jamais le nom
  // technique brut, cf. `formatTableLabel`) quand la ligne n'a pas de `name`.
  const label = typeof local.name === "string" ? local.name : formatTableLabel(conflict.table);
  const isServerRowDeleted = conflict.reason === "server_row_deleted";

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isServerRowDeleted
          ? "La ligne a été supprimée du serveur alors qu'une modification locale était encore en attente."
          : "Cette donnée a été modifiée ailleurs. Choisissez la version à conserver."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border/60 bg-background/60 p-2">
          <Badge variant="secondary" className="mb-1">
            Ma version
          </Badge>
          <VersionPreview data={local} />
        </div>
        <div className="rounded-md border border-border/60 bg-background/60 p-2">
          <Badge variant="secondary" className="mb-1">
            Version serveur
          </Badge>
          {conflict.serverData ? (
            <VersionPreview data={conflict.serverData as Record<string, unknown>} />
          ) : (
            <p className="text-muted-foreground">Ligne supprimée du serveur</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {/* « Garder ma version » exigerait de ré-écrire une ligne qui n'existe
            plus côté serveur — action impossible, jamais proposée pour ce
            motif (cf. doc ci-dessus). */}
        {!isServerRowDeleted && (
          <Button size="sm" className="flex-1" onClick={() => onResolve("keep-local")}>
            Garder ma version
          </Button>
        )}
        <Button
          size="sm"
          variant={isServerRowDeleted ? "default" : "outline"}
          className="flex-1"
          onClick={() => onResolve("keep-server")}
        >
          {isServerRowDeleted ? "Abandonner ma modification" : "Garder la version serveur"}
        </Button>
      </div>
    </div>
  );
}

/**
 * MIN-08 — mêmes colonnes Supabase (`snake_case` anglais) que celles qui
 * peuvent apparaître dans une comparaison de conflit, pour TOUTES les tables
 * offline-first (`TABLE_LABELS_FR` ci-dessus). Couvre l'union des colonnes
 * de `types.ts` hors `id`/`user_id`/`created_at`/`updated_at` (déjà exclues
 * plus bas) et des `*_id` de relation (généralement filtrés eux aussi, mais
 * gardés ici par prudence si un jour affichés).
 */
const FIELD_LABELS_FR: Record<string, string> = {
  name: "Nom",
  notes: "Notes",
  position: "Position",
  reps: "Répétitions",
  sets: "Séries",
  weight: "Poids",
  superset_group: "Groupe superset",
  muscle_groups: "Groupes musculaires",
  image_path: "Image",
  completed: "Terminé",
  rest_seconds: "Repos (s)",
  set_number: "N° de série",
  tempo: "Tempo",
  date: "Date",
  discipline: "Discipline",
  duration_minutes: "Durée (min)",
  gym_location: "Lieu",
  level_before: "Niveau avant",
  level_after: "Niveau après",
  xp_before: "XP avant",
  xp_after: "XP après",
  status: "Statut",
  metadata: "Métadonnées",
  label: "Libellé",
  metric_key: "Métrique",
  metrics: "Mesures",
  color: "Couleur",
  icon: "Icône",
  summary: "Résumé",
  goal: "Objectif",
  started_at: "Débuté le",
  completed_at: "Terminé le",
  target_weight_kg: "Poids cible (kg)",
  target_rate: "Rythme cible",
  target_body_fat_percent: "Taux de masse grasse cible (%)",
  starting_weight_kg: "Poids de départ (kg)",
  starting_body_fat_percent: "Masse grasse de départ (%)",
  starting_body_fat_method: "Méthode de mesure",
  starting_lean_mass_kg: "Masse maigre de départ (kg)",
  dosage: "Dosage",
  unit: "Unité",
  is_active: "Actif",
  is_default: "Par défaut",
  sort_order: "Ordre",
  quantity: "Quantité",
  grams: "Grammes",
  category: "Catégorie",
  done: "Fait",
  custom_name: "Nom personnalisé",
  meal: "Repas",
  servings: "Portions",
  brand: "Marque",
  calories: "Calories",
  carbs: "Glucides",
  fats: "Lipides",
  proteins: "Protéines",
  default_serving_grams: "Portion par défaut (g)",
  base_calories: "Calories (base)",
  base_carbs: "Glucides (base)",
  base_fats: "Lipides (base)",
  base_proteins: "Protéines (base)",
  consumed_quantity: "Quantité consommée",
  consumed_unit: "Unité consommée",
  consumed_grams_per_unit: "Grammes par unité",
  percentage_consumed: "% consommé",
  serving_count: "Nombre de portions",
};

/** Toute colonne relationnelle (`xxx_id`) ou inconnue garde un libellé neutre. */
function formatFieldLabel(field: string): string {
  if (FIELD_LABELS_FR[field]) return FIELD_LABELS_FR[field];
  if (field.endsWith("_id")) return "Référence";
  // Repli : jamais le nom technique brut avec underscore — au minimum
  // humanisé (espaces, première lettre en majuscule).
  const words = field.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function VersionPreview({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([field]) => !["id", "user_id", "created_at", "updated_at"].includes(field),
  );
  return (
    <dl className="space-y-0.5">
      {entries.slice(0, 4).map(([field, value]) => (
        <div key={field} className="flex justify-between gap-2 text-muted-foreground">
          <dt className="truncate">{formatFieldLabel(field)}</dt>
          <dd className="truncate text-foreground">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function operationPriority(operation: SyncOperation): number {
  if (operation.status === "blocked") return 0;
  if (operation.status === "failed") return 1;
  return 2;
}

const OP_TYPE_LABELS: Record<SyncOperation["opType"], string> = {
  create: "Ajout",
  update: "Modification",
  delete: "Suppression",
};

/**
 * MIN-08 (audit du 04/09/2026, chantier 6) — le nom TECHNIQUE de la table
 * Supabase (`exercise_sets`, `nutrition_favorites`…) apparaissait tel quel à
 * l'utilisateur, juste capitalisé (« Exercise sets », « Nutrition
 * favorites ») : un libellé anglais dans une UI entièrement française. Cette
 * table couvre TOUTES les tables offline-first du repository (cf.
 * `createOfflineRepository` — cf. les hooks) avec un libellé français
 * lisible — le nom technique lui-même (clé) reste inchangé partout ailleurs
 * dans le code (types, requêtes, sync engine).
 */
const TABLE_LABELS_FR: Record<string, string> = {
  exercises: "Exercices",
  exercise_sets: "Séries",
  workouts: "Séances",
  workout_segments: "Segments de séance",
  workout_templates: "Modèles de séance",
  workout_analyses: "Analyses de séance",
  physical_goals: "Objectifs physiques",
  supplements: "Compléments",
  recipes: "Recettes",
  recipe_ingredients: "Ingrédients de recette",
  recipe_collections: "Collections de recettes",
  meal_plans: "Plannings de repas",
  shopping_list: "Liste de courses",
  saved_meals: "Repas enregistrés",
  food_custom_foods: "Aliments personnalisés",
  nutrition: "Nutrition",
  nutrition_favorites: "Favoris nutrition",
};

/**
 * Table sans traduction connue (ne devrait pas arriver, cf. `TABLE_LABELS_FR`
 * ci-dessus) : on ne réaffiche jamais le nom technique brut à l'utilisateur —
 * repli neutre plutôt qu'un mot anglais capitalisé.
 */
function formatTableLabel(table: string): string {
  return TABLE_LABELS_FR[table] ?? "Donnée";
}

/**
 * Une ligne de la file, avec son état RÉEL. Règle (audit MAJ-11) : on
 * distingue explicitement « en attente », « échec temporaire » et « action
 * bloquée », et on n'affiche JAMAIS un message générique quand l'erreur
 * remontée par le serveur (`lastError`) dit quelque chose d'exploitable.
 */
function OperationCard({
  operation,
  onRetry,
  onDiscard,
}: {
  operation: SyncOperation;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isBlocked = operation.status === "blocked";
  const isFailed = operation.status === "failed";
  const reason = describeSyncFailure(operation);
  const technical = technicalErrorDetail(operation.lastError);

  return (
    <div
      className={
        isBlocked
          ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          : "rounded-lg border border-border/60 bg-muted/20 p-3"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {OP_TYPE_LABELS[operation.opType]} · {formatTableLabel(operation.table)}
          </p>
          <p
            className={
              isBlocked
                ? "mt-0.5 flex items-center gap-1.5 text-xs font-medium text-destructive"
                : isFailed
                  ? "mt-0.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                  : "mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            }
          >
            {isBlocked ? (
              <>
                <Ban className="h-3.5 w-3.5 shrink-0" />
                Action bloquée
              </>
            ) : isFailed ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Échec temporaire — nouvelle tentative prévue
              </>
            ) : operation.status === "syncing" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <CloudUpload className="h-3.5 w-3.5 shrink-0" />
                Action en attente — nouvelle tentative automatique
              </>
            )}
          </p>
        </div>
        {operation.retryCount > 0 && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {operation.retryCount} tentative{operation.retryCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {reason && (isBlocked || isFailed) && (
        <p className="mt-2 break-words text-xs text-foreground/80">{reason}</p>
      )}
      {isBlocked && technical && (
        <p className="mt-1 break-all font-mono text-[10px] leading-tight text-muted-foreground">
          {technical}
        </p>
      )}

      {isBlocked && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Réessayer quand même
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 text-destructive hover:text-destructive"
            onClick={() => setConfirmDiscard(true)}
          >
            Retirer de la file
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette action de la file ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action ne sera plus envoyée au serveur. Vos données enregistrées sur cet
              appareil ne sont pas supprimées : elles restent visibles dans l&apos;application, mais
              cette modification ne sera pas synchronisée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onDiscard();
              }}
            >
              Retirer de la file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
