import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Json } from "@/integrations/supabase/types";

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
  /** Métadonnées Phase 4 (Cortex Vision) — toujours facultatives, jamais requises. */
  subcategory?: string | null;
  secondaryColors?: string[];
  pattern?: string | null;
  material?: string | null;
  fit?: string | null;
  formality?: string | null;
  seasons?: string[];
  aiDescription?: string | null;
  /** Réponse brute validée de l'analyse IA, conservée à titre de métadonnée
   *  — jamais utilisée comme vérité fonctionnelle : ce sont les valeurs
   *  ci-dessus (potentiellement corrigées par l'utilisateur) qui font foi. */
  aiMetadata?: Json | null;
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
        subcategory: input.subcategory ?? null,
        secondary_colors: input.secondaryColors ?? [],
        pattern: input.pattern ?? null,
        material: input.material ?? null,
        fit: input.fit ?? null,
        formality: input.formality ?? null,
        seasons: input.seasons ?? [],
        ai_description: input.aiDescription ?? null,
        ai_metadata: input.aiMetadata ?? {},
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

// ─── Phase 4 — Analyse Cortex Vision (assistée, jamais obligatoire) ─────────

/** Sous-ensemble de WardrobeAddCategoryKey correspondant aux valeurs DB retournées par l'IA. */
const DB_TO_UI_CATEGORY: Record<string, WardrobeAddCategoryKey> = {
  top: "tops",
  bottom: "bottoms",
  outerwear: "outerwear",
  shoes: "shoes",
  accessory: "accessories",
};

export interface WardrobeAnalysisResult {
  category: string;
  category_confidence: number;
  subcategory: string | null;
  subcategory_confidence: number;
  primary_color: string | null;
  primary_color_confidence: number;
  secondary_colors: string[];
  pattern: string | null;
  pattern_confidence: number;
  material: string | null;
  material_confidence: number;
  fit: string | null;
  fit_confidence: number;
  formality: string | null;
  formality_confidence: number;
  seasons: string[];
  description: string;
}

/** Seuils de confiance (cf. Phase 4 §6) — jamais de préremplissage agressif sur une valeur incertaine. */
export const WARDROBE_CONFIDENCE_HIGH = 0.75;
export const WARDROBE_CONFIDENCE_MEDIUM = 0.4;

export interface WardrobePrefillField<T> {
  value: T | null;
  /** true si la valeur vient de Cortex avec une confiance seulement moyenne — à signaler discrètement. */
  suggested: boolean;
}

export interface WardrobePrefill {
  category: WardrobePrefillField<WardrobeAddCategoryKey>;
  name: WardrobePrefillField<string>;
  primaryColor: WardrobePrefillField<string>;
  description: string | null;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Applique le seuillage de confiance à une analyse Cortex Vision validée pour
 * en tirer une proposition de préremplissage du formulaire d'ajout.
 * - confiance haute → préremplit normalement
 * - confiance moyenne → préremplit mais marqué `suggested` (affichage discret)
 * - confiance faible → laissé vide (`value: null`)
 * Ne préremplit jamais `category` avec une valeur hors des clés UI connues.
 */
export function buildWardrobePrefill(analysis: WardrobeAnalysisResult): WardrobePrefill {
  const field = <T>(value: T | null | undefined, confidence: number): WardrobePrefillField<T> => {
    if (!value || confidence < WARDROBE_CONFIDENCE_MEDIUM) return { value: null, suggested: false };
    return { value, suggested: confidence < WARDROBE_CONFIDENCE_HIGH };
  };

  const uiCategory = DB_TO_UI_CATEGORY[analysis.category];
  const categoryField = field(uiCategory, analysis.category_confidence);
  const colorField = field(
    analysis.primary_color ? analysis.primary_color.toLowerCase() : null,
    analysis.primary_color_confidence,
  );
  const subcategoryField = field(analysis.subcategory, analysis.subcategory_confidence);

  const nameSuggestion =
    subcategoryField.value && colorField.value
      ? capitalize(`${subcategoryField.value} ${colorField.value}`)
      : subcategoryField.value
        ? capitalize(subcategoryField.value)
        : null;

  return {
    category: categoryField,
    name: nameSuggestion
      ? { value: nameSuggestion, suggested: subcategoryField.suggested || colorField.suggested }
      : { value: null, suggested: false },
    primaryColor: colorField,
    description: analysis.description?.trim() || null,
  };
}

/**
 * Extrait et valide côté client la réponse de l'Edge Function d'analyse.
 * Lève une erreur explicite (jamais de crash silencieux) si le backend a
 * renvoyé une erreur métier ou une charge utile invalide/incomplète — dans
 * ce cas, l'appelant bascule sur le fallback manuel (cf. useAnalyzeWardrobePhoto).
 */
export function parseWardrobeAnalysisResponse(
  data: unknown,
  invokeError?: { message?: string } | null,
): WardrobeAnalysisResult {
  if (invokeError) throw new Error(invokeError.message || "Analyse impossible.");
  const payload = data as
    | { error?: string; analysis?: Partial<WardrobeAnalysisResult> }
    | null
    | undefined;
  if (payload?.error) throw new Error(payload.error);
  const analysis = payload?.analysis;
  if (
    !analysis ||
    typeof analysis.category !== "string" ||
    typeof analysis.description !== "string"
  ) {
    throw new Error("Analyse impossible.");
  }
  return analysis as WardrobeAnalysisResult;
}

export function useAnalyzeWardrobePhoto() {
  return useMutation({
    mutationFn: async (input: {
      base64: string;
      mime: string;
    }): Promise<WardrobeAnalysisResult> => {
      const { data, error } = await supabase.functions.invoke("analyze-wardrobe-item", {
        body: { image_base64: input.base64, mime_type: input.mime },
      });
      return parseWardrobeAnalysisResponse(data, error);
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
