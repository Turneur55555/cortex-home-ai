import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Plus, Search } from "lucide-react";
import { useBooks } from "@/hooks/useBooks";
import { BOOK_STATUS_LABEL } from "@/lib/books/types";
import type { BookStatus } from "@/lib/books/types";
import { BookCard } from "@/components/books/BookCard";
import { BookEditor } from "@/components/books/BookEditor";
import { ReadingStats } from "@/components/books/ReadingStats";
import { RecommendationsPanel } from "@/components/books/RecommendationsPanel";
import { AppSheet } from "@/components/profile/AppSheet";

export const Route = createFileRoute("/_authenticated/livres/")({
  head: () => ({
    meta: [
      { title: "Bibliothèque — ICORTEX" },
      {
        name: "description",
        content: "Mes livres lus, en cours, à lire — et des idées de lecture.",
      },
    ],
  }),
  component: LivresPage,
});

type TabKey = BookStatus | "ideas";
const TABS: { key: TabKey; label: string }[] = [
  { key: "read", label: BOOK_STATUS_LABEL.read },
  { key: "reading", label: BOOK_STATUS_LABEL.reading },
  { key: "to_read", label: BOOK_STATUS_LABEL.to_read },
  { key: "ideas", label: "Idées" },
];

function LivresPage() {
  const { data: books = [], isLoading } = useBooks();
  const [tab, setTab] = useState<TabKey>("read");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(
    () => ({
      read: books.filter((b) => b.status === "read").length,
      reading: books.filter((b) => b.status === "reading").length,
      to_read: books.filter((b) => b.status === "to_read").length,
    }),
    [books],
  );

  const visible = useMemo(() => {
    if (tab === "ideas") return [];
    const q = query.trim().toLowerCase();
    return books.filter(
      (b) =>
        b.status === tab &&
        (!q || b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q)),
    );
  }, [books, tab, query]);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lecture
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Ma bibliothèque</h1>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card active:opacity-80"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Ajouter
          </button>
        </div>
      </header>

      <ReadingStats books={books} />

      <div className="-mx-5 mb-4 overflow-x-auto px-5">
        <div className="flex gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = t.key === "ideas" ? null : counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {t.label}
                {count != null && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "ideas" ? (
        <RecommendationsPanel books={books} />
      ) : (
        <>
          {books.length > 5 && (
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer par titre ou auteur"
                className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
          )}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-card" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <BookOpen className="h-8 w-8 text-primary/70" />
              <p className="text-sm text-muted-foreground">
                {query ? "Aucun livre ne correspond." : "Rien ici pour le moment."}
              </p>
              {!query && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary"
                >
                  Ajouter un livre
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {visible.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          )}
        </>
      )}

      <AppSheet open={adding} onOpenChange={setAdding} title="Ajouter un livre">
        <div className="max-h-[78vh] overflow-y-auto px-5 pb-4">
          <BookEditor
            defaultStatus={tab === "ideas" ? "read" : tab}
            onDone={() => setAdding(false)}
          />
        </div>
      </AppSheet>
    </main>
  );
}
