import { useState } from "react";
import { ChevronRight, Loader2, PenLine, Search, X } from "lucide-react";
import { useBookSearch } from "@/hooks/useBookSearch";
import type { BookSearchResult } from "@/lib/books/types";
import { BookCover } from "./BookCover";
import { seriesLine, volumeBadge } from "./bookLabels";

/**
 * Étape 1 de l'ajout : recherche au fil de la frappe. Volontairement HORS de tout <form> (un submit
 * imbriqué remontait au formulaire de saisie et enregistrait un livre vide).
 */
export function BookSearchPanel({
  initialQuery = "",
  onPick,
  onManual,
}: {
  initialQuery?: string;
  onPick: (r: BookSearchResult) => void;
  onManual: (title: string) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const search = useBookSearch(q);
  const results = search.data ?? [];
  const busy = (search.isFetching || search.isTyping) && q.trim().length >= 2;

  return (
    <div>
      <h1 className="font-serif text-[28px] font-semibold italic leading-tight">Quel livre ?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Titre, auteur, saga ou ISBN.</p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          enterKeyHint="search"
          autoCapitalize="sentences"
          placeholder="The Primal Hunter, Dune, Harry Potter 3…"
          className="h-14 w-full rounded-2xl border border-white/10 bg-card/80 pl-12 pr-12 text-base outline-none backdrop-blur transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        {busy ? (
          <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          q && (
            <button
              type="button"
              aria-label="Effacer"
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      <div className="mt-4">
        {search.isError && (
          <p className="rounded-2xl border border-white/10 bg-card/60 p-4 text-sm text-muted-foreground">
            La recherche ne répond pas (hors ligne ?). Tu peux saisir le livre à la main.
          </p>
        )}

        {search.isPending && search.fetchStatus === "fetching" && results.length === 0 && (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex gap-3 rounded-2xl p-2">
                <div className="aspect-[2/3] w-14 animate-pulse rounded-md bg-white/5" />
                <div className="flex-1 space-y-2 pt-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {search.isSuccess && results.length === 0 && !search.isTyping && (
          <p className="px-1 text-sm text-muted-foreground">Aucun résultat pour « {q.trim()} ».</p>
        )}

        {results.length > 0 && (
          <ul className="space-y-1">
            {results.map((r) => {
              const line = seriesLine(r.series, r.volume);
              const meta = [r.author, r.year, r.pages ? `${r.pages} p.` : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={r.externalId}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                  >
                    <BookCover
                      src={r.coverUrl}
                      title={r.title}
                      author={r.author}
                      badge={volumeBadge(r.volume)}
                      className="w-14 shrink-0"
                      rounded="rounded-[4px]"
                    />
                    <span className="min-w-0 flex-1">
                      {line && (
                        <span className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                          {line}
                        </span>
                      )}
                      <span className="line-clamp-2 block font-serif text-[15px] font-semibold leading-snug">
                        {r.title}
                      </span>
                      {meta && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {meta}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onManual(q.trim())}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <PenLine className="h-4 w-4" />
        Saisir à la main
      </button>
    </div>
  );
}
