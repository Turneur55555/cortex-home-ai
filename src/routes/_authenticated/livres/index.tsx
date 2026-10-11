import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Plus, Search } from "lucide-react";
import { useBooks } from "@/hooks/useBooks";
import { groupBySeries } from "@/lib/books/series";
import { BOOK_STATUS_LABEL } from "@/lib/books/types";
import type { BookStatus } from "@/lib/books/types";
import { BookCard } from "@/components/books/BookCard";
import { NowReading } from "@/components/books/NowReading";
import { ReadingStats } from "@/components/books/ReadingStats";
import { RecommendationsPanel } from "@/components/books/RecommendationsPanel";

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

  const counts = useMemo(
    () => ({
      read: books.filter((b) => b.status === "read").length,
      reading: books.filter((b) => b.status === "reading").length,
      to_read: books.filter((b) => b.status === "to_read").length,
    }),
    [books],
  );
  const reading = useMemo(() => books.filter((b) => b.status === "reading"), [books]);

  const grouped = useMemo(() => {
    if (tab === "ideas") return { series: [], standalone: [] };
    const q = query.trim().toLowerCase();
    const visible = books.filter(
      (b) =>
        b.status === tab &&
        (!q ||
          b.title.toLowerCase().includes(q) ||
          (b.author ?? "").toLowerCase().includes(q) ||
          (b.series ?? "").toLowerCase().includes(q)),
    );
    return groupBySeries(visible);
  }, [books, tab, query]);

  const empty = grouped.series.length === 0 && grouped.standalone.length === 0;

  return (
    <main className="relative isolate flex flex-1 flex-col px-5 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_50%_0%,var(--primary-glow-soft),transparent_70%)]"
      />
      <header className="mb-6">
        <Link
          to="/profil"
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lecture
            </p>
            <h1 className="mt-1 font-serif text-[30px] font-semibold italic leading-none">
              Ma bibliothèque
            </h1>
          </div>
          <Link
            to="/livres/ajouter"
            search={{ statut: tab === "ideas" ? undefined : tab }}
            aria-label="Ajouter un livre"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)] active:scale-95"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      <NowReading books={reading} />
      <ReadingStats books={books} />

      <div className="-mx-5 mb-5 overflow-x-auto px-5 [scrollbar-width:none]">
        <div className="flex gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = t.key === "ideas" ? null : counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/10 bg-card/60 text-muted-foreground"
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
          {books.length > 8 && (
            <div className="relative mb-5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Titre, auteur ou saga"
                className="h-11 w-full rounded-xl border border-white/10 bg-card/60 pl-10 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-[6px] bg-white/5" />
              ))}
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/15 px-6 py-14 text-center">
              <BookOpen className="h-8 w-8 text-primary/70" />
              <p className="font-serif text-lg italic">
                {query ? "Aucun livre ne correspond." : "Une étagère à remplir."}
              </p>
              {!query && (
                <Link
                  to="/livres/ajouter"
                  search={{ statut: tab }}
                  className="mt-1 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Ajouter un livre
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.series.map((s) => (
                <section key={s.name}>
                  <div className="mb-3 flex items-baseline justify-between px-0.5">
                    <h2 className="truncate font-serif text-lg font-semibold italic">{s.name}</h2>
                    <span className="shrink-0 pl-3 text-xs text-muted-foreground">
                      {s.books.length} tomes
                    </span>
                  </div>
                  <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                    {s.books.map((b) => (
                      <BookCard key={b.id} book={b} className="w-[6.5rem] shrink-0" />
                    ))}
                  </div>
                </section>
              ))}
              {grouped.standalone.length > 0 && (
                <section>
                  {grouped.series.length > 0 && (
                    <h2 className="mb-3 px-0.5 font-serif text-lg font-semibold italic">
                      Autres livres
                    </h2>
                  )}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                    {grouped.standalone.map((b) => (
                      <BookCard key={b.id} book={b} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
