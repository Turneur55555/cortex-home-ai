import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Échappe l'arbre React courant pour monter `children` directement sous
 * `document.body`. Indispensable pour toute UI en `position: fixed`
 * plein écran (sheet, dialog, overlay) : un ancêtre avec `backdrop-filter`,
 * `filter`, `transform`, `perspective` ou `will-change` sur l'une de ces
 * propriétés devient le containing block des descendants `fixed` (spec
 * CSS Filter Effects / Transforms) — si cet ancêtre a aussi `overflow-hidden`
 * (cas de toutes les cartes `<li>` premium : `overflow-hidden … backdrop-blur-xl`),
 * le contenu fixed est alors rogné au cadre de la carte au lieu de couvrir
 * l'écran, quel que soit le padding/min-h appliqué à l'intérieur du sheet.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
