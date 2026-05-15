import { useEffect, useRef, useState } from "react";
import { searchFoods, type FoodSuggestion } from "@/services/openFoodFacts";

const cache = new Map<string, FoodSuggestion[]>();

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
    if (cache.has(q)) {
      setResults(cache.get(q)!);
      setError(null);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      setError(null);
      searchFoods(q, ctrl.signal)
        .then((r) => {
          cache.set(q, r);
          setResults(r);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setError("Erreur de récupération");
          setResults([]);
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
