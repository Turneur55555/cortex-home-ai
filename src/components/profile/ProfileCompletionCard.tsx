import { Check, Circle } from "lucide-react";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";

interface Props {
  hasAvatar: boolean;
  hasCustomPseudo: boolean;
}

export function ProfileCompletionCard({ hasAvatar, hasCustomPseudo }: Props) {
  const { data } = useProfileCompletion({ hasAvatar, hasCustomPseudo });
  const score = data?.score ?? 0;
  const items = data?.items ?? [];

  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="url(#pc-grad)"
              strokeWidth="6"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-500"
            />
            <defs>
              <linearGradient id="pc-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6c63ff" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Profil complété</p>
          <p className="text-[11px] text-muted-foreground">
            {data ? `${data.done}/${data.total} étapes terminées` : "Calcul…"}
          </p>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                it.done
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-white/5 bg-white/[0.02] text-muted-foreground"
              }`}
            >
              {it.done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              <span className="truncate">{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
