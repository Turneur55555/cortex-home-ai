import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadBookCover,
  useCreateBook,
  useUpdateBook,
  type BookWithCover,
} from "@/hooks/useBooks";
import type { Book, BookInput, BookSearchResult, BookStatus } from "@/lib/books/types";
import { BookBackdrop, BookCover } from "./BookCover";
import { BookSearchPanel } from "./BookSearchPanel";
import { StarRating } from "./StarRating";
import { StatusSegmented } from "./StatusSegmented";
import { seriesLine, volumeBadge } from "./bookLabels";

const today = () => new Date().toISOString().slice(0, 10);

const GENRES = [
  "Fantasy",
  "Science-fiction",
  "LitRPG",
  "Thriller",
  "Polar",
  "Roman",
  "Développement personnel",
  "Biographie",
  "Histoire",
  "Business",
  "BD & manga",
];

type Draft = {
  title: string;
  author: string;
  status: BookStatus;
  rating: number | null;
  started_on: string;
  finished_on: string;
  genre: string;
  pages: string;
  review: string;
  isbn: string;
  external_id: string;
  cover_url: string | null;
  cover_path: string | null;
  series: string;
  volume: string;
  description: string;
  published_year: string;
};

const str = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const num = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
};

function fromBook(b: Partial<Book> | undefined, status: BookStatus): Draft {
  return {
    title: b?.title ?? "",
    author: b?.author ?? "",
    status: b?.status ?? status,
    rating: b?.rating ?? null,
    started_on: b?.started_on ?? "",
    finished_on: b?.finished_on ?? "",
    genre: b?.genre ?? "",
    pages: str(b?.pages),
    review: b?.review ?? "",
    isbn: b?.isbn ?? "",
    external_id: b?.external_id ?? "",
    cover_url: b?.cover_url ?? null,
    cover_path: b?.cover_path ?? null,
    series: b?.series ?? "",
    volume: str(b?.volume),
    description: b?.description ?? "",
    published_year: str(b?.published_year),
  };
}

function fromResult(r: BookSearchResult, status: BookStatus): Draft {
  return {
    ...fromBook(undefined, status),
    title: r.title,
    author: r.author ?? "",
    pages: str(r.pages),
    isbn: r.isbn ?? "",
    external_id: r.externalId,
    cover_url: r.coverUrl,
    series: r.series ?? "",
    volume: str(r.volume),
    genre: r.genre ?? "",
    description: r.description ?? "",
    published_year: str(r.year),
  };
}

/** Ligne de réglage façon iOS : libellé à gauche, valeur éditable à droite. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-[52px] items-center gap-3 px-4">
      <span className="w-[5.5rem] shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </label>
  );
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Date lisible (« 21 mars 2026 ») au lieu du champ natif : sur iPhone un <input type="date"> vide
 * s'affiche comme une case vide. Le champ natif reste là, invisible, par-dessus : un tap ouvre
 * le sélecteur du système.
 */
function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex min-h-[52px] items-center gap-3 px-4">
      <span className="w-[5.5rem] shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 flex-1 truncate text-right text-[15px] ${
          value ? "" : "text-muted-foreground/50"
        }`}
      >
        {value ? fmtDate(value) : "Choisir"}
      </span>
      <input
        type="date"
        aria-label={label}
        value={value}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {value && (
        <button
          type="button"
          aria-label={`Effacer la date de ${label.toLowerCase()}`}
          onClick={() => onChange("")}
          className="relative z-10 -mr-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

const rowInput =
  "w-full min-w-0 appearance-none bg-transparent text-right text-[15px] outline-none placeholder:text-muted-foreground/40";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
      )}
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-card/70 backdrop-blur">
        {children}
      </div>
    </section>
  );
}

/**
 * Ajout (recherche → fiche) ou modification d'un livre, en pleine page.
 * `onSaved` reçoit l'id du livre enregistré.
 */
export function BookEditor({
  book,
  initialStatus = "read",
  initialQuery,
  onSaved,
  onDelete,
}: {
  book?: BookWithCover;
  initialStatus?: BookStatus;
  initialQuery?: string;
  onSaved: (id: string) => void;
  onDelete?: () => void;
}) {
  const { user } = useAuth();
  const create = useCreateBook();
  const update = useUpdateBook();
  const [step, setStep] = useState<"search" | "form">(book ? "form" : "search");
  const [draft, setDraft] = useState<Draft>(() => fromBook(book, initialStatus));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filePreview = useMemo(
    () => (coverFile ? URL.createObjectURL(coverFile) : null),
    [coverFile],
  );
  useEffect(() => () => void (filePreview && URL.revokeObjectURL(filePreview)), [filePreview]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const coverSrc =
    filePreview ??
    (draft.cover_path && draft.cover_path === book?.cover_path ? book.coverSrc : draft.cover_url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    try {
      let coverPath = draft.cover_path;
      if (coverFile) coverPath = await uploadBookCover(user.id, coverFile);
      const input: BookInput = {
        title: draft.title,
        author: draft.author,
        isbn: draft.isbn,
        status: draft.status,
        rating: draft.rating,
        started_on: draft.started_on || null,
        finished_on: draft.finished_on || (draft.status === "read" ? today() : null),
        genre: draft.genre,
        pages: num(draft.pages),
        review: draft.review,
        cover_url: draft.cover_url,
        cover_path: coverPath,
        external_id: draft.external_id,
        series: draft.series,
        volume: num(draft.volume),
        description: draft.description,
        published_year: num(draft.published_year),
      };
      if (book) {
        await update.mutateAsync({ id: book.id, input, previousCoverPath: book.cover_path });
        onSaved(book.id);
      } else {
        const created = await create.mutateAsync(input);
        onSaved(created.id);
      }
    } catch (err) {
      // Validation / écriture : le hook a déjà affiché son toast. L'upload, non.
      if (err instanceof Error && !create.isError && !update.isError) toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === "search") {
    return (
      <BookSearchPanel
        initialQuery={initialQuery}
        onPick={(r) => {
          setDraft(fromResult(r, draft.status));
          setStep("form");
        }}
        onManual={(title) => {
          setDraft((d) => ({ ...fromBook(undefined, d.status), title }));
          setStep("form");
        }}
      />
    );
  }

  const line = seriesLine(draft.series.trim() || null, num(draft.volume));

  return (
    <form onSubmit={submit} className="relative isolate">
      <BookBackdrop src={coverSrc} className="-mx-5 -mt-24" />

      {/* Héros : la couverture, comme posée sur une table. */}
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative w-36">
          <BookCover
            src={coverSrc}
            title={draft.title || "Sans titre"}
            author={draft.author}
            badge={volumeBadge(num(draft.volume))}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            aria-label={coverSrc ? "Changer la couverture" : "Ajouter une photo de couverture"}
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-background/80 text-foreground shadow-lg backdrop-blur-md active:scale-95"
          >
            <Camera className="h-5 w-5" />
          </button>
        </div>
        {line && (
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {line}
          </p>
        )}
        <p className={`${line ? "mt-1" : "mt-6"} font-serif text-2xl font-semibold leading-tight`}>
          {draft.title || "Nouveau livre"}
        </p>
        {draft.author && <p className="mt-1 text-sm text-muted-foreground">{draft.author}</p>}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {!book && (
            <button
              type="button"
              onClick={() => setStep("search")}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Changer de livre
            </button>
          )}
          {(coverFile || draft.cover_path || draft.cover_url) && (
            <button
              type="button"
              onClick={() => {
                setCoverFile(null);
                setDraft((d) => ({ ...d, cover_path: null, cover_url: null }));
              }}
              className="hover:text-foreground"
            >
              Retirer la couverture
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <StatusSegmented value={draft.status} onChange={(s) => set("status", s)} />

        <AnimatePresence initial={false}>
          {draft.status === "read" && (
            <motion.div
              key="rating"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <StarRating value={draft.rating} onChange={(v) => set("rating", v)} />
            </motion.div>
          )}
        </AnimatePresence>

        <Card title="Le livre">
          <Row label="Titre">
            <input
              required
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={300}
              placeholder="Titre"
              className={rowInput}
            />
          </Row>
          <Row label="Auteur">
            <input
              value={draft.author}
              onChange={(e) => set("author", e.target.value)}
              maxLength={300}
              placeholder="Auteur"
              className={rowInput}
            />
          </Row>
          <Row label="Saga">
            <input
              value={draft.series}
              onChange={(e) => set("series", e.target.value)}
              maxLength={300}
              placeholder="Aucune"
              className={rowInput}
            />
          </Row>
          <Row label="Tome">
            <input
              value={draft.volume}
              onChange={(e) => set("volume", e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
              inputMode="decimal"
              placeholder="—"
              className={rowInput}
            />
          </Row>
          <Row label="Pages">
            <input
              value={draft.pages}
              onChange={(e) => set("pages", e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="—"
              className={rowInput}
            />
          </Row>
          <Row label="Parution">
            <input
              value={draft.published_year}
              onChange={(e) => set("published_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="Année"
              className={rowInput}
            />
          </Row>
        </Card>

        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Genre
          </h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {[
              ...new Set([
                ...(draft.genre && !GENRES.includes(draft.genre) ? [draft.genre] : []),
                ...GENRES,
              ]),
            ].map((g) => {
              const active = draft.genre === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => set("genre", active ? "" : g)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-white/10 bg-card/60 text-muted-foreground"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </section>

        {draft.status !== "to_read" && (
          <Card title="Lecture">
            <DateRow
              label="Début"
              value={draft.started_on}
              onChange={(v) => set("started_on", v)}
            />
            {draft.status === "read" && (
              <DateRow
                label="Fin"
                value={draft.finished_on}
                onChange={(v) => set("finished_on", v)}
              />
            )}
          </Card>
        )}

        <Card title="Mon avis">
          <textarea
            value={draft.review}
            onChange={(e) => set("review", e.target.value)}
            maxLength={5000}
            rows={4}
            placeholder="Ce que j'en retiens, une citation, un moment marquant…"
            className="block w-full resize-none bg-transparent p-4 font-serif text-[15px] italic leading-relaxed outline-none placeholder:not-italic placeholder:font-sans placeholder:text-muted-foreground/50"
          />
        </Card>

        {draft.description && (
          <Card title="Résumé">
            <div className="p-4">
              <p
                className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${
                  showSummary ? "" : "line-clamp-4"
                }`}
              >
                {draft.description}
              </p>
              {draft.description.length > 220 && (
                <button
                  type="button"
                  onClick={() => setShowSummary((v) => !v)}
                  className="mt-2 text-xs font-semibold text-primary"
                >
                  {showSummary ? "Réduire" : "Lire la suite"}
                </button>
              )}
            </div>
          </Card>
        )}

        <button
          type="submit"
          disabled={busy || !draft.title.trim()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)] transition-opacity active:opacity-85 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {book ? "Enregistrer" : "Ajouter à ma bibliothèque"}
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mx-auto flex items-center gap-2 py-2 text-sm font-medium text-destructive/90"
          >
            <Trash2 className="h-4 w-4" /> Supprimer ce livre
          </button>
        )}
      </div>
    </form>
  );
}
