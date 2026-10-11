import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useBookRecommendations } from "@/hooks/useBookRecommendations";
import { useCreateBook, type BookWithCover } from "@/hooks/useBooks";
import { BookCover } from "./BookCover";

/** Idées de lecture générées à partir des livres lus et notés. Un tap = ajout à « À lire ». */
export function RecommendationsPanel({ books }: { books: readonly BookWithCover[] }) {
  const reco = useBookRecommendations();
  const create = useCreateBook();
  const [wish, setWish] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const readCount = books.filter((b) => b.status === "read").length;

  return (
    <section>
      <p className="mb-3 text-xs text-muted-foreground">
        {readCount === 0
          ? "Ajoute quelques livres lus (avec une note) pour des idées vraiment personnalisées."
          : "Des idées basées sur tes livres lus et leurs notes."}
      </p>
      <div className="mb-4 flex gap-2">
        <input
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          maxLength={300}
          placeholder="Une envie ? (polar, histoire, court…)"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="button"
          disabled={reco.isPending}
          onClick={() => {
            setAdded(new Set());
            reco.mutate(
              { books, wish },
              { onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur") },
            );
          }}
          className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {reco.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Idées
        </button>
      </div>

      {reco.data && reco.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Rien de nouveau trouvé. Réessaie.</p>
      )}
      <ul className="space-y-3">
        {reco.data?.map((s) => {
          const key = `${s.title}|${s.author}`;
          const done = added.has(key);
          return (
            <li
              key={key}
              className="flex gap-3 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-3 shadow-card"
            >
              <BookCover src={s.coverUrl} title={s.title} className="w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.author}</p>
                <p className="mt-1 text-xs">{s.why}</p>
                <button
                  type="button"
                  disabled={done || create.isPending}
                  onClick={() =>
                    create.mutate(
                      {
                        title: s.title,
                        author: s.author,
                        status: "to_read",
                        pages: s.pages,
                        cover_url: s.coverUrl,
                      },
                      { onSuccess: () => setAdded((a) => new Set(a).add(key)) },
                    )
                  }
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  {done ? "Ajouté à « À lire »" : "À lire"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
