import { supabase } from "@/integrations/supabase/client";
import type {
  HomeSubcategory,
  CreateSubcategoryInput,
  UpdateSubcategoryInput,
} from "@/types/home";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getSubcategories(categoryId: string): Promise<HomeSubcategory[]> {
  const { data, error } = await supabase
    .from("home_subcategories")
    .select("*")
    .eq("category_id", categoryId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomeSubcategory[];
}

export async function createSubcategory(
  input: CreateSubcategoryInput,
): Promise<HomeSubcategory> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: existing } = await supabase
    .from("home_subcategories")
    .select("position")
    .eq("category_id", input.category_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = existing ? (existing.position as number) + 1 : 0;
  const baseSlug = toSlug(input.name);

  const { data: conflict } = await supabase
    .from("home_subcategories")
    .select("id")
    .eq("category_id", input.category_id)
    .eq("slug", baseSlug)
    .maybeSingle();

  const slug = conflict ? `${baseSlug}-${Date.now()}` : baseSlug;

  const { data, error } = await supabase
    .from("home_subcategories")
    .insert({
      category_id: input.category_id,
      user_id: user.id,
      name: input.name.trim(),
      slug,
      icon: input.icon,
      position: nextPosition,
    })
    .select()
    .single();
  if (error) throw error;
  return data as HomeSubcategory;
}

export async function updateSubcategory(
  id: string,
  patch: UpdateSubcategoryInput,
): Promise<void> {
  const { error } = await supabase
    .from("home_subcategories")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSubcategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("home_subcategories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
