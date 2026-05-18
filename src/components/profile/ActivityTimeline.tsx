import { Activity, ScanLine, Target, Utensils, Package } from "lucide-react";
import { useUserActivity } from "@/hooks/useUserActivity";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS: Record<string, typeof Activity> = {
  meal: Utensils,
  scan: ScanLine,
  stock: Package,
  goal: Target,
};

function relative(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export function ActivityTimeline() {
  const { data, isLoading } = useUserActivity(5);

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Activité récente</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
        {isLoading && <Skeleton className="h-20 w-full" />}
        {!isLoading && (!data || data.length === 0) && (
          <p className="py-4 text-center text-xs text-muted-foreground">Aucune activité récente</p>
        )}
        <ul className="space-y-2">
          {data?.map((item) => {
            const Icon = ICONS[item.type] ?? Activity;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="flex-1 truncate text-sm">{item.label}</span>
                <span className="text-[10px] text-muted-foreground">{relative(item.created_at)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
