/**
 * Les trois modules pairs des Chroniques. Fichier léger, partagé par la route (`/chroniques`,
 * qui valide `?module=`) et par la page : la route n'a pas à importer l'écran pour connaître
 * ses clés.
 */
export const CHRONIQUES_MODULE_KEYS = ["legendes", "forge", "progression"] as const;
export type ChroniquesModuleKey = (typeof CHRONIQUES_MODULE_KEYS)[number];

/**
 * Sans module demandé : Les Légendes — le module le plus identitaire et le plus « capturable »
 * (illustrations de rang), jamais un lanceur de cartes ni des graphiques (règle DA : le Rang est
 * la star).
 */
export const DEFAULT_CHRONIQUES_MODULE: ChroniquesModuleKey = "legendes";
