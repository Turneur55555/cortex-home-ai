import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useBookSearch } from "@/hooks/useBookSearch";
import type { BookSearchResult } from "@/lib/books/types";
import { BookCover } from "./BookCover";

/** Recherche Open Library : titre, auteur ou ISBN. Un résultat pré-remplit la fiche (couverture comprise). */
export function BookSearch({ onPick }: { onPick: (r: BookSearchResult) => void }) {
  const [q, setQ] = useState("");
  const search = useBookSearch();

  // Pas de <form> ici : BookSearch vit DANS le formulaire de BookEditor, et un submit imbriqué
  // remonte (React) au formulaire parent — la recherche déclenchait alors l'enregistrement du livre.
  const run = () => search.mutate(q);

  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (q.trim().length >= 2 && !search.isPending) run();
            }
          }}
          placeholder="Chercher un titre, un auteur, un ISBN…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
          enterKeyHint="search"
        />
        <button
          type="button"
          onClick={run}
          disabled={search.isPending || q.trim().length < 2}
          aria-label="Rechercher"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          {search.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
      </div>
      {search.isError && (
        <p className="mt-2 text-xs text-destructive">
          Recherche indisponible (hors ligne ?). Tu peux saisir le livre à la main ci-dessous.
        </p>
      )}
      {search.data && search.data.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Aucun résultat. Saisis-le à la main.</p>
      )}
      {search.data && search.data.length > 0 && (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {search.data.map((r) => (
            <li key={r.externalId}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition-colors hover:border-primary/40"
              >
                <BookCover src={r.coverUrl} title={r.title} className="w-10 shrink-0 rounded-md" />
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-sm font-semibold leading-tight">
                    {r.title}
                  </span>
                  <span className="line-clamp-1 block text-xs text-muted-foreground">
                    {[r.author, r.year].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
