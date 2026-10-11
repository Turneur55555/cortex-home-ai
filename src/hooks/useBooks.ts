import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { fetchAllRows } from "@/lib/supabase/pagedRead";
import { computeDownscaleDimensions } from "@/lib/wardrobe/imageProcessing";
import { sortBooks } from "@/lib/books/stats";
import { normalizeBookInput, validateBookInput } from "@/lib/books/validation";
import type { Book, BookInput } from "@/lib/books/types";

/**
 * Bibliothèque : `books` est offline-first (cf. src/lib/offline/), même pattern que
 * `use-supplements.ts`. Les photos de couverture perso (bucket privé `book-covers`)
 * sont online-only : hors ligne on retombe sur `cover_url` (Open Library) ou sur
 * un visuel de remplacement.
 */

export type BookWithCover = Book & { coverSrc: string | null };

export const booksRepo = createOfflineRepository<Book>("books");

const COVER_BUCKET = "book-covers";
const COVER_MAX_DIMENSION = 900;

async function listBooks(userId: string): Promise<Book[]> {
  if (getIsOnline()) {
    try {
      const rows = await fetchAllRows<Book>(
        () =>
          supabase
            .from("books")
            .select("*", { count: "exact" })
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .order("id"),
        { label: "books" },
      );
      await hydrateEntitiesFromServer("books", userId, rows);
    } catch {
      // Hors ligne ou erreur réseau : on continue avec le store local.
    }
  }
  return sortBooks(await booksRepo.list(userId));
}

async function signCovers(books: Book[]): Promise<BookWithCover[]> {
  const paths = books.map((b) => b.cover_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0 && getIsOnline()) {
    try {
      const { data } = await supabase.storage.from(COVER_BUCKET).createSignedUrls(paths, 60 * 60);
      for (const e of data ?? []) if (e.path && e.signedUrl) signed.set(e.path, e.signedUrl);
    } catch {
      // Hors ligne : on retombe sur cover_url.
    }
  }
  return books.map((b) => ({
    ...b,
    coverSrc: (b.cover_path ? signed.get(b.cover_path) : null) ?? b.cover_url ?? null,
  }));
}

export function useBooks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: ["books", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<BookWithCover[]> => {
      if (!userId) return [];
      return signCovers(await listBooks(userId));
    },
  });
}

export function useBook(id: string) {
  const { data, ...rest } = useBooks();
  return { ...rest, data: data?.find((b) => b.id === id) };
}

/** Réduit une photo avant upload (canvas) ; renvoie l'original si le navigateur ne sait pas. */
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = computeDownscaleDimensions(
      bitmap.width,
      bitmap.height,
      COVER_MAX_DIMENSION,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadBookCover(userId: string, file: File): Promise<string> {
  const blob = await shrinkImage(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

async function removeCover(path: string | null | undefined) {
  if (!path) return;
  try {
    await supabase.storage.from(COVER_BUCKET).remove([path]);
  } catch {
    // Orphelin sans conséquence : le bucket est privé et isolé par utilisateur.
  }
}

export function useCreateBook() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: BookInput) => {
      if (!user) throw new Error("Non authentifié");
      const err = validateBookInput(input);
      if (err) throw new Error(err);
      return booksRepo.create(
        user.id,
        normalizeBookInput(input) as Omit<Book, "id" | "user_id" | "created_at" | "updated_at">,
      );
    },
    onSuccess: () => {
      toast.success("Livre ajouté");
      qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      previousCoverPath,
    }: {
      id: string;
      input: BookInput;
      previousCoverPath?: string | null;
    }) => {
      if (!user) throw new Error("Non authentifié");
      const err = validateBookInput(input);
      if (err) throw new Error(err);
      const patch = normalizeBookInput(input);
      await booksRepo.update(id, user.id, patch as Partial<Book>);
      if (previousCoverPath && previousCoverPath !== patch.cover_path) {
        await removeCover(previousCoverPath);
      }
    },
    onSuccess: () => {
      toast.success("Livre mis à jour");
      qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (book: Pick<Book, "id" | "cover_path">) => {
      if (!user) throw new Error("Non authentifié");
      await booksRepo.remove(book.id, user.id);
      await removeCover(book.cover_path);
    },
    onSuccess: () => {
      toast.success("Livre supprimé");
      qc.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
