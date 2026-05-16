import { useEffect, useRef, useState } from "react";
import { searchFoods, type FoodSuggestion } from "@/services/openFoodFacts";
import { searchLocalFoods } from "@/lib/nutrition/localFoods";

// Session-level in-memory cache for OFE results
const offCache = new Map<string, FoodSuggestion[]>();

export function useFoodSearch(query: string, enabled = true) {
  const [results, setResults] = useState<FoodSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!enabled || q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Local foods always shown immediately
    const local = searchLocalFoods(q);
    setResults(local);

    // OFE results — debounced 300 ms, merged after local
    if (offCache.has(q)) {
      const off = offCache.get(q)!;
      setResults(mergeResults(local, off));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const t = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      searchFoods(q, ctrl.signal)
        .then((off) => {
          const tagged = off.map((f) => ({ ...f, source: "off" as const }));
          offCache.set(q, tagged);
          setResults(mergeResults(local, tagged));
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setError("Erreur de récupération");
          // Keep local results visible even on OFE error
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(t);
      ctrlRef.current?.abort();
    };
  }, [query, enabled]);

  return { results, loading, error };
}

/** Local foods first; OFE results that duplicate a local name are filtered out. */
function mergeResults(local: FoodSuggestion[], off: FoodSuggestion[]): FoodSuggestion[] {
  const localNames = new Set(local.map((f) => f.name.toLowerCase()));
  const unique = off.filter((f) => !localNames.has(f.name.toLowerCase()));
  return [...local, ...unique].slice(0, 12);
}

// ─── Recent foods ─────────────────────────────────────────────────────────────

const RECENT_KEY = "food_recent_v1";
const MAX_RECENT = 8;

export function getRecentFoods(): FoodSuggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as FoodSuggestion[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentFood(food: FoodSuggestion) {
  try {
    const list = getRecentFoods().filter((f) => f.id !== food.id);
    list.unshift(food);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}
