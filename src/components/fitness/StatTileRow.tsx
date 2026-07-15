// ============================================================
// Ligne de tuiles de stats auto-adaptative — Addendum 2 (2026-07-15,
// retour de Nathan). Remplace le `grid grid-cols-4` figé dupliqué dans
// WorkoutCard.tsx (musculation) et GenericHistoryCard.tsx (5 autres
// disciplines) : le nombre de colonnes suit désormais le nombre RÉEL de
// tuiles passées, jamais un nombre fixe. Avant ce composant, une séance
// avec moins de 4 tuiles déclarées (ex. Cardio : Exos + Durée + Activité
// = 3 tuiles sur une grille à 4 colonnes) laissait une case vide — exactement
// le symptôme "beaucoup d'espace vide" signalé. Musculation a toujours
// exactement 4 tuiles ⇒ rendu strictement identique à avant (4 colonnes),
// zéro régression visuelle possible par construction. Guided peut, lui,
// déclarer jusqu'à 5 tuiles (Exos+Durée+Intensité+Calories+Récupération) —
// avant ce composant, la 5e tuile débordait sur une 2e ligne quasi vide
// sur une grille à 4 colonnes figée, même symptôme.
//
// "Le composant décide du layout, la discipline déclare ses capacités" —
// ce composant ne connaît AUCUN vocabulaire de discipline, uniquement une
// liste de tuiles déjà construites par l'appelant (StatTile inchangé).
// ============================================================

import type { ReactNode } from "react";
import { StatTile } from "./StatTile";

export interface StatTileSpec {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  title?: string;
}

// Addendum 3 (2026-07-15) : plafonné à 4 colonnes par ligne (au-delà, retour à la
// ligne automatique via `grid-auto-flow: row` — même gabarit de colonnes réutilisé
// pour la/les lignes suivantes). Sans ce plafond, une séance à 5 tuiles (ex. Guided :
// Exos+Durée+Intensité+Calories+Récupération) compressait chaque colonne à moins de
// 20% de largeur, provoquant un débordement de texte (voir StatTile.tsx) même avec
// la correction défensive — mieux vaut une 2e ligne que des colonnes trop étroites.
const MAX_COLUMNS = 4;

export function StatTileRow({ tiles }: { tiles: StatTileSpec[] }) {
  if (tiles.length === 0) return null;
  const columns = Math.min(tiles.length, MAX_COLUMNS);
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {tiles.map((t) => (
        <StatTile
          key={t.key}
          icon={t.icon}
          label={t.label}
          value={t.value}
          unit={t.unit}
          title={t.title}
        />
      ))}
    </div>
  );
}
