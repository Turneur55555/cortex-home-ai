import { motion } from "framer-motion";
import { ArrowRight, Star, Trophy } from "lucide-react";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import {
  rankGlowShadow,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import { formatXp } from "@/lib/fitness/rpg/grade";
import type { PromotionTimelineEvent } from "@/lib/fitness/rpg/ascension";

function formatPromotionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Carte "legacy" (ère XP, historique gelé — rendu inchangé). */
function LegacyCard({
  event,
  index,
}: {
  event: Extract<PromotionTimelineEvent, { source: "legacy" }>;
  index: number;
}) {
  const theme = rankThemeByKey(event.rankKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(index * 0.04, 0.4) }}
      className="relative overflow-hidden rounded-2xl bg-white/[0.03]"
      style={{
        boxShadow: event.isRankUp
          ? `${rankRingInset(theme.secondary, "55")}, ${rankGlowShadow(theme.glow, 0, 22, -10)}`
          : `${rankRingInset(theme.secondary, "22")}`,
      }}
    >
      <div
        className={event.isRankUp ? "flex items-center gap-4 p-4" : "flex items-center gap-3 p-3"}
      >
        <div
          className={
            event.isRankUp
              ? "h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/30"
              : "h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/30 opacity-90"
          }
        >
          <RankIllustration
            rankKey={event.rankKey}
            label={event.rankLabel}
            className="h-full w-full"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {event.isRankUp ? (
              <Trophy className="h-3.5 w-3.5 shrink-0" style={{ color: theme.secondary }} />
            ) : (
              <Star className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <p
              className={
                event.isRankUp
                  ? "truncate text-[15px] font-black uppercase tracking-[0.14em]"
                  : "truncate text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
              }
              style={
                event.isRankUp
                  ? { color: theme.text, textShadow: rankTextGlow(theme.glow, 12) }
                  : undefined
              }
            >
              {event.isRankUp ? event.rankLabel : event.gradeLabel}
            </p>
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {event.isRankUp ? "Nouveau rang débloqué" : "Grade obtenu"}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold" style={{ color: theme.secondary }}>
              {formatXp(event.xp)} XP
            </span>
            <span aria-hidden>·</span>
            <span>{formatPromotionDate(event.date)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Carte d'Ascension (nouveau moteur — Titre précédent → Titre, Puissance Cortex). */
function AscensionCard({
  event,
  index,
}: {
  event: Extract<PromotionTimelineEvent, { source: "ascension" }>;
  index: number;
}) {
  const theme = rankThemeByKey(event.rankKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(index * 0.04, 0.4) }}
      className="relative overflow-hidden rounded-2xl bg-white/[0.03] p-4"
      style={{
        boxShadow: `${rankRingInset(theme.secondary, "55")}, ${rankGlowShadow(theme.glow, 0, 22, -10)}`,
      }}
    >
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/30">
          <RankIllustration
            rankKey={event.rankKey}
            label={event.rankLabel}
            className="h-full w-full"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 shrink-0" style={{ color: theme.secondary }} />
            <p
              className="truncate text-[15px] font-black uppercase tracking-[0.14em]"
              style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 12) }}
            >
              Ascension
            </p>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {event.previousRankLabel && (
              <>
                <span>{event.previousRankLabel}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
              </>
            )}
            <span style={{ color: theme.secondary }}>{event.rankLabel}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold" style={{ color: theme.secondary }}>
              Puissance Cortex {event.cortexPower}
            </span>
            <span aria-hidden>·</span>
            <span>{formatPromotionDate(event.date)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PromotionHistoryTimeline({ events }: { events: PromotionTimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] p-5 text-center ring-1 ring-white/5">
        <p className="text-[12px] text-muted-foreground">
          Chaque nouvelle Ascension sera consignée ici.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((event, index) =>
        event.source === "ascension" ? (
          <AscensionCard key={`ascension-${event.tierIndex}`} event={event} index={index} />
        ) : (
          <LegacyCard key={`legacy-${event.tierIndex}`} event={event} index={index} />
        ),
      )}
    </div>
  );
}
