import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadBookCover,
  useCreateBook,
  useUpdateBook,
  type BookWithCover,
} from "@/hooks/useBooks";
import { BOOK_STATUSES, BOOK_STATUS_LABEL } from "@/lib/books/types";
import type { BookInput, BookSearchResult, BookStatus } from "@/lib/books/types";
import { BookCover } from "./BookCover";
import { BookSearch } from "./BookSearch";

const today = () => new Date().toISOString().slice(0, 10);

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
};

function toDraft(b?: Partial<BookInput>, defaultStatus: BookStatus = "read"): Draft {
  return {
    title: b?.title ?? "",
    author: b?.author ?? "",
    status: b?.status ?? defaultStatus,
    rating: b?.rating ?? null,
    started_on: b?.started_on ?? "",
    finished_on: b?.finished_on ?? "",
    genre: b?.genre ?? "",
    pages: b?.pages ? String(b.pages) : "",
    review: b?.review ?? "",
    isbn: b?.isbn ?? "",
    external_id: b?.external_id ?? "",
    cover_url: b?.cover_url ?? null,
    cover_path: b?.cover_path ?? null,
  };
}

const field =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary/50";

/** Création ou édition d'un livre. Création : recherche Open Library d'abord, saisie manuelle possible. */
export function BookEditor({
  book,
  defaultStatus,
  onDone,
}: {
  book?: BookWithCover;
  defaultStatus?: BookStatus;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const create = useCreateBook();
  const update = useUpdateBook();
  const [draft, setDraft] = useState<Draft>(() => toDraft(book, defaultStatus));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filePreview = useMemo(
    () => (coverFile ? URL.createObjectURL(coverFile) : null),
    [coverFile],
  );
  useEffect(() => () => void (filePreview && URL.revokeObjectURL(filePreview)), [filePreview]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const pick = (r: BookSearchResult) =>
    setDraft((d) => ({
      ...d,
      title: r.title,
      author: r.author ?? "",
      pages: r.pages ? String(r.pages) : d.pages,
      isbn: r.isbn ?? "",
      external_id: r.externalId,
      cover_url: r.coverUrl,
    }));

  const previewSrc = filePreview ?? (draft.cover_path ? (book?.coverSrc ?? null) : draft.cover_url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
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
        pages: draft.pages ? Number(draft.pages) : null,
        review: draft.review,
        cover_url: draft.cover_url,
        cover_path: coverPath,
        external_id: draft.external_id,
      };
      if (book) {
        await update.mutateAsync({ id: book.id, input, previousCoverPath: book.cover_path });
      } else {
        await create.mutateAsync(input);
      }
      onDone();
    } catch (err) {
      // Les erreurs de validation/écriture ont déjà leur toast ; l'upload non.
      if (err instanceof Error && !create.isError && !update.isError) toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {!book && <BookSearch onPick={pick} />}

      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0">
          <BookCover src={previewSrc} title={draft.title || "Couverture"} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium"
          >
            <Camera className="h-4 w-4" />
            {previewSrc ? "Changer la photo" : "Ajouter une photo"}
          </button>
          {(coverFile || draft.cover_path || draft.cover_url) && (
            <button
              type="button"
              onClick={() => {
                setCoverFile(null);
                setDraft((d) => ({ ...d, cover_path: null, cover_url: null }));
              }}
              className="flex items-center justify-center gap-1 text-xs text-muted-foreground"
            >
              <X className="h-3 w-3" /> Retirer la couverture
            </button>
          )}
        </div>
      </div>

      <input
        required
        value={draft.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Titre"
        maxLength={300}
        className={field}
      />
      <input
        value={draft.author}
        onChange={(e) => set("author", e.target.value)}
        placeholder="Auteur"
        maxLength={300}
        className={field}
      />

      <div className="grid grid-cols-3 gap-2">
        {BOOK_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set("status", s)}
            className={`h-10 rounded-xl border text-xs font-semibold transition-colors ${
              draft.status === s
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {BOOK_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {draft.status === "read" && (
        <div className="flex items-center justify-center gap-1" aria-label="Note">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} sur 5`}
              onClick={() => set("rating", draft.rating === n ? null : n)}
              className="p-1.5"
            >
              <Star
                className={`h-7 w-7 ${
                  draft.rating != null && n <= draft.rating
                    ? "fill-primary text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      {draft.status !== "to_read" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            Début
            <input
              type="date"
              value={draft.started_on}
              onChange={(e) => set("started_on", e.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          {draft.status === "read" && (
            <label className="text-[11px] text-muted-foreground">
              Fin
              <input
                type="date"
                value={draft.finished_on}
                onChange={(e) => set("finished_on", e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.genre}
          onChange={(e) => set("genre", e.target.value)}
          placeholder="Genre (roman, SF…)"
          maxLength={100}
          className={field}
        />
        <input
          value={draft.pages}
          onChange={(e) => set("pages", e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Pages"
          inputMode="numeric"
          className={field}
        />
      </div>

      <textarea
        value={draft.review}
        onChange={(e) => set("review", e.target.value)}
        placeholder="Mon avis, mes citations…"
        maxLength={5000}
        rows={4}
        className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary/50"
      />

      <button
        type="submit"
        disabled={busy || !draft.title.trim()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {book ? "Enregistrer" : "Ajouter à ma bibliothèque"}
      </button>
    </form>
  );
}
