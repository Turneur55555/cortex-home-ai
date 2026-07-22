import { Swords } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp, nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import {
  RANK_AMBIANCE,
  rankGlowShadow,
  rankRelief,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";

/**
 * Progression RPG — PREMIER ARTEFACT CORTEX (POC direction « Artefact »).
 *
 * Cette carte n'est plus un panneau : c'est un objet FORGÉ dans le matériau du
 * rang courant. Toute la matière (surface, relief, biseau, gravure, lumière,
 * profondeur, grain, reflets) est pilotée par RankTheme — jamais réassemblée à
 * la main : les couleurs/halos passent par les helpers `rankTheme.ts`, le grain
 * et le rythme par les utilitaires partagés (`.bg-rank-grain`,
 * `.animate-rank-breathe`, `.rank-glint-layer`, tous alimentés par
 * `RANK_AMBIANCE` via `applyRankTheme`). Résultat : passer de Guerrier à Titan
 * ne change pas une teinte, cela REFORGE l'objet dans une autre matière
 * (cuivre → lave, grain, biseau, rythme de lumière et reflets compris).
 *
 * Aucune donnée ni logique métier modifiée : Grade actuel → nom du grade →
 * barre → « Plus que X XP avant [grade] ». Source unique : `titleProgress`
 * (moteur piloté par l'XP globale, `user_stats.xp`).
 *
 * NB : c'est la carte de RÉFÉRENCE. Une fois validée, sa matière sera extraite
 * dans un composant réutilisable qui forgera toutes les autres cartes Cortex.
 * Rien d'autre n'est touché pour l'instant.
 */
export function RPGProgressionSection() {
  const { data: userStats, isLoading } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);
  const currentGrade = progress.grade;
  const nextGrade = nextGradeLabel(progress);
  const percent = progress.isMax
    ? 100
    : ((progress.xp - progress.xpCurrentThreshold) /
        Math.max(
          1,
          (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
        )) *
      100;
  const clampedPercent = Math.max(0, Math.min(100, percent));

  // ── Matière du rang courant : couleurs (RankTheme) + profil de matériau
  //    (RANK_AMBIANCE). Tout ce qui suit en dérive — rien n'est codé « en dur »
  //    par rang, donc l'objet se reforge tout seul à chaque montée de Titre.
  const theme = rankThemeByKey(progress.title.key);
  const amb = RANK_AMBIANCE[progress.title.key];

  // Surface forgée : dégradé teinté par le rang sur une base NEUTRE (oklch L 0 0
  // — comme applyRankTheme, pour que le métal perçu soit vraiment celui du rang,
  // sans teinte parasite), + bloom de lumière unique en haut (source cohérente).
  const mix = amb.surfaceMix;
  const plateSurface =
    `radial-gradient(120% 85% at 50% -18%, color-mix(in oklch, ${theme.secondary} 42%, transparent), transparent 58%),` +
    `linear-gradient(158deg,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 22}%, oklch(0.22 0 0)) 0%,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 10}%, oklch(0.16 0 0)) 52%,` +
    ` color-mix(in oklch, ${theme.primary} ${Math.max(mix - 6, 0)}%, oklch(0.1 0 0)) 100%)`;

  // Épaisseur (poids = ombre portée neutre) + biseau/relief PAR RANG (rankRelief,
  // netteté = reliefAlpha) + liseré forgé teinté + halo du rang (profondeur).
  const plateShadow = [
    "0 24px 54px -22px rgba(0,0,0,0.8)",
    "0 8px 18px -12px rgba(0,0,0,0.55)",
    rankRelief(theme, amb.reliefAlpha),
    rankRingInset(theme.secondary, "45"),
    rankGlowShadow(theme.glow, 0, 0, Math.round(amb.shadowBlur * 0.7)),
  ].join(", ");

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Progression RPG
        </h2>
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-[22px]" />}

      {!isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className="relative overflow-hidden rounded-[22px] p-4"
          style={{ background: plateSurface, boxShadow: plateShadow }}
        >
          {/* Grain martelé du rang courant (grossier/pierre → fin/cristal). */}
          <div aria-hidden className="bg-rank-grain pointer-events-none absolute inset-0" />
          {/* Respiration TRÈS discrète de la lumière — rythme propre au rang. */}
          <div
            aria-hidden
            className="animate-rank-breathe pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(110% 60% at 50% -10%, rgba(255,255,255,0.1), transparent 60%)",
            }}
          />
          {/* Reflet forgé qui passe (cuivré, cristallin… selon le rang). */}
          <div
            aria-hidden
            className="rank-glint-layer pointer-events-none absolute inset-0 opacity-40"
          />

          {/* Champ intérieur en creux : la gravure se lit « dans » le métal. */}
          <div
            className="relative rounded-[16px] px-4 py-4"
            style={{
              background: "rgba(0,0,0,0.16)",
              boxShadow: `inset 0 3px 10px -3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(0,0,0,0.4), ${rankRingInset(theme.primary, "22")}`,
            }}
          >
            {/* Grade actuel — libellé gravé (creux) + nom en inlay lumineux. */}
            <div className="text-center">
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.32em]"
                style={{
                  // Lettrage estampé (clair + ombre basse) : lisible sur métal
                  // sombre, là où une gravure pleine (sombre) disparaîtrait.
                  color: "rgba(255,255,255,0.52)",
                  textShadow: "0 1px 1px rgba(0,0,0,0.6)",
                }}
              >
                Grade actuel
              </p>
              <p
                className="mt-1 text-[18px] font-black uppercase tracking-[0.12em]"
                style={{
                  color: theme.text,
                  textShadow: rankTextGlow(theme.glow, 14, "0 1px 0 rgba(0,0,0,0.55)"),
                }}
              >
                {currentGrade}
              </p>
            </div>

            {/* Barre gravée dans la plaque puis remplie de l'énergie du rang. */}
            <div
              className="relative mt-4 h-3 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.round(clampedPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.34))",
                boxShadow: `inset 0 2px 6px rgba(0,0,0,0.78), inset 0 -1px 0 ${theme.secondary}22`,
              }}
            >
              <div
                className="relative h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${clampedPercent}%`,
                  background: theme.gradient,
                  // Halo chaud VALIDE (0 0 blur) + reflet haut / creux bas :
                  // l'énergie semble coulée dans le sillon gravé.
                  boxShadow: `${rankGlowShadow(theme.glow, 0, 0, 12)}, inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.4)`,
                }}
              >
                {clampedPercent > 4 && clampedPercent < 100 && (
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

            {/* XP restante — la raison de revenir. Valeurs en inlay du rang. */}
            <p
              className="mt-3 text-center text-[12px] font-semibold"
              style={{ color: "rgba(255,255,255,0.66)", textShadow: "0 1px 1px rgba(0,0,0,0.5)" }}
            >
              {progress.isMax || !nextGrade ? (
                <span style={{ color: theme.secondary }}>Grade suprême atteint</span>
              ) : (
                <>
                  Plus que{" "}
                  <span className="font-black" style={{ color: theme.secondary }}>
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
        </motion.div>
      )}
    </section>
  );
}
