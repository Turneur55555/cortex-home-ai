import { motion } from "framer-motion";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";

/**
 * La Forge — même identité visuelle que Sensei^IA (même matériau : verre
 * teinté, même halo doré, même filet lumineux, même hiérarchie
 * typographique, même niveau de finition), avec une seule différence
 * volontaire : l'illustration officielle du Rang global (même source que
 * `ProfileHeroCard` — RankIllustration, Titre piloté par l'XP globale)
 * remplace l'espace normalement laissé vide par l'absence d'icône, pour
 * rappeler en un coup d'œil "ce que tu es en train de forger".
 */
export function LaForgeCard({ onClick }: { onClick: () => void }) {
  const { data: userStats } = useUserStats();
  // `userStats` n'est `undefined` que sans aucun rang confirmé en cache
  // (tout premier lancement) — dans ce seul cas, ne pas inventer de rang.
  const rank = userStats ? toRankState(titleProgressForXp(userStats.xp).tierIndex, 0) : null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Ouvrir la Forge"
      className="group relative block w-full overflow-hidden rounded-[24px] border border-white/[0.08] p-5 text-left shadow-card transition-colors hover:border-white/[0.16]"
      style={{
        background:
          "radial-gradient(120% 80% at 20% 0%, rgba(234,179,8,0.10) 0%, transparent 55%), radial-gradient(80% 70% at 100% 100%, rgba(148,163,184,0.06) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      }}
    >
      {/* Filet doré discret en haut — même langage que Sensei^IA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(234,179,8,0.55), transparent)",
        }}
      />
      {/* Halo doré très discret suivant le hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: "radial-gradient(80% 60% at 20% 0%, rgba(234,179,8,0.14), transparent 60%)",
        }}
      />

      <div className="relative flex items-center gap-4">
        <div className="relative aspect-[4/5] w-11 shrink-0 overflow-hidden rounded-xl shadow-elevated">
          {rank ? (
            <RankIllustration
              rankKey={rank.rank.key}
              label={rank.rank.label}
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <div className="absolute inset-0 h-full w-full animate-pulse bg-white/5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-serif text-[26px] font-semibold italic leading-none tracking-wide text-white">
            La Forge
          </p>

          <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-white/70">
            Choisis les techniques qui forgeront ta prochaine épreuve.
          </p>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Toucher pour forger
          </p>
        </div>
      </div>
    </motion.button>
  );
}
