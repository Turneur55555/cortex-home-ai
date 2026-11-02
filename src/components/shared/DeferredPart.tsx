import { Component, Suspense, type ReactNode } from "react";

/**
 * CHARGEMENT DIFFÉRÉ — pour les morceaux lourds qui ne servent pas au premier affichage
 * (graphiques, feuilles IA, catalogue). Mesure du 27/10/2026 : la page Séances chargeait
 * ~580 Ko compressés, graphiques compris, sans en afficher un seul.
 *
 * Trois règles (les deux premières dans `lazyWithPreload.ts`) :
 * - `lazyWithPreload` : un échec de chargement n'est PAS mémorisé (hors connexion, puis réseau
 *   revenu → le prochain affichage réessaie) ;
 * - `preloadWhenIdle` : après le premier affichage, les morceaux différés sont chargés pendant
 *   un temps mort — le Service Worker les met alors en cache (CacheFirst sur `/assets`), donc
 *   ils restent disponibles si le réseau tombe à la salle ;
 * - `DeferredPart` : un morceau qui ne peut pas se charger affiche un repli LOCAL, jamais
 *   l'écran d'erreur global de l'application.
 *
 * Ne JAMAIS différer le parcours de séance (démarrer, saisir, terminer) : il doit marcher même
 * si le réseau tombe avant qu'un préchargement n'ait eu lieu.
 */

class DeferredPartBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const DEFAULT_ERROR_FALLBACK = (
  <p className="py-4 text-center text-[12px] text-muted-foreground">
    Indisponible pour l'instant — réessaie avec du réseau.
  </p>
);

export function DeferredPart({
  children,
  fallback = null,
  errorFallback = DEFAULT_ERROR_FALLBACK,
}: {
  children: ReactNode;
  /** Pendant le chargement. */
  fallback?: ReactNode;
  /** Si le morceau ne peut pas se charger (hors connexion, jamais préchargé). */
  errorFallback?: ReactNode;
}) {
  return (
    <DeferredPartBoundary fallback={errorFallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </DeferredPartBoundary>
  );
}
