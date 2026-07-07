// ============================================================
// Point d'extension — contenu custom d'une carte d'historique par
// discipline (Phase 7). Mirroir exact de CUSTOM_QUESTION_RENDERERS
// (senseiCustomRenderers.tsx, Phase 2) appliqué à l'historique plutôt
// qu'au dialogue Sensei : même philosophie, même mécanisme.
//
// GenericHistoryCard (et demain tout futur écran d'historique) lit ce
// registre AVANT de retomber sur le rendu générique
// (SessionSummaryCard + SessionSegmentList, alimentés par
// engine.toSessionView()). Une discipline qui n'a pas d'entrée ici
// utilise entièrement le rendu générique — c'est le cas des 5
// disciplines actuelles : leur résumé/segments génériques suffisent
// déjà à les rendre identifiables (icône + couleur d'accent, voir
// DisciplineIcon.tsx) sans avoir besoin d'une mise en page bespoke.
//
// Demain, si une discipline a besoin d'un affichage vraiment différent
// (ex: une frise de postes pour HYROX), il suffit d'ajouter UNE entrée
// ici — zéro modification de GenericHistoryCard ni de SeancesTab.
// ============================================================

import type { ReactElement } from "react";
import type { DisciplineId, SessionView } from "@/lib/fitness/engines/types";

export type HistoryContentRenderer = (props: { view: SessionView }) => ReactElement;

export const HISTORY_CONTENT_RENDERERS: Partial<Record<DisciplineId, HistoryContentRenderer>> = {
  // Volontairement vide aujourd'hui — voir en-tête de fichier.
};
