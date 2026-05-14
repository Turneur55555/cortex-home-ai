import { useCallback, useEffect, useState } from "react";

const KEY = "icortex.profile.pseudo";

export function useProfile(fallback: string) {
  const [pseudo, setPseudo] = useState<string>(fallback);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v && v.trim()) setPseudo(v);
      else setPseudo(fallback);
    } catch {
      setPseudo(fallback);
    }
  }, [fallback]);

  const updatePseudo = useCallback((next: string) => {
    const trimmed = next.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      throw new Error("Le pseudo doit faire entre 3 et 20 caractères.");
    }
    try {
      localStorage.setItem(KEY, trimmed);
    } catch {
      // ignore
    }
    setPseudo(trimmed);
  }, []);

  return { pseudo, updatePseudo };
}
