/**
 * Les quatre onglets de la barre du bas, et les écrans qui appartiennent à chacun.
 *
 * Logique PURE (zéro React). « Profil » porte aussi Corps (`/corps`, ouvert depuis la carte de Profil —
 * aucun onglet de plus dans la barre). « Séances » porte deux étages — Arène (`/seances`) et
 * Chroniques (`/chroniques`) — et les bilans de semaine (`/semaine`) sont des pages des
 * Chroniques : l'onglet reste actif sur tous, sans quoi il s'éteindrait en pleine lecture
 * de ses propres Chroniques.
 */

export type TabRoute = "/" | "/seances" | "/nutrition" | "/profil";

const OWNED_ROUTES: Record<TabRoute, readonly string[]> = {
  "/": ["/"],
  "/seances": ["/seances", "/chroniques", "/semaine"],
  "/nutrition": ["/nutrition"],
  // Corps est rangé dans Profil (E19) : l'onglet Profil reste allumé pendant toute la visite.
  "/profil": ["/profil", "/corps"],
};

/** Vrai si `pathname` est `route` ou une sous-page de `route` (jamais un simple préfixe de texte). */
function isWithin(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isTabActive(tab: TabRoute, pathname: string): boolean {
  // L'accueil n'est actif QUE sur « / » : tout chemin commence par « / ».
  if (tab === "/") return pathname === "/";
  return OWNED_ROUTES[tab].some((route) => isWithin(pathname, route));
}
