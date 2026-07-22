import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { gradeName } from "@/lib/fitness/rpg/grade";
import type { RankState } from "@/lib/fitness/exerciseRanks";

export interface BrowserExercise {
  id: string;
  name: string;
  group: string;
}

interface Props<T extends BrowserExercise> {
  items: T[];
  isLoading?: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Élément affiché à droite de la barre de recherche (ex: bouton scan caméra du Picker). */
  trailingSearchSlot?: React.ReactNode;
  /** Contenu affiché au-dessus de la liste groupée (ex: suggestions IA, récents, "créer un exercice"). */
  beforeListSlot?: React.ReactNode;
  /** Ordre d'affichage préféré des groupes ; les groupes non listés sont ajoutés à la suite. */
  groupOrder?: string[];
  /** Groupes mis en avant visuellement (ex: "Mes exercices"). */
  highlightGroups?: Set<string>;
  getPhoto?: (name: string) => string | null | undefined;
  /**
   * Rang RPG déjà atteint pour un exercice (clé = nom d'exercice, comme
   * `useExerciseProgression`) — fourni uniquement par les écrans où le
   * moteur Rang s'applique (Catalogue musculation). Quand présent pour une
   * ligne, remplace la photo de référence par `RankIllustration` (même
   * composant/cadrage que partout ailleurs dans le RPG) + le grade officiel,
   * exactement comme la fiche d'exercice.
   */
  rankByName?: Map<string, RankState>;
  /** Tap principal sur la ligne — comportement injecté par l'écran appelant
   *  (sélection rapide dans le Picker, ouverture de la fiche dans le Catalogue). */
  onRowTap: (item: T) => void;
  /** Actions secondaires (menu "...") — toujours visibles, jamais en hover. */
  renderRowMenu?: (item: T) => React.ReactNode;
  emptyLabel?: string;
  /** Focus automatique du champ de recherche à l'ouverture (repli comportement Picker). */
  autoFocusSearch?: boolean;
}

/**
 * Rendu de liste d'exercices partagé entre ExerciseCatalogSheet et
 * ExercisePickerSheet : recherche, groupement, photo, tap principal +
 * menu d'actions secondaire. Toute évolution ici (tri, affichage, a11y)
 * bénéficie automatiquement aux deux écrans — c'est la seule source de
 * vérité pour "comment on affiche une liste d'exercices" dans l'app.
 */
export function ExerciseListBrowser<T extends BrowserExercise>({
  items,
  isLoading,
  query,
  onQueryChange,
  searchPlaceholder = "Rechercher un exercice…",
  trailingSearchSlot,
  beforeListSlot,
  groupOrder,
  highlightGroups,
  getPhoto,
  rankByName,
  onRowTap,
  renderRowMenu,
  emptyLabel,
  autoFocusSearch,
}: Props<T>) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusSearch) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return items;
    return items.filter((e) => normalize(e.name).includes(q) || normalize(e.group).includes(q));
  }, [items, query]);

  const byGroup = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of filtered) {
      const arr = map.get(e.group) ?? [];
      arr.push(e);
      map.set(e.group, arr);
    }
    return map;
  }, [filtered]);

  const orderedGroups = useMemo(() => {
    const preferred = (groupOrder ?? []).filter((g) => byGroup.has(g));
    const rest = [...byGroup.keys()].filter((g) => !preferred.includes(g));
    return [...preferred, ...rest];
  }, [byGroup, groupOrder]);

  const toggleGroup = (g: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Recherche */}
      <div className="shrink-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => onQueryChange("")} aria-label="Effacer">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {trailingSearchSlot}
        </div>
      </div>

      {/* Liste groupée (le contenu additionnel défile avec le reste) */}
      <div className="flex-1 overflow-y-auto pb-8">
        {beforeListSlot}

        {isLoading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && orderedGroups.length === 0 && emptyLabel && (
          <p className="mt-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        )}

        {orderedGroups.map((group) => {
          const exercises = byGroup.get(group) ?? [];
          const isCollapsed = collapsedGroups.has(group);
          const isHighlighted = highlightGroups?.has(group);

          return (
            <div key={group} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    isHighlighted ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {group}
                </span>
                <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {exercises.length}
                </span>
              </button>

              {!isCollapsed && (
                <ul className="space-y-0.5 pl-2">
                  {exercises.map((ex) => {
                    const rank = rankByName?.get(ex.name);
                    const photo = getPhoto?.(ex.name);
                    const menu = renderRowMenu?.(ex);
                    return (
                      <li key={ex.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onRowTap(ex)}
                          className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                        >
                          {rank ? (
                            <div className="relative aspect-[4/5] w-8 shrink-0 overflow-hidden rounded-md shadow-elevated">
                              <RankIllustration
                                rankKey={rank.rank.key}
                                label={rank.rank.label}
                                className="absolute inset-0 h-full w-full"
                              />
                            </div>
                          ) : photo ? (
                            <img
                              src={photo}
                              alt={ex.name}
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/5" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{ex.name}</span>
                            {rank && (
                              <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                                {gradeName(rank.rank.key, rank.levelInRank)}
                              </span>
                            )}
                          </span>
                        </button>
                        {menu}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
