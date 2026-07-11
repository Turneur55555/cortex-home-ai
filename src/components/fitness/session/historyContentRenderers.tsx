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
// utilise entièrement le rendu générique — c'est le cas de HYROX/Cardio/
// mobilité/récupération : leur résumé/segments génériques suffisent déjà
// à les rendre identifiables (icône + couleur d'accent, voir
// DisciplineIcon.tsx) sans avoir besoin d'une mise en page bespoke.
//
// Course à pied a désormais une entrée (2026-07-10) : segments cliquables
// ouvrant une fiche détaillée par type de segment (voir
// CourseHistoryContent.tsx / SegmentAnalysisSheet.tsx) — ajout d'UNE
// entrée ici, zéro modification de GenericHistoryCard ni de
// SessionSegmentList, donc zéro impact sur les autres disciplines.
//
// PHASE 1 MULTI-DISCIPLINE (2026-07-11) : Cardio/HYROX/Guided rejoignent
// Course avec le même mécanisme (segments cliquables → fiche détaillée),
// via createDisciplineHistoryContent (DisciplineHistoryContent.tsx) —
// généralisation de CourseHistoryContent qui lit `workouts.metadata.
// segments` au lieu de `workout_segments` (solution transitoire, voir
// useDisciplineSegmentHistory.ts). "autre" (Freeform) reste volontairement
// absent : contenu 100% texte libre généré par IA, sans vocabulaire
// d'exercice stable à cataloguer — hors périmètre Phase 1.
// ============================================================

import type { ReactElement } from "react";
import type { DisciplineId, SessionView } from "@/lib/fitness/engines/types";
import { CourseHistoryContent } from "./CourseHistoryContent";
import { createDisciplineHistoryContent } from "./DisciplineHistoryContent";

export type HistoryContentRenderer = (props: { view: SessionView }) => ReactElement;

export const HISTORY_CONTENT_RENDERERS: Partial<Record<DisciplineId, HistoryContentRenderer>> = {
  course: CourseHistoryContent,
  cardio: createDisciplineHistoryContent("cardio"),
  hyrox: createDisciplineHistoryContent("hyrox"),
  guided: createDisciplineHistoryContent("guided"),
};
