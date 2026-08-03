import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Catégories affichées dans l'UI du Dressing (aucun impact DB). */
export const WARDROBE_FILTERS = [
  { key: "all", label: "Tous" },
  { key: "tops", label: "Hauts" },
  { key: "bottoms", label: "Bas" },
  { key: "outerwear", label: "Vestes" },
  { key: "shoes", label: "Chaussures" },
  { key: "accessories", label: "Accessoires" },
] as const;

export type WardrobeFilterKey = (typeof WARDROBE_FILTERS)[number]["key"];
export type WardrobeCategory = Exclude<WardrobeFilterKey, "all"> | "other";

export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface WardrobeItemView extends WardrobeItem {
  /** Catégorie normalisée pour les filtres UI. */
  uiCategory: WardrobeCategory;
  /** URL signée du bucket privé `wardrobe` (jamais publique). */
  imageUrl: string | null;
}

const CATEGORY_RULES: Array<{ category: WardrobeCategory; tokens: string[] }> = [
  {
    category: "tops",
    tokens: [
      "haut",
      "top",
      "tshirt",
      "t-shirt",
      "tee",
      "chemise",
      "pull",
      "sweat",
      "hoodie",
      "debardeur",
      "polo",
    ],
  },
  {
    category: "bottoms",
    tokens: ["bas", "bottom", "pantalon", "jean", "short", "jogging", "jupe", "legging"],
  },
  {
    category: "outerwear",
    tokens: ["veste", "outer", "jacket", "manteau", "blouson", "parka", "coat"],
  },
  {
    category: "shoes",
    tokens: ["chaussure", "shoe", "sneaker", "basket", "botte", "boot"],
  },
  {
    category: "accessories",
    tokens: [
      "accessoire",
      "accessor",
      "casquette",
      "bonnet",
      "ceinture",
      "montre",
      "sac",
      "echarpe",
      "cap",
      "bag",
    ],
  },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function toUiCategory(raw: string | null | undefined): WardrobeCategory {
  if (!raw) return "other";
  const value = normalize(raw);
  for (const rule of CATEGORY_RULES) {
    if (rule.tokens.some((token) => value.includes(token))) return rule.category;
  }
  return "other";
}

export type WardrobeAddCategoryKey = Exclude<WardrobeFilterKey, "all">;

/** Valeurs réelles acceptées par la contrainte `wardrobe_items.category` en base. */
export const WARDROBE_DB_CATEGORY: Record<WardrobeAddCategoryKey, string> = {
  tops: "top",
  bottoms: "bottom",
  outerwear: "outerwear",
  shoes: "shoes",
  accessories: "accessory",
};

/** Options affichées dans le formulaire d'ajout (label FR + valeur DB associée). */
export const WARDROBE_ADD_CATEGORIES: Array<{
  key: WardrobeAddCategoryKey;
  label: string;
  dbCategory: string;
}> = [
  { key: "tops", label: "Haut", dbCategory: WARDROBE_DB_CATEGORY.tops },
  { key: "bottoms", label: "Bas", dbCategory: WARDROBE_DB_CATEGORY.bottoms },
  { key: "outerwear", label: "Veste", dbCategory: WARDROBE_DB_CATEGORY.outerwear },
  { key: "shoes", label: "Chaussures", dbCategory: WARDROBE_DB_CATEGORY.shoes },
  { key: "accessories", label: "Accessoire", dbCategory: WARDROBE_DB_CATEGORY.accessories },
];

/** Formats acceptés par le bucket Storage privé `wardrobe` (cf. migration backfill). */
export const WARDROBE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Taille max acceptée par le bucket Storage privé `wardrobe` (10 Mo). */
export const WARDROBE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function extensionForMimeType(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? "jpg";
}

export function validateWardrobePhotoFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  if (
    !WARDROBE_ALLOWED_MIME_TYPES.includes(file.type as (typeof WARDROBE_ALLOWED_MIME_TYPES)[number])
  ) {
    return {
      ok: false,
      message: "Format non supporté. Utilise une photo JPEG, PNG, WebP ou HEIC.",
    };
  }
  if (file.size > WARDROBE_MAX_FILE_SIZE_BYTES) {
    return { ok: false, message: "Photo trop volumineuse (max 10 Mo)." };
  }
  return { ok: true };
}

export interface CreateWardrobeItemInput {
  file: File;
  category: WardrobeAddCategoryKey;
  name?: string;
  brand?: string;
  primaryColor?: string;
}

export function useCreateWardrobeItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWardrobeItemInput) => {
      const validation = validateWardrobePhotoFile(input.file);
      if (!validation.ok) throw new Error(validation.message);

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Non authentifié.");

      const itemId = crypto.randomUUID();
      const extension = extensionForMimeType(input.file.type);
      const storagePath = `${authUser.id}/${itemId}/original.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("wardrobe")
        .upload(storagePath, input.file, {
          contentType: input.file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("wardrobe_items").insert({
        id: itemId,
        user_id: authUser.id,
        storage_path: storagePath,
        category: WARDROBE_DB_CATEGORY[input.category],
        name: input.name?.trim() || null,
        brand: input.brand?.trim() || null,
        primary_color: input.primaryColor?.trim() || null,
      });

      if (insertError) {
        await supabase.storage.from("wardrobe").remove([storagePath]);
        throw insertError;
      }

      return itemId;
    },
    onSuccess: () => {
      toast.success("Pièce ajoutée à ton dressing.");
      void queryClient.invalidateQueries({ queryKey: ["wardrobe-items", user?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Impossible d'ajouter cette pièce.");
    },
  });
}

export function useWardrobeItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wardrobe-items", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<WardrobeItemView[]> => {
      const { data, error } = await supabase
        .from("wardrobe_items")
        .select("id, user_id, name, brand, category, subcategory, storage_path, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const items = data ?? [];
      const paths = items.map((item) => item.storage_path).filter((path): path is string => !!path);

      const signedByPath = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("wardrobe")
          .createSignedUrls(paths, 60 * 60);
        for (const entry of signed ?? []) {
          if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
        }
      }

      return items.map((item) => ({
        ...item,
        uiCategory: toUiCategory(item.category ?? item.subcategory),
        imageUrl: item.storage_path ? (signedByPath.get(item.storage_path) ?? null) : null,
      }));
    },
  });
}
