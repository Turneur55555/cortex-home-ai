import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, X, AlertTriangle, Clock } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_MODULE_LABELS, type StockModule } from "@/hooks/use-stocks";

const DISMISSED_KEY = "cortex_dismissed_alerts_v1";

function getDismissed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setDismissedKey(id: string, expISO: string | null) {
  const map = getDismissed();
  map[id] = expISO ?? "none";
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});

  useEffect(() => {
    setDismissed(getDismissed());
  }, [open]);

  const { data: items = [] } = useQuery({
    queryKey: ["alerts_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, name, module, expiration_date, alert_days_before, location")
        .not("expiration_date", "is", null)
        .order("expiration_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const alerts = useMemo(() => {
    const today = new Date();
    return items
      .map((it) => {
        const exp = it.expiration_date as unknown as string;
        const days = differenceInDays(parseISO(exp), today);
        const threshold = it.alert_days_before ?? 7;
        return { ...it, days, threshold };
      })
      .filter((it) => it.days <= it.threshold)
      .filter((it) => {
        const d = dismissed[it.id];
        return d !== ((it.expiration_date as unknown as string) ?? "none");
      })
      .sort((a, b) => a.days - b.days);
  }, [items, dismissed]);

  const count = alerts.length;

  const dismissOne = (id: string, exp: string | null) => {
    setDismissedKey(id, exp);
    setDismissed(getDismissed());
  };

  const dismissAll = () => {
    alerts.forEach((a) =>
      setDismissedKey(a.id, (a.expiration_date as unknown as string) ?? null),
    );
    setDismissed(getDismissed());
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-sm backdrop-blur hover:bg-surface"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-16 w-full max-w-[400px] rounded-2xl border border-border bg-card p-4 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Alertes ({count})</h2>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={dismissAll}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Tout marquer lu
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {count === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Aucune alerte. Tout est sous contrôle ✨
              </div>
            ) : (
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
                {alerts.map((a) => {
                  const exp = a.expiration_date as unknown as string;
                  const expired = a.days < 0;
                  return (
                    <li
                      key={a.id}
                      className={`rounded-xl border p-3 ${
                        expired
                          ? "border-destructive/40 bg-destructive/10"
                          : "border-amber-500/30 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {expired ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        ) : (
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{a.name}</p>
                            <button
                              type="button"
                              onClick={() => dismissOne(a.id, exp)}
                              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              Marquer lu
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {STOCK_MODULE_LABELS[a.module as StockModule] ?? a.module}
                            {a.location ? ` • ${a.location}` : ""}
                          </p>
                          <p
                            className={`mt-1 text-xs font-medium ${
                              expired ? "text-destructive" : "text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            {expired
                              ? `Expiré depuis ${Math.abs(a.days)} j`
                              : a.days === 0
                              ? "Expire aujourd'hui"
                              : `Expire dans ${a.days} j`}
                            {" • "}
                            {format(parseISO(exp), "d MMM yyyy", { locale: fr })}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              to="/stocks"
              onClick={() => setOpen(false)}
              className="mt-3 block w-full rounded-xl bg-gradient-primary py-2.5 text-center text-xs font-semibold text-primary-foreground"
            >
              Ouvrir les stocks
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
