import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";

import { RankIllustration } from "@/components/rpg/RankIllustration";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import {
  rankGlowShadow,
  rankRingInset,
  rankRingOutset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrengthCard } from "@/hooks/useStrengthCard";
import { useUserStats } from "@/hooks/useUserStats";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { describeSince, formatKgFr } from "@/lib/fitness/rpg/strengthCard";
import { nextGradeLabel, titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";

/** Segments de la barre d'XP (un segment = 5 % du palier). */
const SEGMENTS = 20;

/**
 * La carte de force — fiche de personnage de l'Accueil (« carte obsidienne », validée sur
 * maquette par Nathan le 02/11/2026, placée SOUS « Ton rythme »).
 *
 * - **Le Rang reste la star** : l'illustration officielle (`RankIllustration`) sertie dans un cadre
 *   au ratio 4:5 EXACT (`assets/ranks/FORMAT.md` : jamais rognée, aucun texte par-dessus), le Titre
 *   et le grade gravés à côté, l'XP restante avant le grade suivant sur une barre segmentée.
 * - **Tes records** : une ligne par groupe musculaire — exercice phare, record de charge, ce qu'il
 *   a gagné (règle pure : `lib/fitness/rpg/strengthCard.ts`, des faits, jamais une projection).
 * - **La matière** passe par `rankTheme.ts` : changer de Titre reteinte la carte entière.
 *
 * Toucher la carte ouvre la page Progression.
 */
export function ProfileHeroCard() {
  const { data: userStats } = useUserStats();
  const { isLoading: strengthLoading, card } = useStrengthCard();

  // `useUserStats` sert le dernier rang confirmé (cache local) dès le premier rendu ; `userStats`
  // n'est `undefined` que pour un tout premier lancement sans cache : un squelette, rien d'inventé.
  if (!userStats) {
    return (
      <section aria-busy="true">
        <Skeleton className="h-[300px] w-full rounded-[24px]" />
      </section>
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
  const filled = Math.round((percent / 100) * SEGMENTS);
  const rankKey = progress.title.key;
  const theme = rankThemeByKey(rankKey);
  const since = describeSince(card?.since ?? null);

  const surface =
    `radial-gradient(120% 60% at 15% 0%, color-mix(in oklch, ${theme.secondary} 22%, transparent), transparent 60%),` +
    `linear-gradient(160deg, color-mix(in oklch, ${theme.primary} 12%, oklch(0.17 0 0)), oklch(0.11 0 0))`;

  return (
    <section aria-label="Ta carte">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Ta carte
      </h2>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="relative overflow-hidden rounded-[24px] p-3.5"
        style={{
          background: surface,
          boxShadow: `${rankRingInset(theme.primary, "8c")}, ${rankGlowShadow(theme.glow, 0, 14, 32)}`,
        }}
      >
        <Link
          to="/progression"
          className="absolute inset-0 z-10 rounded-[24px]"
          aria-label={`${progress.title.label} ${progress.grade} — ouvrir la progression`}
        />
        {/* Liseré intérieur gravé et reflet : décor, jamais de contenu. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[5px] rounded-[20px]"
          style={{ boxShadow: rankRingInset(theme.primary, "38") }}
        />
        <div
          aria-hidden
          className="rank-glint-layer pointer-events-none absolute inset-0 opacity-30"
        />

        <div className="relative flex items-center gap-3.5">
          <div
            className="relative w-[92px] shrink-0 overflow-hidden rounded-xl"
            style={{
              aspectRatio: "4 / 5",
              boxShadow: `${rankRingOutset(theme.secondary, "b3")}, ${rankGlowShadow(theme.glow, 0, 6, 18)}`,
            }}
          >
            <RankIllustration
              rankKey={rankKey}
              label={progress.title.label}
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.26em] text-white/60">
              {progress.title.label}
            </p>
            <p
              className="mt-1 break-words text-[30px] font-black uppercase leading-none tracking-[0.06em]"
              style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 16) }}
            >
              {progress.grade}
            </p>
            <p className="mt-1.5 text-[12px] font-semibold text-white/80">
              {progress.isMax || !nextGrade ? (
                <span style={{ color: theme.secondary }}>Grade suprême atteint</span>
              ) : (
                <>
                  <b className="font-extrabold tabular-nums" style={{ color: theme.secondary }}>
                    {formatXp(progress.xpToNext)} XP
                  </b>{" "}
                  avant {nextGrade}
                </>
              )}
            </p>
            <div
              className="mt-2 flex gap-[2.5px]"
              role="progressbar"
              aria-label={nextGrade ? `Progression vers ${nextGrade}` : "Grade suprême atteint"}
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-[2px]"
                  style={{ background: i < filled ? theme.gradient : "rgba(255,255,255,0.09)" }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-3">
          {strengthLoading && !card ? (
            <div className="space-y-2.5" aria-busy="true">
              <Skeleton className="h-6 w-full rounded-lg" />
              <Skeleton className="h-6 w-full rounded-lg" />
              <Skeleton className="h-6 w-full rounded-lg" />
            </div>
          ) : card && card.rows.length > 0 ? (
            <ul className="space-y-2">
              {card.rows.map((row) => (
                <li
                  key={row.group}
                  className="grid grid-cols-[104px_minmax(0,1fr)_54px_34px] items-center gap-2"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-extrabold tracking-[0.14em] text-white/85">
                      {row.label}
                    </span>
                    <span className="block truncate text-[10px] text-white/50">
                      {row.exerciseName}
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.round(row.barRatio * 100)}%`,
                        background: theme.gradient,
                      }}
                    />
                  </span>
                  <span className="text-right text-[15px] font-black tabular-nums text-white">
                    {formatKgFr(row.recordKg)}
                    <span className="ml-0.5 text-[9.5px] font-bold text-white/50">kg</span>
                  </span>
                  <span className="text-right text-[10.5px] font-black tabular-nums text-emerald-400">
                    {row.progressionKg > 0 ? `▲${formatKgFr(row.progressionKg)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] leading-snug text-white/60">
              Tes records apparaîtront ici dès qu'un exercice chargé aura été fait trois fois.
            </p>
          )}
          {card && card.rows.some((r) => r.progressionKg > 0) && since && (
            <p className="mt-2.5 text-right text-[10.5px] text-white/50">▲ {since}</p>
          )}
        </div>
      </motion.div>
    </section>
  );
}
