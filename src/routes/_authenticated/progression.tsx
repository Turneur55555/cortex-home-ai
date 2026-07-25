import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Flame, Dumbbell, Sparkles, Trophy, Lock, Check } from "lucide-react";
import { useUserStats } from "@/hooks/useUserStats";
import { useWorkouts } from "@/hooks/use-fitness";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { titleProgressForXp, nextGradeLabel } from "@/lib/fitness/rpg/titleProgress";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { RANK_TIERS } from "@/lib/fitness/exerciseRanks";
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
 * Page dédiée « Progression RPG » — fiche joueur AAA.
 * Aucune donnée inventée : tout est dérivé de user_stats.xp (Titre/Grade),
 * useWorkouts (nb de séances), useActivityStreak (série en cours). Les
 * sections sans données réelles (promotions) affichent un état vide propre.
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

  const xp = userStats?.xp ?? 0;
  const progress = titleProgressForXp(xp);
  const theme = rankThemeByKey(progress.title.key);
  const amb = RANK_AMBIANCE[progress.title.key];
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

  const totalWorkouts = workouts?.length ?? 0;
  const totalMinutes = (workouts ?? []).reduce(
    (sum, w: { duration_minutes?: number | null }) => sum + (w.duration_minutes ?? 0),
    0,
  );

  // Surface forgée (même recette que la carte de la home, pour cohérence).
  const mix = amb.surfaceMix;
  const plateSurface =
    `radial-gradient(120% 85% at 50% -18%, color-mix(in oklch, ${theme.secondary} 42%, transparent), transparent 58%),` +
    `linear-gradient(158deg,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 22}%, oklch(0.22 0 0)) 0%,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 10}%, oklch(0.16 0 0)) 52%,` +
    ` color-mix(in oklch, ${theme.primary} ${Math.max(mix - 6, 0)}%, oklch(0.1 0 0)) 100%)`;

  const plateShadow = [
    "0 24px 54px -22px rgba(0,0,0,0.8)",
    "0 8px 18px -12px rgba(0,0,0,0.55)",
    rankRelief(theme, amb.reliefAlpha),
    rankRingInset(theme.secondary, "45"),
    rankGlowShadow(theme.glow, 0, 0, Math.round(amb.shadowBlur * 0.7)),
  ].join(", ");

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
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className="relative overflow-hidden rounded-[24px] p-5"
          style={{ background: plateSurface, boxShadow: plateShadow }}
        >
          <div aria-hidden className="bg-rank-grain pointer-events-none absolute inset-0" />
          <div
            aria-hidden
            className="rank-glint-layer pointer-events-none absolute inset-0 opacity-40"
          />
          <div className="relative flex flex-col items-center">
            <div
              className="relative h-40 w-40 overflow-hidden rounded-[20px]"
              style={{
                boxShadow: `${rankRingInset(theme.secondary, "55")}, ${rankGlowShadow(theme.glow, 0, 32, -8)}`,
                background: "rgba(0,0,0,0.25)",
              }}
            >
              <RankIllustration
                rankKey={progress.title.key}
                label={progress.title.label}
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
              {progress.title.label}
            </p>
            <p
              className="mt-1 text-[13px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: theme.secondary }}
            >
              {progress.grade}
            </p>
          </div>
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

        {/* ── PROGRESSION ACTUELLE ────────────────────────────── */}
        <section className="rounded-[22px] p-5 bg-white/[0.03] ring-1 ring-white/5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/80">
            Grade actuel
          </p>
          <p
            className="mt-1 text-[18px] font-black uppercase tracking-[0.12em]"
            style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 12) }}
          >
            {progress.grade}
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

          <p
            className="mt-3 text-center text-[12px] font-semibold"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {progress.isMax || !nextGrade ? (
              <span style={{ color: theme.secondary }}>Grade suprême atteint</span>
            ) : (
              <>
                Encore{" "}
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

        {/* ── HISTORIQUE DE PROGRESSION (ladder des rangs) ───── */}
        <section>
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Historique de progression
          </h2>
          <div className="flex flex-col gap-2">
            {RANK_TIERS.map((tier, idx) => {
              const isDone = idx < progress.titleIndex;
              const isCurrent = idx === progress.titleIndex;
              const isLocked = idx > progress.titleIndex;
              const tTheme = rankThemeByKey(tier.key);
              return (
                <div
                  key={tier.key}
                  className="flex items-center gap-3 rounded-2xl p-3"
                  style={{
                    background: isCurrent
                      ? `linear-gradient(90deg, ${tTheme.primary}22, transparent)`
                      : "rgba(255,255,255,0.03)",
                    boxShadow: isCurrent
                      ? `${rankRingInset(tTheme.secondary, "60")}, ${rankGlowShadow(tTheme.glow, 0, 18, -8)}`
                      : "inset 0 0 0 1px rgba(255,255,255,0.05)",
                    opacity: isLocked ? 0.42 : 1,
                    filter: isLocked ? "grayscale(0.8)" : undefined,
                  }}
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/30">
                    <RankIllustration
                      rankKey={tier.key}
                      label={tier.label}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[13px] font-black uppercase tracking-[0.18em]"
                      style={{ color: isLocked ? "rgba(255,255,255,0.55)" : tTheme.text }}
                    >
                      {tier.label}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {isDone ? "Rang atteint" : isCurrent ? "En cours" : "Verrouillé"}
                    </p>
                  </div>
                  <div className="shrink-0 text-muted-foreground">
                    {isDone && <Check className="h-4 w-4" style={{ color: tTheme.secondary }} />}
                    {isLocked && <Lock className="h-4 w-4" />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── HISTORIQUE DES PROMOTIONS (structure prête) ────── */}
        <section>
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Historique des promotions
          </h2>
          <div className="rounded-2xl bg-white/[0.03] p-5 text-center ring-1 ring-white/5">
            <p className="text-[12px] text-muted-foreground">
              Chaque nouvelle promotion sera consignée ici.
            </p>
          </div>
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
