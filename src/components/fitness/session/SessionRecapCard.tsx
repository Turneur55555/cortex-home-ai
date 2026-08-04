import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankGlowShadow, rankThemeByKey, rankTextGlow } from "@/components/rpg/rankTheme";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import type { SessionRecap } from "@/lib/fitness/rpg/sessionRecap";

/**
 * Carte récapitulative de fin de séance — 2e écran du flow de clôture
 * (après l'écran XP/progression, qui reste inchangé).
 *
 * Purement présentationnelle : toutes les valeurs viennent du snapshot de
 * la séance (`buildSessionRecap`) et du système de rang existant
 * (titleProgress + RankIllustration + RankTheme). Aucun XP, aucune durée,
 * aucune barre de progression ici — c'est l'objet partageable.
 *
 * `variant="export"` : même carte, densité légèrement augmentée, pour le
 * rendu 9:16 capturé lors du partage.
 */
export interface SessionRecapCardProps {
  recap: SessionRecap;
  dateLabel: string;
  /** URLs signées des photos perso d'exercices (clé = image_path). */
  imageUrls?: Map<string, string>;
  rankKey: RankKey;
  rankLabel: string;
  grade: string;
  variant?: "screen" | "export";
}

const MAX_EXERCISES = { screen: 5, export: 7 } as const;

export function SessionRecapCard({
  recap,
  dateLabel,
  imageUrls,
  rankKey,
  rankLabel,
  grade,
  variant = "screen",
}: SessionRecapCardProps) {
  const theme = rankThemeByKey(rankKey);
  const max = MAX_EXERCISES[variant];
  const shown = recap.exercises.slice(0, max);
  const hidden = recap.exercises.length - shown.length;

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-[26px] border border-white/10"
      style={{
        background: [
          `radial-gradient(120% 70% at 50% 0%, ${theme.glow} 0%, transparent 62%)`,
          "linear-gradient(180deg, #161311 0%, #0b0a09 100%)",
        ].join(", "),
        boxShadow: rankGlowShadow(theme.glow, -10, 60, -28),
      }}
    >
      <div className={variant === "export" ? "px-6 py-6" : "px-5 py-5"}>
        {/* En-tête — date seule */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">
          Récapitulatif
        </p>
        <p className="mt-1 text-sm font-bold capitalize text-white/90">{dateLabel}</p>

        {/* Totaux */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Stat label="Séries" value={String(recap.totalSets)} theme={theme} />
          <Stat
            label="Volume"
            value={`${recap.totalVolumeKg.toLocaleString("fr-FR")} kg`}
            theme={theme}
          />
        </div>

        {/* Exercices réalisés */}
        <div className="mt-4 space-y-2">
          {shown.map((ex) => {
            const src =
              (ex.imagePath ? imageUrls?.get(ex.imagePath) : null) ?? exerciseIllustration(ex.name);
            return (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      crossOrigin="anonymous"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                  {ex.name}
                </p>
                <p className="shrink-0 text-[11px] font-bold text-white/50">
                  {ex.sets} {ex.sets > 1 ? "séries" : "série"}
                </p>
              </div>
            );
          })}
          {hidden > 0 && (
            <p className="pt-0.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              +{hidden} exercice{hidden > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Bandeau rang / grade */}
      <div
        className="flex items-center gap-3 border-t border-white/10 px-5 py-3"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.35))" }}
      >
        <div
          className="h-11 w-9 shrink-0 overflow-hidden rounded-lg"
          style={{ boxShadow: rankGlowShadow(theme.glow, 4, 16, -10) }}
        >
          <RankIllustration rankKey={rankKey} label={rankLabel} className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Tag label="Rang" value={rankLabel} color={theme.secondary} glow={theme.glow} />
          <div className="h-6 w-px bg-white/15" />
          <Tag label="Grade" value={grade} color="#ffffff" />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof rankThemeByKey>;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">{label}</p>
      <p
        className="mt-0.5 text-[22px] font-black leading-none tracking-tight"
        style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 18) }}
      >
        {value}
      </p>
    </div>
  );
}

function Tag({
  label,
  value,
  color,
  glow,
}: {
  label: string;
  value: string;
  color: string;
  glow?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-semibold uppercase tracking-[0.25em] text-white/35">{label}</p>
      <p
        className="truncate text-[13px] font-black uppercase tracking-wide"
        style={{ color, textShadow: glow ? rankTextGlow(glow, 16) : undefined }}
      >
        {value}
      </p>
    </div>
  );
}
