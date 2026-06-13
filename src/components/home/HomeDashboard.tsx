import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Bell,
  ChevronRight,
  House,
  Loader2,
  UtensilsCrossed,
} from "lucide-react";
import { useNutrition, useNutritionGoals } from "@/hooks/use-fitness";
import { useAllStockStats } from "@/hooks/use-stocks";
import { useReminders } from "@/hooks/useReminders";

/**
 * Widgets cross-domaine du tableau de bord d'accueil (V2) :
 * Nutrition du jour, Maison (stocks / péremptions), Rappels du jour.
 * Chaque widget se branche sur les hooks existants et gère son état vide.
 */
export function HomeDashboard() {
  return (
    <>
      <NutritionTodayCard />
      <MaisonCard />
      <RappelsTodayCard />
    </>
  );
}

// ─── Nutrition du jour ────────────────────────────────────────────────────────

function NutritionTodayCard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: rows, isLoading } = useNutrition(today);
  const { data: goals } = useNutritionGoals();

  const totals = useMemo(() => {
    const acc = { calories: 0, proteins: 0 };
    for (const r of rows ?? []) {
      acc.calories += r.calories ?? 0;
      acc.proteins += r.proteins ?? 0;
    }
    return {
      calories: Math.round(acc.calories),
      proteins: Math.round(acc.proteins),
    };
  }, [rows]);

  const calGoal = goals?.calories ?? null;
  const protGoal = goals?.proteins ?? null;
  const calPct =
    calGoal && calGoal > 0 ? Math.min(100, Math.round((totals.calories / calGoal) * 100)) : null;
  const hasData = (rows?.length ?? 0) > 0;

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-lime-400" />
          <span className="text-sm font-semibold">Nutrition du jour</span>
        </div>
        <Link
          to="/fitness"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Voir tout →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : hasData ? (
        <>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold leading-none">
                {totals.calories}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {calGoal ? `/ ${calGoal} kcal` : "kcal"}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Protéines {totals.proteins} g
                {protGoal ? ` / ${protGoal} g` : ""}
              </p>
            </div>
          </div>
          {calPct != null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${calPct}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Aucun repas enregistré aujourd'hui. Ajoute ton premier.
        </p>
      )}
    </section>
  );
}

// ─── Maison (stocks) ──────────────────────────────────────────────────────────

function MaisonCard() {
  const { data: items, isLoading } = useAllStockStats();

  const stats = useMemo(() => {
    const list = items ?? [];
    const now = new Date();
    const in7 = new Date();
    in7.setDate(now.getDate() + 7);
    let low = 0;
    let expiring = 0;
    for (const it of list) {
      if (
        it.quantity != null &&
        it.low_stock_threshold != null &&
        it.quantity <= it.low_stock_threshold
      ) {
        low += 1;
      }
      if (it.expiration_date) {
        const exp = new Date(it.expiration_date + "T00:00:00");
        if (exp <= in7) expiring += 1;
      }
    }
    return { total: list.length, low, expiring };
  }, [items]);

  return (
    <Link
      to="/stocks"
      className="mt-4 block overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated transition-all hover:border-primary/30 hover:shadow-elevated"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-glow">
            <House className="h-4 w-4 text-white" />
          </span>
          <span className="text-sm font-semibold">Maison</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Articles" value={String(stats.total)} />
          <MiniStat
            label="Stock bas"
            value={String(stats.low)}
            tone={stats.low > 0 ? "warn" : "muted"}
          />
          <MiniStat
            label="Périment < 7j"
            value={String(stats.expiring)}
            tone={stats.expiring > 0 ? "danger" : "muted"}
          />
        </div>
      )}
    </Link>
  );
}

// ─── Rappels du jour ──────────────────────────────────────────────────────────

function RappelsTodayCard() {
  const { data: reminders, isLoading } = useReminders();

  const { overdue, todayList } = useMemo(() => {
    const list = (reminders ?? []).filter((r) => r.status !== "done");
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const overdueItems = list.filter((r) => r.due_at && new Date(r.due_at) < now);
    const todayItems = list
      .filter((r) => {
        if (!r.due_at) return false;
        const d = new Date(r.due_at);
        return d >= now && d <= endOfDay;
      })
      .sort((a, b) => new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime());
    return { overdue: overdueItems.length, todayList: todayItems };
  }, [reminders]);

  const nothing = !isLoading && overdue === 0 && todayList.length === 0;

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-semibold">Rappels du jour</span>
        </div>
        <Link
          to="/rappels"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Voir tout →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : nothing ? (
        <p className="text-[11px] text-muted-foreground">Rien de prévu aujourd'hui. 🎉</p>
      ) : (
        <>
          {overdue > 0 && (
            <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-0.5 text-[10px] font-semibold text-destructive">
              {overdue} en retard
            </p>
          )}
          {todayList.length > 0 ? (
            <ul className="space-y-1.5">
              {todayList.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-foreground">{r.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {format(new Date(r.due_at as string), "HH:mm")}
                  </span>
                </li>
              ))}
              {todayList.length > 3 && (
                <li className="text-[10px] text-muted-foreground/70">
                  +{todayList.length - 3} autre(s)
                </li>
              )}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Aucune échéance aujourd'hui, mais des tâches en retard à traiter.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─── Sous-composant ───────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 py-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
