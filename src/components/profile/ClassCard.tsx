import { useMemo, useState } from "react";
import { ChevronRight, Sparkles, Swords } from "lucide-react";
import { AppSheet } from "@/components/profile/AppSheet";
import { computeCharacterClass, type CharacterClassResult } from "@/lib/profile/characterClass";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import { gradeName } from "@/lib/fitness/rpg/grade";
import { useUserStats } from "@/hooks/useUserStats";
import { titleProgressForXp } from "@/lib/fitness/rpg/titleProgress";
import {
  RANK_AMBIANCE,
  rankGlowShadow,
  rankRelief,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";

interface WorkoutLike {
  date: string;
  exercises: Array<{
    name: string;
    weight: number | null;
    sets: number | null;
    reps: number | null;
  }>;
}

interface Props {
  workouts: WorkoutLike[];
  rankAggregate: RankAggregate;
}

/**
 * Classe principale — ARTEFACT forgé dans la matière du rang courant, même
 * philosophie que la carte Progression RPG (direction « Artefact »). La façade
 * ne porte aucune statistique : tout l'explicatif (pourquoi cette classe,
 * quelles données, comment évoluer) vit dans le bottom sheet ouvert au tap.
 * Structure fonctionnelle inchangée — seule la direction artistique évolue.
 *
 * Toute la matière (surface, relief, biseau, gravure, reflets, grain,
 * profondeur, lumière) est pilotée par RankTheme + `RANK_AMBIANCE` : passer
 * d'un rang à l'autre reforge l'objet (pierre → cuivre → acier → basalte/lave
 * → or → cristal), ce n'est pas une simple recoloration. Les couleurs de rang
 * transitent par les helpers `rankTheme`, jamais réassemblées à la main.
 *
 * Aucune nouvelle règle métier : la classe vient de `computeCharacterClass`
 * (volume × moteur Rang existant), le rang courant de l'XP globale
 * (`titleProgress`) — exactement comme Progression RPG, pour un accueil
 * cohérent, entièrement reforgé dans la même matière.
 *
 * NB (dette assumée) : les formules de matière ci-dessous reprennent celles de
 * `RPGProgressionSection` — elles seront unifiées dans le composant
 * réutilisable (`ForgedCard`) une fois la direction validée. Progression RPG
 * n'est volontairement pas touchée pour l'instant.
 */
export function ClassCard({ workouts, rankAggregate }: Props) {
  const [open, setOpen] = useState(false);
  const { data: userStats } = useUserStats();

  const result = useMemo(
    () => computeCharacterClass(workouts, rankAggregate.reports),
    [workouts, rankAggregate.reports],
  );

  // Matière du rang courant (couleurs RankTheme + profil de matériau RANK_AMBIANCE).
  const progress = titleProgressForXp(userStats?.xp ?? 0);
  const theme = rankThemeByKey(progress.title.key);
  const amb = RANK_AMBIANCE[progress.title.key];
  const mix = amb.surfaceMix;
  const plateSurface =
    `radial-gradient(120% 120% at 50% -30%, color-mix(in oklch, ${theme.secondary} 42%, transparent), transparent 60%),` +
    `linear-gradient(158deg,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 22}%, oklch(0.22 0 0)) 0%,` +
    ` color-mix(in oklch, ${theme.primary} ${mix + 10}%, oklch(0.16 0 0)) 55%,` +
    ` color-mix(in oklch, ${theme.primary} ${Math.max(mix - 6, 0)}%, oklch(0.1 0 0)) 100%)`;
  const plateShadow = [
    "0 20px 44px -20px rgba(0,0,0,0.78)",
    "0 6px 14px -10px rgba(0,0,0,0.5)",
    rankRelief(theme, amb.reliefAlpha),
    rankRingInset(theme.secondary, "45"),
    rankGlowShadow(theme.glow, 0, 0, Math.round(amb.shadowBlur * 0.6)),
  ].join(", ");

  if (!result) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative mb-3 w-full overflow-hidden rounded-[20px] p-2.5 text-left transition-transform active:scale-[0.99]"
        style={{ background: plateSurface, boxShadow: plateShadow }}
      >
        {/* Grain martelé + respiration de lumière + reflet — propres au rang. */}
        <span aria-hidden className="bg-rank-grain pointer-events-none absolute inset-0" />
        <span
          aria-hidden
          className="animate-rank-breathe pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,0.1), transparent 60%)",
          }}
        />
        <span
          aria-hidden
          className="rank-glint-layer pointer-events-none absolute inset-0 opacity-40"
        />

        {/* Champ en creux : la gravure se lit « dans » le métal. */}
        <span
          className="relative flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5"
          style={{
            background: "rgba(0,0,0,0.16)",
            boxShadow: `inset 0 3px 9px -3px rgba(0,0,0,0.68), inset 0 1px 0 rgba(0,0,0,0.4), ${rankRingInset(theme.primary, "22")}`,
          }}
        >
          <span className="flex min-w-0 items-center gap-3">
            {/* Sceau découpé dans le même métal (chip en creux, teinté rang). */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
              style={{
                background: "rgba(0,0,0,0.24)",
                boxShadow: `inset 0 2px 5px rgba(0,0,0,0.6), inset 0 -1px 0 ${theme.secondary}2e, ${rankRingInset(theme.secondary, "3a")}`,
                color: theme.text,
              }}
            >
              <Swords
                className="h-4 w-4"
                style={{ filter: `drop-shadow(0 0 6px ${theme.glow})` }}
              />
            </span>
            <span className="min-w-0">
              <span
                className="block text-[9px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: "rgba(255,255,255,0.52)", textShadow: "0 1px 1px rgba(0,0,0,0.6)" }}
              >
                Classe principale
              </span>
              <span
                className="block truncate text-base font-black tracking-tight"
                style={{
                  color: theme.text,
                  textShadow: rankTextGlow(theme.glow, 12, "0 1px 0 rgba(0,0,0,0.55)"),
                }}
              >
                {result.className}
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.5)" }} />
        </span>
      </button>

      <ClassDetailSheet open={open} onOpenChange={setOpen} result={result} />
    </>
  );
}

function ClassDetailSheet({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CharacterClassResult;
}) {
  const secondFamily = result.breakdown[1] ?? null;
  const accentColor = result.bestRankInFamily?.rank.colors.secondary;

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={result.className}
      description="Comment cette classe a été déterminée"
      size="full"
    >
      <div className="space-y-5 pb-4 pt-2">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pourquoi cette classe ?
          </h3>
          <p className="text-sm leading-relaxed text-foreground/90">
            <strong>{result.dominantShare}%</strong> de ton volume d'entraînement loggé porte sur
            des mouvements de la famille associée à « {result.className} »
            {result.breakdown[0]?.topExerciseName && (
              <>
                {" "}
                — principalement via <strong>{result.breakdown[0].topExerciseName}</strong>
              </>
            )}
            . C'est la famille la mieux représentée dans ton historique de séances.
          </p>
          {result.bestRankInFamily && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
              Ton meilleur rang dans cette famille :{" "}
              <strong>
                {result.bestRankInFamily.rank.label} —{" "}
                {gradeName(result.bestRankInFamily.rank.key, result.bestRankInFamily.levelInRank)}
              </strong>
              .
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Répartition de ton volume
          </h3>
          <div className="space-y-2">
            {result.breakdown.slice(0, 6).map((f) => (
              <div
                key={f.family}
                className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground/90">
                    {f.className}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                    {f.share}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${f.share}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {f.sessionsCount} séance{f.sessionsCount > 1 ? "s" : ""} · {f.exerciseCount}{" "}
                  exercice{f.exerciseCount > 1 ? "s" : ""}
                  {f.bestRank &&
                    ` · ${f.bestRank.rank.label} — ${gradeName(f.bestRank.rank.key, f.bestRank.levelInRank)}`}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Comment évoluer
              </h3>
              <p className="text-xs leading-relaxed text-foreground/80">
                Continue à travailler les mouvements de <strong>{result.className}</strong> pour
                renforcer cette spécialisation et progresser vers un rang supérieur.
              </p>
              {secondFamily && (
                <p className="text-xs leading-relaxed text-foreground/80">
                  Pour diversifier, augmente la part de <strong>{secondFamily.className}</strong>{" "}
                  (actuellement {secondFamily.share}% de ton volume) — assez de séances dans cette
                  famille peut en faire ta nouvelle classe principale.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppSheet>
  );
}
