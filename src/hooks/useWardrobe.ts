import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { useAuth } from "@/hooks/use-auth";
import type { Json } from "@/integrations/supabase/types";
import {
  WARDROBE_DB_CATEGORY_BY_UI,
  WARDROBE_FIT_OPTIONS,
  WARDROBE_PATTERN_OPTIONS,
  WARDROBE_UI_CATEGORY_BY_DB,
  WARDROBE_USAGE_OPTIONS,
  findSubcategory,
  type WardrobeFit,
  type WardrobePattern,
  type WardrobeSleeveLength,
  type WardrobeUsage,
} from "@/lib/wardrobe/taxonomy";
import { pickDisplayStoragePath } from "@/lib/wardrobe/imageProcessing";

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
  /** Version détourée/normalisée (Phase 5) — null si non générée/échouée. */
  processed_storage_path: string | null;
  created_at: string;
}

export interface WardrobeItemView extends WardrobeItem {
  /** Catégorie normalisée pour les filtres UI. */
  uiCategory: WardrobeCategory;
  /** URL signée de l'image affichée dans la grille : détourée si
   *  disponible, sinon l'original (fallback automatique, cf. Phase 5 §7). */
  imageUrl: string | null;
  /** URL signée de l'original — toujours conservée, jamais remplacée. */
  originalImageUrl: string | null;
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

/** Valeurs réelles acceptées par la contrainte `wardrobe_items.category` en base.
 *  Source de vérité : src/lib/wardrobe/taxonomy.ts. */
export const WARDROBE_DB_CATEGORY: Record<WardrobeAddCategoryKey, string> =
  WARDROBE_DB_CATEGORY_BY_UI;

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
  /** Taille — jamais proposée par Cortex Vision, toujours saisie par l'utilisateur. */
  size?: string;
  /** Métadonnées Phase 4 (Cortex Vision) — toujours facultatives, jamais requises. */
  subcategory?: string | null;
  secondaryColors?: string[];
  pattern?: string | null;
  material?: string | null;
  fit?: string | null;
  formality?: string | null;
  seasons?: string[];
  sleeveLength?: string | null;
  usage?: string[];
  aiDescription?: string | null;
  /** Réponse brute validée de l'analyse IA, conservée à titre de métadonnée
   *  — jamais utilisée comme vérité fonctionnelle : ce sont les valeurs
   *  ci-dessus (potentiellement corrigées par l'utilisateur) qui font foi. */
  aiMetadata?: Json | null;
  /** Version détourée/normalisée (Phase 5), déjà générée côté client.
   *  Facultative : son upload ne bloque jamais la création de la pièce
   *  (cf. §2 — si le détourage échoue ou n'est pas fourni, seul l'original
   *  est conservé, ce qui reste un ajout parfaitement valide). */
  processedFile?: Blob | null;
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

      // Détourage/normalisation (Phase 5) : upload additif, jamais bloquant.
      // L'original ci-dessus est toujours conservé tel quel, que ce second
      // upload réussisse ou non (cf. §1/§2).
      let processedStoragePath: string | null = null;
      if (input.processedFile) {
        const processedPath = `${authUser.id}/${itemId}/processed.webp`;
        const { error: processedUploadError } = await supabase.storage
          .from("wardrobe")
          .upload(processedPath, input.processedFile, {
            contentType: "image/webp",
            upsert: false,
          });
        if (!processedUploadError) {
          processedStoragePath = processedPath;
        } else {
          console.error(
            "[wardrobe] upload image détourée échoué, original conservé :",
            processedUploadError,
          );
        }
      }

      const { error: insertError } = await db.from("wardrobe_items").insert({
        id: itemId,
        user_id: authUser.id,
        storage_path: storagePath,
        processed_storage_path: processedStoragePath,
        category: WARDROBE_DB_CATEGORY[input.category],
        name: input.name?.trim() || null,
        brand: input.brand?.trim() || null,
        primary_color: input.primaryColor?.trim() || null,
        size: input.size?.trim() || null,
        subcategory: input.subcategory ?? null,
        secondary_colors: input.secondaryColors ?? [],
        pattern: input.pattern ?? null,
        material: input.material ?? null,
        fit: input.fit ?? null,
        formality: input.formality ?? null,
        seasons: input.seasons ?? [],
        sleeve_length: input.sleeveLength ?? null,
        usage: input.usage ?? [],
        ai_description: input.aiDescription ?? null,
        ai_metadata: input.aiMetadata ?? {},
      });

      if (insertError) {
        const pathsToClean = [storagePath, ...(processedStoragePath ? [processedStoragePath] : [])];
        await supabase.storage.from("wardrobe").remove(pathsToClean);
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
  sleeve_length: string | null;
  sleeve_length_confidence: number;
  usage: string[];
  usage_confidence: number;
  description: string;
}

/**
 * Vocabulaire couleur canonique — partagé entre `primary_color` et la
 * détection dans `description`, entrées multi-mots en premier pour que la
 * recherche par sous-chaîne matche la variante la plus spécifique
 * (ex: "gris foncé" avant "gris").
 */
const COLOR_ENUM = [
  "gris foncé",
  "gris clair",
  "bleu marine",
  "bleu clair",
  "noir",
  "blanc",
  "gris",
  "bleu",
  "beige",
  "marron",
  "vert",
  "rouge",
  "jaune",
  "orange",
  "rose",
  "violet",
  "bordeaux",
] as const;

/**
 * Corrige l'incohérence observée en test réel : l'IA peut renvoyer un
 * `description` textuel ("Short gris foncé uni.") qui ne correspond pas au
 * champ structuré `primary_color` ("noir") — les deux sont générés dans le
 * même appel mais rien ne garantit leur cohérence lexicale. On fait
 * confiance à la couleur explicitement mentionnée dans la description
 * (c'est elle que l'utilisateur lit) et on baisse la confiance associée
 * puisqu'une correction a été nécessaire.
 */
export function reconcileWardrobeColor(analysis: WardrobeAnalysisResult): WardrobeAnalysisResult {
  if (!analysis.description) return analysis;
  const normalizedDescription = normalize(analysis.description);
  const mentioned = COLOR_ENUM.find((c) => normalizedDescription.includes(normalize(c)));
  if (!mentioned) return analysis;

  const currentColor = analysis.primary_color ? normalize(analysis.primary_color) : null;
  if (currentColor === normalize(mentioned)) return analysis;

  return {
    ...analysis,
    primary_color: mentioned,
    primary_color_confidence: Math.min(analysis.primary_color_confidence, 0.6),
  };
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
  subcategory: WardrobePrefillField<string>;
  name: WardrobePrefillField<string>;
  primaryColor: WardrobePrefillField<string>;
  sleeveLength: WardrobePrefillField<WardrobeSleeveLength>;
  fit: WardrobePrefillField<WardrobeFit>;
  material: WardrobePrefillField<string>;
  pattern: WardrobePrefillField<WardrobePattern>;
  usage: WardrobePrefillField<WardrobeUsage[]>;
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
export function buildWardrobePrefill(rawAnalysis: WardrobeAnalysisResult): WardrobePrefill {
  const analysis = reconcileWardrobeColor(rawAnalysis);

  const field = <T>(value: T | null | undefined, confidence: number): WardrobePrefillField<T> => {
    if (!value || confidence < WARDROBE_CONFIDENCE_MEDIUM) return { value: null, suggested: false };
    return { value, suggested: confidence < WARDROBE_CONFIDENCE_HIGH };
  };

  const uiCategory = WARDROBE_UI_CATEGORY_BY_DB[analysis.category];
  const categoryField = field(uiCategory, analysis.category_confidence);
  const colorField = field(
    analysis.primary_color ? analysis.primary_color.toLowerCase() : null,
    analysis.primary_color_confidence,
  );
  const subcategoryDef = findSubcategory(analysis.subcategory);
  const subcategoryField = field(
    subcategoryDef ? subcategoryDef.value : null,
    analysis.subcategory_confidence,
  );

  const validEnum = <T extends string>(
    value: string | null,
    options: Array<{ value: T }>,
  ): T | null => (value && options.some((o) => o.value === value) ? (value as T) : null);

  const sleeveLengthField = field(
    validEnum<WardrobeSleeveLength>(analysis.sleeve_length, [
      { value: "sans_manches" },
      { value: "courtes" },
      { value: "longues" },
    ]),
    analysis.sleeve_length_confidence,
  );
  const fitField = field(
    validEnum<WardrobeFit>(analysis.fit, WARDROBE_FIT_OPTIONS),
    analysis.fit_confidence,
  );
  const materialField = field(analysis.material, analysis.material_confidence);
  const patternField = field(
    validEnum<WardrobePattern>(analysis.pattern, WARDROBE_PATTERN_OPTIONS),
    analysis.pattern_confidence,
  );

  const validUsage = analysis.usage.filter((u): u is WardrobeUsage =>
    WARDROBE_USAGE_OPTIONS.some((o) => o.value === u),
  );
  const usageField: WardrobePrefillField<WardrobeUsage[]> =
    validUsage.length > 0 && analysis.usage_confidence >= WARDROBE_CONFIDENCE_MEDIUM
      ? { value: validUsage, suggested: analysis.usage_confidence < WARDROBE_CONFIDENCE_HIGH }
      : { value: null, suggested: false };

  const nameSuggestion = subcategoryDef
    ? colorField.value
      ? capitalize(`${subcategoryDef.label} ${colorField.value}`)
      : capitalize(subcategoryDef.label)
    : null;

  return {
    category: categoryField,
    subcategory: subcategoryField,
    name: nameSuggestion
      ? { value: nameSuggestion, suggested: subcategoryField.suggested || colorField.suggested }
      : { value: null, suggested: false },
    primaryColor: colorField,
    sleeveLength: sleeveLengthField,
    fit: fitField,
    material: materialField,
    pattern: patternField,
    usage: usageField,
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

  const normalized: WardrobeAnalysisResult = {
    category: analysis.category,
    category_confidence: analysis.category_confidence ?? 0,
    subcategory: analysis.subcategory ?? null,
    subcategory_confidence: analysis.subcategory_confidence ?? 0,
    primary_color: analysis.primary_color ?? null,
    primary_color_confidence: analysis.primary_color_confidence ?? 0,
    secondary_colors: analysis.secondary_colors ?? [],
    pattern: analysis.pattern ?? null,
    pattern_confidence: analysis.pattern_confidence ?? 0,
    material: analysis.material ?? null,
    material_confidence: analysis.material_confidence ?? 0,
    fit: analysis.fit ?? null,
    fit_confidence: analysis.fit_confidence ?? 0,
    formality: analysis.formality ?? null,
    formality_confidence: analysis.formality_confidence ?? 0,
    seasons: analysis.seasons ?? [],
    sleeve_length: analysis.sleeve_length ?? null,
    sleeve_length_confidence: analysis.sleeve_length_confidence ?? 0,
    usage: analysis.usage ?? [],
    usage_confidence: analysis.usage_confidence ?? 0,
    description: analysis.description,
  };
  return reconcileWardrobeColor(normalized);
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
      // `db` : `wardrobe_items` existe en base (bcwfvpwxzlmkxobvbtzp) mais pas
      // encore dans types.ts (généré, jamais édité à la main).
      const { data, error } = await db
        .from("wardrobe_items")
        .select(
          "id, user_id, name, brand, category, subcategory, storage_path, processed_storage_path, created_at",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const items = (data ?? []) as WardrobeItemQueryRow[];
      const paths = Array.from(
        new Set(
          items
            .flatMap((item) => [item.storage_path, item.processed_storage_path])
            .filter((p): p is string => !!p),
        ),
      );

      const signedByPath = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("wardrobe")
          .createSignedUrls(paths, 60 * 60);
        for (const entry of signed ?? []) {
          if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
        }
      }

      return items.map((item) => {
        const displayPath = pickDisplayStoragePath(item);
        return {
          ...item,
          uiCategory: toUiCategory(item.category ?? item.subcategory),
          imageUrl: displayPath ? (signedByPath.get(displayPath) ?? null) : null,
          originalImageUrl: item.storage_path
            ? (signedByPath.get(item.storage_path) ?? null)
            : null,
        };
      });
    },
  });
}
