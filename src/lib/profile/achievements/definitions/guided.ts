// ============================================================
// Catégorie "Activités accompagnées" (Phase 6) — Pilates Lagree, Yoga,
// Mobilité, Stretching, et toute discipline encadrée future (CrossFit
// cours, Danse, Aquagym, Natation encadrée, cours collectifs...).
//
// Contrairement à hyrox.ts/running.ts (posés en comingSoon le 06/07 en
// attendant un vrai module), ces succès sont RÉELS dès aujourd'hui :
// GuidedActivityEngine (Phase 6) écrit de vraies lignes `workouts`
// (discipline='guided'), comptées par useDisciplineWorkoutCount — pas
// besoin d'inventer un faux déblocage.
// ============================================================

import { buildMilestoneSeries } from "../tierBuilder";

export const guidedAchievements = buildMilestoneSeries({
  idPrefix: "guided_sessions",
  category: "guided",
  icon: "Heart",
  select: (ctx) => ctx.guidedSessionsCount,
  descriptionTemplate: (t) =>
    `Termine ${t} activité(s) accompagnée(s) (Pilates, Yoga, Mobilité, Stretching...).`,
  currentLabel: (v) => `${v} séance(s)`,
  tiers: [
    { threshold: 1, rarity: "common", title: "Premier cours encadré" },
    { threshold: 5, rarity: "rare", title: "Habitué des cours collectifs" },
    { threshold: 15, rarity: "epic", title: "Pilier de studio" },
    { threshold: 30, rarity: "legendary", title: "Maître de la discipline encadrée" },
  ],
});
