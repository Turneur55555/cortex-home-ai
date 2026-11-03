import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Backpack,
  Check,
  ChevronLeft,
  Dumbbell,
  Heart,
  Images,
  Leaf,
  Plus,
  Shirt,
  Shuffle,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { DressingTabs } from "@/components/wardrobe/DressingTabs";
import { MaintenanceBanner } from "@/components/wardrobe/MaintenanceBanner";
import { MissingPiecesCard } from "@/components/wardrobe/MissingPiecesCard";
import { OutfitLook, PieceTile, STUDIO_BACKGROUND } from "@/components/wardrobe/OutfitLook";
import { Skeleton } from "@/components/ui/skeleton";
import { useDressingTrainingDay, useGymBag } from "@/hooks/useDressingToday";
import { useOutfitFeedback, useSaveOutfit, useUnwearOutfit } from "@/hooks/useOutfitGenerator";
import { useWeeklyOutfits } from "@/hooks/useWardrobeInsights";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import type { WeekDayPlan } from "@/lib/wardrobe/weeklyOutfits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dressing/")({
  head: () => ({
    meta: [
      { title: "Mon dressing — ICORTEX" },
      {
        name: "description",
        content: "Ta tenue du jour, préparée à partir de ton dressing ICORTEX.",
      },
      { property: "og:title", content: "Mon dressing — ICORTEX" },
      {
        property: "og:description",
        content: "Ta tenue du jour, préparée à partir de ton dressing ICORTEX.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayOutfitPage,
});

const SEASON_LABEL: Record<string, string> = {
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
  hiver: "Hiver",
};

function longDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function stripLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase();
  return `${day} ${d.getDate()}`;
}

/** Distance horizontale (px) au-delà de laquelle un glissé change de tenue. */
const SWIPE_THRESHOLD = 40;

function TodayOutfitPage() {
  const { today, days, personalization, setDayReroll } = useWeeklyOutfits();
  const { items, isLoading, isError, suggestions, season } = personalization;
  const training = useDressingTrainingDay(today);
  const gymBag = useGymBag(personalization, training.isTraining);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resolve = (ids: string[]) =>
    ids.map((id) => itemById.get(id)).filter((i): i is WardrobeItemView => !!i);
  const todayPlan = days.find((d) => d.isToday);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <header>
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {longDate(today)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Ta tenue du jour</h1>
          </div>
          <Link
            to="/dressing/ajouter"
            aria-label="Ajouter une pièce"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card transition-opacity active:opacity-80"
          >
            <Plus className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <DressingTabs active="aujourdhui" />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3 rounded-full" />
          <Skeleton className="aspect-[5/4] w-full rounded-[28px]" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="rounded-[28px] border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="mx-auto h-7 w-7 text-destructive" />
          <p className="mt-2 text-sm font-semibold">Impossible de charger ton dressing</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vérifie ta connexion puis rouvre cet écran.
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyDressing />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80">
              <Leaf className="h-3.5 w-3.5" />
              {SEASON_LABEL[season]}
            </span>
            {training.isTraining && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80">
                <Dumbbell className="h-3.5 w-3.5" />
                {training.label ? `Séance ${training.label}` : "Jour de séance"}
              </span>
            )}
            {training.isRest && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80">
                Repos
              </span>
            )}
          </div>

          {todayPlan && (todayPlan.status === "planned" || todayPlan.status === "worn") ? (
            <TodayHero
              day={todayPlan}
              resolve={resolve}
              onPick={(index) => setDayReroll(today, index)}
            />
          ) : (
            <div className="rounded-[28px] border border-border bg-card p-6 text-center">
              <Shirt className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Pas de tenue possible aujourd'hui</p>
              <p className="mx-auto mt-1 max-w-[18rem] text-xs text-muted-foreground">
                {todayPlan?.reason ?? "Ajoute au moins un haut et un bas."}
              </p>
            </div>
          )}

          {gymBag && (
            <section className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <Backpack className="h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-xs">
                <span className="font-semibold">Sac de salle</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {resolve(gymBag.items.map((i) => i.id))
                    .slice(0, 2)
                    .map((p) => p.name ?? "Pièce")
                    .join(" + ")}
                </span>
              </p>
              <div className="flex shrink-0 gap-1">
                {resolve(gymBag.items.map((i) => i.id))
                  .slice(0, 2)
                  .map((p) => (
                    <PieceTile key={p.id} piece={p} className="w-7 rounded-md" />
                  ))}
              </div>
            </section>
          )}

          <WeekStrip days={days} resolve={resolve} />

          <MaintenanceBanner items={items} />
          {todayPlan?.status !== "planned" && todayPlan?.status !== "worn" && (
            <MissingPiecesCard suggestions={suggestions} />
          )}
        </div>
      )}
    </main>
  );
}

function TodayHero({
  day,
  resolve,
  onPick,
}: {
  day: WeekDayPlan;
  resolve: (ids: string[]) => WardrobeItemView[];
  onPick: (index: number) => void;
}) {
  const saveOutfit = useSaveOutfit();
  const feedback = useOutfitFeedback();
  const unwear = useUnwearOutfit();
  const [likedKey, setLikedKey] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

  const worn = day.status === "worn" && day.worn;
  const ids = worn ? day.worn!.itemIds : (day.outfit?.items.map((i) => i.id) ?? []);
  const pieces = resolve(ids);
  const key = ids.join("|");
  const top = pieces.find((p) => p.category === "top");
  const bottom = pieces.find((p) => p.category === "bottom");
  const canSwipe = !worn && day.poolSize > 1;

  function go(delta: number) {
    if (!canSwipe) return;
    onPick((day.poolIndex + delta + day.poolSize) % day.poolSize);
  }

  async function wear() {
    if (!day.outfit) return;
    try {
      await saveOutfit.mutateAsync({ outfit: day.outfit, context: day.context, wornNow: true });
    } catch {
      // Le toast d'erreur est géré par useSaveOutfit.
    }
  }

  async function like() {
    if (!day.outfit || likedKey === key) return;
    try {
      const outfitId = await saveOutfit.mutateAsync({ outfit: day.outfit, context: day.context });
      await feedback.mutateAsync({ outfitId, liked: true });
      setLikedKey(key);
    } catch {
      // Les toasts d'erreur sont gérés par les mutations.
    }
  }

  const busy = saveOutfit.isPending || feedback.isPending || unwear.isPending;

  return (
    <>
      <section
        className="relative touch-pan-y select-none overflow-hidden rounded-[28px]"
        style={{ background: STUDIO_BACKGROUND }}
        onPointerDown={(e) => {
          startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) >= SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          startX.current = null;
        }}
      >
        <OutfitLook
          pieces={pieces}
          size="hero"
          showMissingShoes={!worn && !!day.outfit?.missing.includes("chaussures")}
        />
        <span className="absolute left-3.5 top-3.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-[#2a2620]">
          {worn ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" strokeWidth={3} />
              Portée aujourd'hui
            </span>
          ) : (
            `Harmonie ${day.outfit?.score ?? 0} %`
          )}
        </span>
        {canSwipe && (
          <span className="absolute right-4 top-4 text-[11px] font-semibold tabular-nums text-[#6f685d]">
            {day.poolIndex + 1} / {day.poolSize}
          </span>
        )}
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-[11.5px] font-semibold text-[#3b362f]">
          <span className="min-w-0 truncate">
            {top?.name ?? ""}
            {top?.brand && <span className="font-medium text-[#7a7368]"> · {top.brand}</span>}
          </span>
          <span className="min-w-0 shrink-0 truncate text-right">{bottom?.name ?? ""}</span>
        </div>
      </section>

      {canSwipe && (
        <div className="flex justify-center gap-0.5" role="tablist" aria-label="Tenues du jour">
          {Array.from({ length: day.poolSize }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === day.poolIndex}
              aria-label={`Tenue ${i + 1} sur ${day.poolSize}`}
              onClick={() => onPick(i)}
              className="flex h-5 items-center px-0.5"
            >
              <span
                className={cn(
                  "block h-[5px] rounded-full transition-all",
                  i === day.poolIndex ? "w-4 bg-primary" : "w-[5px] bg-white/15",
                )}
              />
            </button>
          ))}
        </div>
      )}

      {worn ? (
        <div className="flex items-center gap-2">
          <p className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            <Check className="h-4 w-4" strokeWidth={3} />
            Inscrite dans ton journal
          </p>
          <button
            type="button"
            onClick={() => day.worn && unwear.mutate(day.worn.id)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-3 text-xs font-semibold text-muted-foreground disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Annuler
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void wear()}
            disabled={busy || !day.outfit}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity active:opacity-80 disabled:opacity-50"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            Je la porte
          </button>
          <Link
            to="/dressing/generer"
            aria-label="Composer une autre tenue"
            className="flex w-[52px] items-center justify-center rounded-2xl border border-border bg-card transition-opacity active:opacity-80"
          >
            <Shuffle className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => void like()}
            disabled={busy || !day.outfit}
            aria-pressed={likedKey === key}
            aria-label="J'aime cette tenue"
            className={cn(
              "flex w-[52px] items-center justify-center rounded-2xl border transition-colors disabled:opacity-50",
              likedKey === key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-card",
            )}
          >
            <Heart className={cn("h-4 w-4", likedKey === key && "fill-current")} />
          </button>
        </div>
      )}
      {!worn && day.outfit?.explanation.includes("couche") && (
        <p className="px-1 text-[11px] leading-snug text-amber-300">
          Manches courtes : prévois une couche par-dessus.
        </p>
      )}
    </>
  );
}

function WeekStrip({
  days,
  resolve,
}: {
  days: WeekDayPlan[];
  resolve: (ids: string[]) => WardrobeItemView[];
}) {
  return (
    <Link
      to="/dressing/semaine"
      aria-label="Ma semaine de tenues"
      className="grid grid-cols-7 gap-1.5"
    >
      {days.map((d) => {
        const ids =
          d.status === "worn" && d.worn ? d.worn.itemIds : (d.outfit?.items.map((i) => i.id) ?? []);
        const pieces = resolve(ids);
        return (
          <div key={d.date} className="min-w-0">
            <div
              className={cn(
                "relative overflow-hidden rounded-xl",
                d.isToday && "ring-2 ring-primary",
                d.status === "worn" && "opacity-80",
                d.status === "missed" && "opacity-40",
              )}
            >
              {pieces.length > 0 ? (
                <OutfitLook pieces={pieces} size="mini" />
              ) : (
                <div className="aspect-[4/5] w-full" style={{ background: STUDIO_BACKGROUND }} />
              )}
              {d.status === "worn" && (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-1 text-center text-[10px] font-semibold tabular-nums",
                d.isToday ? "text-primary" : "text-muted-foreground",
              )}
            >
              {stripLabel(d.date)}
            </p>
          </div>
        );
      })}
    </Link>
  );
}

function EmptyDressing() {
  return (
    <div className="rounded-[28px] border border-dashed border-border bg-card/60 p-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Shirt className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold">Ton dressing est vide</p>
      <p className="mx-auto mt-1 max-w-[18rem] text-xs text-muted-foreground">
        Ajoute quelques hauts et bas : chaque matin, ta tenue du jour sera prête ici.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          to="/dressing/ajouter"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Ajouter une pièce
        </Link>
        <Link
          to="/dressing/import"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold"
        >
          <Images className="h-3.5 w-3.5" />
          Plusieurs
        </Link>
      </div>
    </div>
  );
}
