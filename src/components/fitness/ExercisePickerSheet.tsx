import { useEffect, useMemo, useRef, useState } from "react";
import { Book, Clock, Search, X } from "lucide-react";
import {
  CATALOG_GROUPS,
  EXERCISE_CATALOG,
  normalize,
  searchExercises,
} from "@/lib/fitness/exerciseCatalog";

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

export function ExercisePickerSheet({
  onSelect,
  onClose,
  recentExercises,
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so the sheet is visible before keyboard opens
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const normQuery = normalize(query);

  const filteredRecents = useMemo(() => {
    if (!normQuery) return recentExercises;
    return recentExercises.filter((e) => normalize(e.name).includes(normQuery));
  }, [recentExercises, normQuery]);

  const filteredCatalog = useMemo(
    () => searchExercises(query, EXERCISE_CATALOG),
    [query],
  );

  const catalogByGroup = useMemo(() => {
    const map = new Map<string, typeof EXERCISE_CATALOG>();
    for (const e of filteredCatalog) {
      const arr = map.get(e.group) ?? [];
      arr.push(e);
      map.set(e.group, arr);
    }
    return map;
  }, [filteredCatalog]);

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

        {/* Search bar */}
        <div className="shrink-0 px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Développé couché, squat…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
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
                <span className="block text-sm font-semibold">
                  Créer "{query.trim()}"
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Exercice personnalisé
                </span>
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
                            r.lastSets && r.lastReps
                              ? `${r.lastSets}×${r.lastReps}`
                              : null,
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

          {/* Catalog */}
          {filteredCatalog.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Book className="h-3 w-3" />
                {normQuery ? "Catalogue" : "Tous les exercices"}
              </div>
              {CATALOG_GROUPS.filter((g) => catalogByGroup.has(g)).map((group) => (
                <div key={group} className="mb-4">
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group}
                  </p>
                  <ul className="space-y-0.5">
                    {(catalogByGroup.get(group) ?? []).map((ex) => (
                      <li key={ex.name}>
                        <button
                          type="button"
                          onClick={() => pick(ex.name)}
                          className="w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                        >
                          {ex.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {normQuery && filteredRecents.length === 0 && filteredCatalog.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Aucun résultat — appuyez sur "Créer" pour ajouter un exercice.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
