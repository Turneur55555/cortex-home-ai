import { useId } from "react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { rankGlowShadow, rankThemeByKey, rankTextGlow } from "@/components/rpg/rankTheme";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
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
  /** Nombre de records personnels battus pendant cette séance (système
   *  existant `computeRecordsBySession` — jamais recalculé ici). */
  prCount: number;
  rankKey: RankKey;
  rankLabel: string;
  grade: string;
  variant?: "screen" | "export";
}

const MAX_EXERCISES = { screen: 6, export: 9 } as const;

export function SessionRecapCard({
  recap,
  dateLabel,
  prCount,
  rankKey,
  rankLabel,
  grade,
  variant = "screen",
}: SessionRecapCardProps) {
  const theme = rankThemeByKey(rankKey);
  const glowFilterId = useId();
  const max = MAX_EXERCISES[variant];
  // Une ligne par exercice réellement réalisé — jamais un exercice à 0 série.
  const performed = recap.exercises.filter((ex) => ex.sets > 0);
  const shown = performed.slice(0, max);
  const hidden = performed.length - shown.length;

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
      {/* Éclairs d'ambiance — derrière le contenu uniquement, très discrets,
          teintés par la couleur officielle du rang (RankTheme, jamais une
          couleur inventée). Purement décoratif : `pointer-events-none`, et
          les blocs de contenu (fond opaque) les recouvrent naturellement là
          où ça compte pour la lecture. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 300 500"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          stroke={theme.secondary}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowFilterId})`}
          opacity={0.09}
        >
          {/* Cantonnés aux marges extérieures et coupés avant la liste
              d'exercices — jamais derrière le texte dense. */}
          <path d="M14 -10 L26 55 L10 62 L22 118" />
          <path d="M286 5 L272 70 L288 78 L274 132" />
          <path d="M12 340 L26 395 L10 403 L24 458" />
          <path d="M288 355 L274 405 L290 413 L276 470" />
        </g>
      </svg>

      <div className={variant === "export" ? "relative px-6 py-6" : "relative px-5 py-5"}>
        {/* En-tête — titre + date, centrés, forte présence visuelle */}
        <div className="text-center">
          <p className="text-[15px] font-black uppercase tracking-[0.24em] text-white/55">
            Récapitulatif
          </p>
          <p
            className="mt-1 text-[20px] font-black uppercase leading-tight tracking-wide text-white"
            style={{ textShadow: rankTextGlow(theme.glow, 14) }}
          >
            {dateLabel}
          </p>
        </div>

        {/* Totaux */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="Séries" value={String(recap.totalSets)} theme={theme} />
          <Stat label="Records" value={String(prCount)} theme={theme} highlight={prCount > 0} />
          <Stat
            label="Volume"
            value={`${recap.totalVolumeKg.toLocaleString("fr-FR")} kg`}
            theme={theme}
          />
        </div>

        {/* Exercices réalisés — nom + nombre de séries, aucune icône */}
        <div className="mt-4 space-y-2">
          {shown.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-2.5"
            >
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                {ex.name}
              </p>
              <p className="shrink-0 text-[11px] font-bold text-white/50">
                {ex.sets} {ex.sets > 1 ? "séries" : "série"}
              </p>
            </div>
          ))}
          {hidden > 0 && (
            <p className="pt-0.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              +{hidden} exercice{hidden > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Bandeau rang / grade — élément fort de la carte : asset à gauche,
          rang au centre, grade à droite. */}
      <div
        className="relative flex items-center gap-3 border-t border-white/10 px-5 py-5"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.4))" }}
      >
        <div
          className="h-[88px] w-[72px] shrink-0 overflow-hidden rounded-2xl"
          style={{ boxShadow: rankGlowShadow(theme.glow, 6, 24, -12) }}
        >
          <RankIllustration rankKey={rankKey} label={rankLabel} className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <Tag
            label="Rang"
            value={rankLabel}
            color={theme.secondary}
            glow={theme.glow}
            align="center"
          />
          <div className="h-10 w-px shrink-0 bg-white/15" />
          <Tag label="Grade" value={grade} color="#ffffff" align="right" />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  theme,
  highlight = false,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof rankThemeByKey>;
  /** Léger accent (liseré + glow renforcé) — utilisé pour Records > 0. */
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-2 py-2.5 text-center"
      style={{
        borderColor: highlight ? `${theme.secondary}55` : "rgba(255,255,255,0.08)",
        background: highlight ? `${theme.secondary}14` : "rgba(255,255,255,0.04)",
      }}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">{label}</p>
      <p
        className="mt-0.5 text-[22px] font-black leading-none tracking-tight"
        style={{
          color: theme.secondary,
          textShadow: rankTextGlow(theme.glow, highlight ? 26 : 18),
        }}
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
  align,
}: {
  label: string;
  value: string;
  color: string;
  glow?: string;
  align: "center" | "right";
}) {
  return (
    <div className={`min-w-0 flex-1 ${align === "center" ? "text-center" : "text-right"}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35">{label}</p>
      <p
        className="break-words text-[16px] font-black uppercase leading-tight tracking-wide"
        style={{ color, textShadow: glow ? rankTextGlow(glow, 18) : undefined }}
      >
        {value}
      </p>
    </div>
  );
}
