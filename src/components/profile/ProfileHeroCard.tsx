import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";

import { RankIllustration } from "@/components/rpg/RankIllustration";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import {
  RANK_AMBIANCE,
  rankGlowShadow,
  rankGrooveShadow,
  rankRelief,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";
import { useUserStats } from "@/hooks/useUserStats";
import { useWeeklyXp } from "@/hooks/useWeeklyXp";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { nextGradeLabel, titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import { weeklyXpLine } from "@/lib/fitness/rpg/weeklyXp";

/** Hauteur de la vitrine : la fiche entière tient sous la Carte du jour sur un iPhone. */
const VITRINE_HEIGHT = "clamp(184px, 27dvh, 260px)";

/**
 * Fiche de Personnage — pièce maîtresse de l'Accueil (01/11/2026).
 *
 * Fusion de l'ancienne illustration plein écran (≈ 420 pt sur iPhone, la barre de progression
 * repoussée sous la ligne de flottaison) et de la carte « Progression RPG » : UN objet forgé dans
 * la matière du Titre courant, visible sans défiler, qui dit qui l'on est ET combien il reste.
 *
 * - **Le Rang reste la star** : l'illustration officielle (`RankIllustration`), sertie comme une
 *   relique dans une vitrine au ratio 4:5 EXACT (`assets/ranks/FORMAT.md` : jamais rognée, aucun
 *   texte superposé — le nom du grade s'affiche SOUS l'illustration).
 * - **La plaque gravée** : grade actuel, barre du palier, « Plus que X XP avant [grade] », et un
 *   FAIT de rythme — l'XP versée cette semaine (sinon la semaine dernière). Jamais de projection.
 * - **La matière** (surface, relief, liseré, halo, grain, respiration, reflet) passe entièrement
 *   par `rankTheme.ts` / `RANK_AMBIANCE` : passer de Guerrier à Colosse reforge l'objet.
 *
 * Aucune logique métier ici : le Titre vient de `titleProgress` (XP GLOBALE uniquement, jamais le
 * Rang par exercice) ; l'XP de la semaine de `lib/fitness/rpg/weeklyXp.ts`. Toucher la fiche ouvre
 * la page Progression.
 */
export function ProfileHeroCard() {
  const { data: userStats } = useUserStats();
  const { summary } = useWeeklyXp();

  // `useUserStats` sert le dernier rang confirmé (cache local) dès le premier rendu ; `userStats`
  // n'est `undefined` que pour un tout premier lancement sans cache — dans ce seul cas, ne rien
  // inventer : un squelette de la même emprise le temps que la vraie valeur arrive.
  if (!userStats) {
    return (
      <div
        aria-busy="true"
        className="mb-4 w-full animate-pulse rounded-[26px] bg-white/5 p-4"
        style={{ minHeight: `calc(${VITRINE_HEIGHT} + 150px)` }}
      />
    );
  }

  const progress = titleProgressForXp(userStats.xp);
  const nextGrade = nextGradeLabel(progress);
  const span = Math.max(
    1,
    (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
  );
  const percent = progress.isMax
    ? 100
    : Math.max(0, Math.min(100, ((progress.xp - progress.xpCurrentThreshold) / span) * 100));
  const weekly = weeklyXpLine(summary);

  // ── Matière du Titre courant : couleurs (RankTheme) + profil de matériau (RANK_AMBIANCE).
  const rankKey = progress.title.key;
  const theme = rankThemeByKey(rankKey);
  const amb = RANK_AMBIANCE[rankKey];
  const mix = amb.surfaceMix;
  const plateSurface =
    `radial-gradient(120% 70% at 50% -12%, color-mix(in oklch, ${theme.secondary} 40%, transparent), transparent 60%),` +
    `linear-gradient(162deg,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 20}%, oklch(0.2 0 0)) 0%,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 8}%, oklch(0.14 0 0)) 55%,` +
    ` color-mix(in oklch, ${theme.primary} ${Math.max(mix - 6, 0)}%, oklch(0.09 0 0)) 100%)`;
  const plateShadow = [
    "0 24px 54px -22px rgba(0,0,0,0.8)",
    "0 8px 18px -12px rgba(0,0,0,0.55)",
    rankRelief(theme, amb.reliefAlpha),
    rankRingInset(theme.secondary, "45"),
    rankGlowShadow(theme.glow, 0, 0, Math.round(amb.shadowBlur * 0.7)),
  ].join(", ");

  return (
    <motion.section
      aria-label="Ta fiche de personnage"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
      className="relative mb-4 overflow-hidden rounded-[26px] p-4"
      style={{ background: plateSurface, boxShadow: plateShadow }}
    >
      <Link
        to="/progression"
        className="absolute inset-0 z-10 rounded-[26px]"
        aria-label={`${progress.title.label} ${progress.grade} — ouvrir la progression`}
      />
      {/* Grain martelé, respiration de la lumière et reflet forgé du Titre courant. */}
      <div aria-hidden className="bg-rank-grain pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="animate-rank-breathe pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(90% 55% at 50% 0%, rgba(255,255,255,0.1), transparent 62%)",
        }}
      />
      <div
        aria-hidden
        className="rank-glint-layer pointer-events-none absolute inset-0 opacity-40"
      />

      <div className="relative flex flex-col items-center">
        {/* Halo derrière la relique : la lumière du rang, pas une couleur inventée. */}
        <div
          aria-hidden
          className="animate-rank-breathe pointer-events-none absolute left-1/2 top-[38%] h-[70%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(closest-side, ${theme.glow}, transparent)`,
            opacity: 0.55,
          }}
        />
        {/* La vitrine — ratio 4:5 exact, illustration entière. */}
        <div
          className="relative overflow-hidden rounded-[20px] bg-black"
          style={{
            aspectRatio: "4 / 5",
            height: VITRINE_HEIGHT,
            boxShadow: `${rankRingInset(theme.secondary, "55")}, ${rankGlowShadow(theme.glow, 0, 16, -8)}, 0 18px 32px -18px rgba(0,0,0,0.9)`,
          }}
        >
          <RankIllustration
            rankKey={rankKey}
            label={progress.title.label}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {/* La plaque gravée, en creux dans le métal. */}
        <div
          className="relative mt-3.5 w-full rounded-[18px] px-4 pb-3.5 pt-3"
          style={{
            background: "rgba(0,0,0,0.2)",
            boxShadow: `inset 0 3px 10px -3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(0,0,0,0.4), ${rankRingInset(theme.primary, "22")}`,
          }}
        >
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: "rgba(255,255,255,0.6)", textShadow: "0 1px 1px rgba(0,0,0,0.6)" }}
              >
                Grade actuel
              </p>
              <p
                className="mt-1 break-words text-[22px] font-black uppercase leading-none tracking-[0.1em]"
                style={{
                  color: theme.text,
                  textShadow: rankTextGlow(theme.glow, 14, "0 1px 0 rgba(0,0,0,0.55)"),
                }}
              >
                {progress.grade}
              </p>
            </div>
            {weekly && (
              <p
                className="shrink-0 text-right text-[11px] font-semibold leading-tight"
                style={{ color: "rgba(255,255,255,0.66)", textShadow: "0 1px 1px rgba(0,0,0,0.5)" }}
              >
                <span
                  className="block text-[15px] font-black tabular-nums"
                  style={{ color: theme.secondary }}
                >
                  +{formatXp(weekly.amount)} XP
                </span>
                {weekly.when}
              </p>
            )}
          </div>

          <div
            className="relative mt-3 h-3 overflow-hidden rounded-full"
            role="progressbar"
            aria-label={nextGrade ? `Progression vers ${nextGrade}` : "Grade suprême atteint"}
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.34))",
              boxShadow: rankGrooveShadow(theme.secondary),
            }}
          >
            <div
              className="relative h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${percent}%`,
                background: theme.gradient,
                boxShadow: `${rankGlowShadow(theme.glow, 0, 0, 12)}, inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.4)`,
              }}
            >
              {percent > 4 && percent < 100 && (
                <span
                  aria-hidden
                  className="animate-rank-breathe absolute inset-y-0 right-0 w-6 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 100% 50%, rgba(255,255,255,0.9), transparent 70%)",
                  }}
                />
              )}
            </div>
          </div>

          <p
            className="mt-2.5 text-center text-[12.5px] font-semibold"
            style={{ color: "rgba(255,255,255,0.7)", textShadow: "0 1px 1px rgba(0,0,0,0.5)" }}
          >
            {progress.isMax || !nextGrade ? (
              <span style={{ color: theme.secondary }}>Grade suprême atteint</span>
            ) : (
              <>
                Plus que{" "}
                <span className="font-black tabular-nums" style={{ color: theme.secondary }}>
                  {formatXp(progress.xpToNext)} XP
                </span>{" "}
                avant{" "}
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ color: theme.secondary }}
                >
                  {nextGrade}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
