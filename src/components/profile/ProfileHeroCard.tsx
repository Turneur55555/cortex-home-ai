import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { RankDisc } from "@/components/rpg/RankDisc";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { type RankState } from "@/lib/fitness/exerciseRanks";
import { toRankState } from "@/hooks/useExerciseProgression";
import { SERIF, EASE_OUT, stagger } from "@/components/rpg/premium/tokens";
import type { RankAggregate } from "@/components/fitness/RankAggregator";

interface Props {
  rankAggregate: RankAggregate;
}

/**
 * Fiche de Personnage — pièce maîtresse de CORTEX (Accueil).
 *
 * Le DISQUE (RankDisc), symbole officiel de CORTEX, est mis en scène au centre ;
 * le nom de rang (« TITAN ») domine en lettrage serif. Aucune photo, prénom,
 * grade, ni progression : le rang est l'unique information. L'identité de
 * l'utilisateur (avatar + pseudo) est rendue par ProfileIdentityStrip, au-dessus.
 *
 * Aucune logique métier ici : `rankAggregate` vient de RankAggregator (qui
 * observe le moteur de rang). Réutilise le langage graphique partagé
 * (RankDisc, tokens premium) destiné à toute l'app.
 */
export function ProfileHeroCard({ rankAggregate }: Props) {
  const { user } = useAuth();

  // Cache local du dernier rang connu (par utilisateur) pour éviter le flash
  // « Mortel » pendant que RankAggregator sonde les hooks asynchrones.
  // Clé stable : on ne stocke que le `tierIndex` (0..N) — reconstruit via
  // `toRankState`. Aucune fuite entre utilisateurs (clé préfixée par user.id).
  const cacheKey = user ? `cortex:hero-rank-tier:${user.id}` : null;
  const [cachedTier, setCachedTier] = useState<number | null>(() => {
    if (typeof window === "undefined" || !cacheKey) return null;
    const raw = window.localStorage.getItem(cacheKey);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

  const ranked = rankAggregate.best?.rank ?? null;

  // Persiste le meilleur rang dès qu'il est disponible.
  useEffect(() => {
    if (!cacheKey || !ranked) return;
    if (ranked.tierIndex === cachedTier) return;
    try {
      window.localStorage.setItem(cacheKey, String(ranked.tierIndex));
      setCachedTier(ranked.tierIndex);
    } catch {
      /* quota / SSR — no-op */
    }
  }, [cacheKey, ranked, cachedTier]);

  // Ordre de priorité : rang réel > rang en cache (chargement) > Mortel I.
  // → tant que la sonde n'a pas fini, on n'affiche JAMAIS un rang inférieur
  //   au dernier rang connu de l'utilisateur.
  const displayRank: RankState =
    ranked ?? (cachedTier != null ? toRankState(cachedTier, 0) : toRankState(0, 0));
  const isHydrating = !ranked && cachedTier == null && rankAggregate.isLoading;
  const rank: RankState = displayRank;
  // Considère l'utilisateur comme classé dès qu'on a un rang à afficher —
  // réel OU en cache — pour éviter le clignotement "Non classé" puis "Titan".
  const showRanked = !!ranked || cachedTier != null;
  const colors = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-6 overflow-hidden rounded-[28px] px-5 pb-7 pt-7 shadow-elevated"
      style={{
        background: visual.atmosphere,
        boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 16px 50px -22px ${colors.glow}`,
      }}
    >
      <RankAmbientParticles rankKey={rank.rank.key} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(130% 70% at 50% 100%, rgba(0,0,0,0.58) 0%, transparent 72%)",
        }}
      />

      {/* ── Scène du RANG (le héros) ──────────────────────────────────────── */}
      <div className="relative flex flex-col items-center text-center">
        <RankDisc rank={rank} size={170} variant="hero" revealDelay={0.1} />

        {/* Nom de RANG monumental : lettrage serif, métal dégradé, halo, reflet. */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: showRanked ? 1 : isHydrating ? 0 : 0.6, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: stagger(1), ease: EASE_OUT }}
          className="relative mt-3 flex flex-col items-center"
        >
          {/* Halo diffus du nom */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[42px] font-black uppercase leading-none tracking-[0.1em] blur-[12px]"
            style={{ fontFamily: SERIF, color: colors.glow, opacity: 0.8 }}
          >
            {rank.rank.label}
          </span>
          {/* Nom rempli d'un dégradé métallique */}
          <h1
            className="relative bg-clip-text text-[42px] font-black uppercase leading-none tracking-[0.1em] text-transparent"
            style={{
              fontFamily: SERIF,
              backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${colors.secondary} 46%, ${colors.primary} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
            }}
          >
            {rank.rank.label}
          </h1>
          {/* Reflet en miroir sous le nom */}
          <span
            aria-hidden
            className="pointer-events-none -mt-1 bg-clip-text text-[42px] font-black uppercase leading-none tracking-[0.1em] text-transparent"
                       style={{
              fontFamily: SERIF,
              backgroundImage: `linear-gradient(180deg, ${colors.primary} 0%, transparent 70%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              transform: "scaleY(-1)",
              opacity: 0.22,
              maskImage: "linear-gradient(black, transparent 55%)",
              WebkitMaskImage: "linear-gradient(black, transparent 55%)",
            }}
          >
            {rank.rank.label}
          </span>
        </motion.div>
      </div>

    </motion.header>
  );
}
