import { useQuery } from "@tanstack/react-query";
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
