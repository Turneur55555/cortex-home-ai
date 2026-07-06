import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Trophy } from "lucide-react";
import { buildAchievementCollection } from "@/lib/profile/achievements/collection";
import { ACHIEVEMENT_ICON_MAP } from "@/components/profile/achievementIcons";
import { BadgeMedallion } from "@/components/profile/BadgeMedallion";
import { RARITY_BG, RARITY_LABELS, RARITY_TEXT, type BadgeRarity } from "@/lib/fitness/badges";
import { cn } from "@/lib/utils";
import type { AchievementAggregateWithLoading } from "@/hooks/useAchievements";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";

const RARITY_ORDER: BadgeRarity[] = ["common", "rare", "epic", "legendary", "mythic"];

/**
 * Aperçu compact de la Salle des trophées — répond à "Qu'ai-je accompli ?"
 * sans jamais réafficher les ~165 succès ici (ça reste le rôle de l'écran
 * `/trophees`, qui héberge le <TrophyRoom> complet inchangé). Dérivé du
 * même `buildAchievementCollection` que l'écran complet — aucune
 * duplication de la logique de fusion succès/badges.
 */
export function TrophyRoomPreview({
  achievements,
  legacyBadges,
}: {
  achievements: AchievementAggregateWithLoading;
  legacyBadges: BadgeWithProgress[];
}) {
  const collection = useMemo(
    () => buildAchievementCollection(achievements, legacyBadges),
    [achievements, legacyBadges],
  );

  const closest = collection.nearest.slice(0, 3);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Trophy className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Salle des trophées
        </h2>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-3xl font-black leading-none text-white">
                {collection.unlockedCount}
              </span>
              <span className="text-xs font-semibold text-white/40">
                / {collection.total} succès
              </span>
            </div>
          </div>
          <span className="shrink-0 text-xl font-black tabular-nums text-amber-400">
            {collection.completionPct}%
          </span>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {RARITY_ORDER.map((r) => {
            const c = collection.rarityCounts[r];
            const owned = c.owned > 0;
            return (
              <div
                key={r}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border py-1.5",
                  owned
                    ? cn("bg-gradient-to-b", RARITY_BG[r], "border-white/[0.08]")
                    : "border-white/[0.05] bg-white/[0.02]",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-black tabular-nums",
                    owned ? RARITY_TEXT[r] : "text-white/20",
                  )}
                >
                  {c.owned}
                </span>
                <span className="text-[7px] font-bold uppercase tracking-wider text-white/35">
                  {RARITY_LABELS[r]}
                </span>
              </div>
            );
          })}
        </div>

        {(closest.length > 0 || collection.secretHighlight) && (
          <div className="mt-3 space-y-1.5">
            {closest.map((item) => (
              <PreviewRow key={item.key} item={item} />
            ))}
            {collection.secretHighlight && <PreviewRow item={collection.secretHighlight} />}
          </div>
        )}

        <Link
          to="/trophees"
          className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          Voir toute la Salle des trophées
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function PreviewRow({
  item,
}: {
  item: ReturnType<typeof buildAchievementCollection>["items"][number];
}) {
  const isSecretHidden = item.isSecret && !item.isUnlocked;
  const Icon = ACHIEVEMENT_ICON_MAP[item.icon] ?? Trophy;

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-2.5 py-2 ring-1 ring-white/[0.04]">
      <BadgeMedallion
        rarity={item.rarity}
        icon={Icon}
        unlocked={item.isUnlocked}
        isSecret={isSecretHidden}
        size={28}
        animated={false}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-white/85">
          {isSecretHidden ? "Succès secret" : item.title}
        </p>
        {!item.isUnlocked && !isSecretHidden && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider",
          RARITY_TEXT[item.rarity],
        )}
      >
        {isSecretHidden
          ? "???"
          : item.isUnlocked
            ? RARITY_LABELS[item.rarity]
            : `${item.progress}%`}
      </span>
    </div>
  );
}
