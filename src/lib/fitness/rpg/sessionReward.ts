// ============================================================
// Écran de récompense de fin de séance — assemblage pur (zéro React).
//
// Transforme les `xp_events` d'UNE séance (déjà versés par le serveur, voir
// migration 20260717120000) en un récapitulatif prêt à afficher : total,
// détail par source ordonné, transition de niveau. Aucune règle d'économie
// n'est décidée ici (le serveur est l'autorité) — on ne fait que présenter.
// ============================================================

import { characterLevelForXp, characterLevelProgress } from "./characterLevel";

/** Une ligne d'XP versée pour la séance (miroir de la table `xp_events`). */
export interface SessionXpEvent {
  source: string;
  amount: number;
}

export interface XpBreakdownLine {
  source: string;
  label: string;
  /** Nom d'icône lucide, résolu côté composant. */
  icon: string;
  amount: number;
}

interface SourceMeta {
  label: string;
  icon: string;
  /** Ordre d'affichage (plus petit = plus haut / plus important). */
  order: number;
}

// Vocabulaire muscu-primaire : la séance muscu domine, puis les récompenses
// ponctuelles, puis le soutien. Toute source inconnue tombe sur un repli neutre.
const SOURCE_META: Record<string, SourceMeta> = {
  workout_muscu: { label: "Séance de musculation", icon: "Dumbbell", order: 0 },
  pr_muscu: { label: "Nouveau record", icon: "Trophy", order: 1 },
  streak: { label: "Série de régularité", icon: "Flame", order: 2 },
  workout_support: { label: "Séance de soutien", icon: "Activity", order: 3 },
  badge: { label: "Badge débloqué", icon: "Medal", order: 4 },
  goal: { label: "Quête accomplie", icon: "Target", order: 5 },
};

function metaFor(source: string): SourceMeta {
  return SOURCE_META[source] ?? { label: "Bonus", icon: "Sparkles", order: 99 };
}

/** Somme d'XP versée pour la séance. */
export function totalSessionXp(events: SessionXpEvent[]): number {
  return events.reduce((sum, e) => sum + (e.amount > 0 ? e.amount : 0), 0);
}

/**
 * Détail par source, agrégé (plusieurs events d'une même source cumulés) puis
 * ordonné selon la hiérarchie muscu-primaire. Les montants nuls/négatifs sont
 * ignorés.
 */
export function buildXpBreakdown(events: SessionXpEvent[]): XpBreakdownLine[] {
  const bySource = new Map<string, number>();
  for (const e of events) {
    if (e.amount > 0) bySource.set(e.source, (bySource.get(e.source) ?? 0) + e.amount);
  }
  return Array.from(bySource.entries())
    .map(([source, amount]): XpBreakdownLine => {
      const meta = metaFor(source);
      return { source, label: meta.label, icon: meta.icon, amount };
    })
    .sort((a, b) => metaFor(a.source).order - metaFor(b.source).order);
}

export interface LevelTransition {
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  /** Nombre de niveaux gagnés (≥ 0). */
  levelsGained: number;
  /** Progression dans le niveau AVANT la séance, 0..1. */
  progressBefore: number;
  /** Progression dans le niveau APRÈS la séance, 0..1. */
  progressAfter: number;
}

/**
 * Transition de niveau entre l'XP d'avant la séance et celle d'après.
 * Utilisé en repli uniquement (séances antérieures à la migration
 * `20260718120000`, sans `xp_before`/`xp_after` stockés côté serveur) —
 * `xpBefore` y est reconstruit en retirant l'XP de la séance de `xpAfter`,
 * ce qui suppose qu'aucune autre source d'XP n'a été versée depuis. Le
 * niveau est recalculé depuis l'XP (miroir serveur), jamais transmis tel quel.
 */
export function buildLevelTransition(xpBefore: number, xpAfter: number): LevelTransition {
  const before = Math.max(0, Math.floor(xpBefore));
  const after = Math.max(before, Math.floor(xpAfter));
  const levelBefore = characterLevelForXp(before);
  const levelAfter = characterLevelForXp(after);
  const progressBefore = characterLevelProgress(before).progress;
  // Si on a changé de niveau, la barre "après" se lit dans le NOUVEAU niveau.
  const progressAfter = characterLevelProgress(after).progress;
  return {
    xpBefore: before,
    xpAfter: after,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    levelsGained: Math.max(0, levelAfter - levelBefore),
    progressBefore,
    progressAfter,
  };
}

/**
 * Transition de niveau à partir des compteurs AUTORITATIFS versés côté
 * serveur (`workouts.xp_before/xp_after/level_before/level_after`, migration
 * `20260718120000`). Chemin nominal de l'écran de récompense : aucune
 * reconstruction côté client, seulement une dérivation de la progression
 * d'affichage (barre XP) à partir des valeurs serveur.
 */
export function buildLevelTransitionFromServer(
  xpBefore: number,
  xpAfter: number,
  levelBefore: number,
  levelAfter: number,
): LevelTransition {
  const before = Math.max(0, Math.floor(xpBefore));
  const after = Math.max(before, Math.floor(xpAfter));
  return {
    xpBefore: before,
    xpAfter: after,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    levelsGained: Math.max(0, levelAfter - levelBefore),
    progressBefore: characterLevelProgress(before).progress,
    progressAfter: characterLevelProgress(after).progress,
  };
}
