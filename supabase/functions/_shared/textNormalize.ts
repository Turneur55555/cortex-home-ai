// Normalisation de texte partagée par `exerciseDatasetMatching.ts` et
// `exerciseTranslations.ts`. Isolée dans son propre module pour éviter toute
// dépendance circulaire entre les deux (le moteur de scoring utilise les
// dictionnaires de traduction, et les dictionnaires ont besoin de normaliser
// leurs clés de recherche).
export function normalizeForMatch(value: string): string {
  return (value ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
