import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Flame, Dumbbell, Sparkles, Trophy } from "lucide-react";
import { useUserStats } from "@/hooks/useUserStats";
import { useWorkouts } from "@/hooks/use-fitness";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { useRankPromotions } from "@/hooks/useRankPromotions";
import { useCortexAscensions } from "@/hooks/useCortexAscensions";
import { useCortexPower } from "@/hooks/useCortexPower";
import { mergePromotionTimeline } from "@/lib/fitness/rpg/ascension";
import { nextCortexGradeLabel } from "@/lib/fitness/rpg/cortexTitle";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { Skeleton } from "@/components/ui/skeleton";
import { PromotionHistoryTimeline } from "@/components/profile/rpg/PromotionHistoryTimeline";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import {
  rankGlowShadow,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";

/**
 * Page dédiée « Progression RPG » — fiche joueur AAA.
 *
 * Audit RPG V2 Phase H (30/08/2026) : l'en-tête (illustration/Titre/grade/
 * barre) affichait encore le Titre dérivé de l'XP (`titleProgressForXp`,
 * `user_stats.xp`) — dernier écran de l'app encore branché sur ce chemin
 * legacy. Corrigé : source unique désormais `useCortexPower` (Performance
 * → Rang exercice → Rang musculaire → Puissance Cortex → Titre), comme
 * Accueil/Profil/séance (`ProfileHeroCard`, `RPGProgressionSection`). L'XP
 * reste affichée (carte "XP totale", stat "Séries") comme système de
 * récompense PARALLÈLE — elle ne pilote plus jamais le Titre ni la barre
 * de progression ici. L'historique fusionne l'historique gelé de l'ère XP
 * (`rank_promotions`, plus aucune écriture) et les nouvelles Ascensions
 * (`cortex_ascensions`, Puissance Cortex — voir `mergePromotionTimeline`).
 */
export const Route = createFileRoute("/_authenticated/progression")({
  head: () => ({
    meta: [
      { title: "Progression RPG — ICORTEX" },
      { name: "description", content: "Ta fiche de progression RPG complète." },
    ],
  }),
  component: ProgressionPage,
});

function ProgressionPage() {
  const { data: userStats } = useUserStats();
  const { data: workouts } = useWorkouts();
  const { current: streak } = useActivityStreak();
  const { data: legacyRows } = useRankPromotions();
  const { data: ascensions } = useCortexAscensions();
  const promotionEvents = mergePromotionTimeline(legacyRows ?? [], ascensions ?? []);

  // Source unique du Titre : Puissance Cortex (Performance → Rang exercice
  // → Rang musculaire → Puissance Cortex → Titre), JAMAIS l'XP — même
  // moteur que ProfileHeroCard/RPGProgressionSection.
  const { isLoading: powerLoading, title: progress } = useCortexPower();
  const ranked = progress.status === "ranked" ? progress : null;
  const nextGrade = nextCortexGradeLabel(progress);
  // Puissance Cortex est un palier discret (0-29), pas continu comme l'XP :
  // la barre reflète la position parmi les 5 grades du Titre courant, pas
  // une distance fractionnaire (règle RPG : aucune "XP restante" affichée
  // pour la Puissance Cortex).
  const clampedPercent = !ranked ? 0 : ranked.isMax ? 100 : ((ranked.gradeIndex + 1) / 5) * 100;
  const theme = rankThemeByKey(ranked?.title.key ?? "mortel");

  // XP : système de récompense PARALLÈLE, affiché mais ne pilote plus ni
  // le Titre ni la barre de progression ci-dessous.
  const xp = userStats?.xp ?? 0;

  const totalWorkouts = workouts?.length ?? 0;
  const totalMinutes = (workouts ?? []).reduce(
    (sum, w: { duration_minutes?: number | null }) => sum + (w.duration_minutes ?? 0),
    0,
  );

  return (
    <main className="flex flex-1 flex-col pb-8 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.375rem))]">
      {/* Header nav — retour discret, pas de titre bruyant */}
      <div className="flex items-center px-4 pb-3">
        <Link
          to="/"
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Progression RPG
        </h1>
      </div>

      <div className="flex flex-col gap-5 px-5">
        {/* ── EN-TÊTE : illustration + rang + grade ─────────────── */}
        {/* Pas de carte : l'asset flotte directement sur le fond de page —
            aucun panneau/fond/ombre/bordure/padding/coin arrondi derrière lui
            (validé par Nathan). Seuls le texte du rang/grade et l'espacement
            avec la carte Progression ci-dessous sont conservés. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className="flex flex-col items-center"
        >
          {powerLoading ? (
            <Skeleton className="aspect-[4/5] w-44 rounded-[22px]" />
          ) : ranked ? (
            <>
              <div className="relative aspect-[4/5] w-44">
                <RankIllustration
                  rankKey={ranked.title.key}
                  label={ranked.title.label}
                  className="h-full w-full"
                />
              </div>
              <p
                className="mt-4 text-[22px] font-black uppercase tracking-[0.22em]"
                style={{
                  color: theme.text,
                  textShadow: rankTextGlow(theme.glow, 18, "0 1px 0 rgba(0,0,0,0.6)"),
                }}
              >
                {ranked.title.label}
              </p>
              <p
                className="mt-1 text-[13px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: theme.secondary }}
              >
                {ranked.grade}
              </p>
            </>
          ) : (
            // Non classé (pas assez de données) ou Puissance Cortex partielle
            // (< 5/8 muscles évalués) : jamais un Titre par défaut ("Mortel")
            // qui flasherait avant la vraie valeur (règle RPG).
            <div className="flex flex-col items-center py-6 text-center">
              <p className="text-[16px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                {progress.status === "partial" ? "Puissance Cortex partielle" : "Non classé"}
              </p>
              <p className="mt-2 max-w-[260px] text-[12px] text-muted-foreground">
                {progress.status === "partial"
                  ? "Continue à t'entraîner pour évaluer suffisamment de muscles et débloquer ton Titre."
                  : "Entraîne-toi pour obtenir tes premiers Rangs d'exercice et débloquer ton Titre."}
              </p>
            </div>
          )}
        </motion.section>

        {/* ── XP TOTALE ───────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[22px] p-5 text-center bg-white/[0.03] ring-1 ring-white/5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/80">
            XP totale
          </p>
          <p
            className="mt-2 text-[44px] font-black leading-none tracking-tight"
            style={{
              color: theme.text,
              textShadow: rankTextGlow(theme.glow, 22, "0 1px 0 rgba(0,0,0,0.55)"),
            }}
          >
            {formatXp(xp)}
            <span
              className="ml-2 text-[16px] font-bold uppercase tracking-wider"
              style={{ color: theme.secondary }}
            >
              XP
            </span>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">Depuis la création du compte</p>
        </section>

        {/* ── PROGRESSION ACTUELLE (Puissance Cortex) ─────────── */}
        <section className="rounded-[22px] p-5 bg-white/[0.03] ring-1 ring-white/5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/80">
            Grade actuel
          </p>
          <p
            className="mt-1 text-[18px] font-black uppercase tracking-[0.12em]"
            style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 12) }}
          >
            {ranked?.grade ?? "—"}
          </p>

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
                boxShadow: `${rankGlowShadow(theme.glow, 0, 0, 12)}, inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.4)`,
              }}
            />
          </div>

          {/* Pas de compte à rebours chiffré : la Puissance Cortex se révèle
              par accomplissement (nouveau Rang d'exercice/musculaire),
              jamais par une distance fractionnaire type "XP restante"
              (règle RPG, aucune XP affichée pour cette progression-ci). */}
          <p
            className="mt-3 text-center text-[12px] font-semibold"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {ranked?.isMax || !nextGrade ? (
              <span style={{ color: theme.secondary }}>Grade suprême atteint</span>
            ) : (
              <>
                Prochain grade :{" "}
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ color: theme.secondary }}
                >
                  {nextGrade}
                </span>
              </>
            )}
          </p>
        </section>

        {/* ── STATISTIQUES RPG ────────────────────────────────── */}
        <section>
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Statistiques
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCell
              icon={<Sparkles className="h-4 w-4" />}
              label="XP totale"
              value={formatXp(xp)}
              theme={theme}
            />
            <StatCell
              icon={<Dumbbell className="h-4 w-4" />}
              label="Séances"
              value={String(totalWorkouts)}
              theme={theme}
            />
            <StatCell
              icon={<Flame className="h-4 w-4" />}
              label="Série actuelle"
              value={`${streak} j`}
              theme={theme}
            />
            <StatCell
              icon={<Trophy className="h-4 w-4" />}
              label="Temps d'entraînement"
              value={formatDuration(totalMinutes)}
              theme={theme}
            />
          </div>
        </section>

        {/* ── HISTORIQUE DES PROMOTIONS (seule chronologie officielle) ── */}
        <section>
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Historique des promotions
          </h2>
          <PromotionHistoryTimeline events={promotionEvents ?? []} />
        </section>
      </div>
    </main>
  );
}

function StatCell({
  icon,
  label,
  value,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  theme: ReturnType<typeof rankThemeByKey>;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 bg-white/[0.03]"
      style={{ boxShadow: rankRingInset(theme.secondary, "22") }}
    >
      <div className="flex items-center gap-1.5" style={{ color: theme.secondary }}>
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className="mt-2 text-[22px] font-black tracking-tight"
        style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 10) }}
      >
        {value}
      </p>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}
