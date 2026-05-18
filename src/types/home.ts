// ─── HomeCategory ─────────────────────────────────────────────────────────────

export interface HomeCategory {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  position: number;
  created_at: string;
}

export interface HomeSubcategory {
  id: string;
  category_id: string;
  user_id: string;
  name: string;
  slug: string;
  icon: string;
  position: number;
  created_at: string;
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface CreateCategoryInput {
  name: string;
  icon: string;
  color: string;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  color?: string;
  position?: number;
}

export interface CreateSubcategoryInput {
  category_id: string;
  name: string;
  icon: string;
}

export interface UpdateSubcategoryInput {
  name?: string;
  icon?: string;
  position?: number;
}

// ─── Category stats (joined client-side) ──────────────────────────────────────

export interface CategoryStats {
  count: number;
  expiring: number;
  lowStock: number;
}
