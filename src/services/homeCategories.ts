import { supabase } from "@/integrations/supabase/client";
import type {
  HomeCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/types/home";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getCategories(): Promise<HomeCategory[]> {
  const { data, error } = await supabase
    .from("home_categories")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomeCategory[];
}

export async function createCategory(input: CreateCategoryInput): Promise<HomeCategory> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: existing } = await supabase
    .from("home_categories")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = existing ? (existing.position as number) + 1 : 0;
  const baseSlug = toSlug(input.name);

  const { data: conflict } = await supabase
    .from("home_categories")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", baseSlug)
    .maybeSingle();

  const slug = conflict ? `${baseSlug}-${Date.now()}` : baseSlug;

  const { data, error } = await supabase
    .from("home_categories")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      slug,
      icon: input.icon,
      color: input.color,
      position: nextPosition,
    })
    .select()
    .single();
  if (error) throw error;
  return data as HomeCategory;
}

export async function updateCategory(
  id: string,
  patch: UpdateCategoryInput,
): Promise<void> {
  const { error } = await supabase
    .from("home_categories")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("home_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function reorderCategories(
  ordered: { id: string; position: number }[],
): Promise<void> {
  const updates = ordered.map(({ id, position }) =>
    supabase.from("home_categories").update({ position }).eq("id", id),
  );
  await Promise.all(updates);
}

export function subscribeCategories(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`home_categories:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "home_categories",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
