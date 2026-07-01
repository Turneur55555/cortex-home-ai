// Export multi-format des données utilisateur (CSV / JSON).
import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, unknown>;

const TABLES = [
  "body_tracking",
  "workouts",
  "exercises",
  "exercise_sets",
  "nutrition",
  "nutrition_goals",
  "daily_activity",
  "goals",
  "user_badges",
  "user_stats",
  "user_activity",
  "food_preferences",
  "food_favorites",
] as const;

async function fetchAll(userId: string): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const t of TABLES) {
    // @ts-expect-error dynamic table
    const { data, error } = await supabase.from(t).select("*").eq("user_id", userId);
    if (!error) out[t] = (data ?? []) as Row[];
    else out[t] = [];
  }
  return out;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export async function exportJson(userId: string, email?: string | null): Promise<number> {
  const data = await fetchAll(userId);
  const payload = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    email: email ?? null,
    version: 2,
    ...data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  download(blob, `icortex-export-${new Date().toISOString().slice(0, 10)}.json`);
  return Object.values(data).reduce((n, rows) => n + rows.length, 0);
}

/**
 * Export CSV : un ZIP contenant un fichier par table.
 * On utilise JSZip (déjà installé pour l'import Apple Health).
 */
export async function exportCsvZip(userId: string): Promise<number> {
  const { default: JSZip } = await import("jszip");
  const data = await fetchAll(userId);
  const zip = new JSZip();
  let total = 0;
  for (const [table, rows] of Object.entries(data)) {
    if (!rows.length) continue;
    zip.file(`${table}.csv`, toCsv(rows));
    total += rows.length;
  }
  zip.file(
    "README.txt",
    `Export ICORTEX — ${new Date().toISOString()}\nUn fichier CSV par table. UTF-8, séparateur virgule.\n`,
  );
  const blob = await zip.generateAsync({ type: "blob" });
  download(blob, `icortex-export-csv-${new Date().toISOString().slice(0, 10)}.zip`);
  return total;
}
