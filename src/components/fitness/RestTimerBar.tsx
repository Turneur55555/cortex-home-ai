import { useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { restTimer, useRestTimer } from "@/hooks/useRestTimer";

const PRESETS = [60, 90, 120];

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RestTimerBar() {
  const t = useRestTimer();
  const [customOpen, setCustomOpen] = useState(false);
  const [customMin, setCustomMin] = useState("1");
  const [customSec, setCustomSec] = useState("30");

  if (!t.isActive) return null;

  const progress = t.totalSec > 0 ? Math.min(1, 1 - t.remaining / t.totalSec) : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  const dash = C * progress;

  const handleCustomStart = () => {
    const total = (parseInt(customMin || "0", 10) || 0) * 60 + (parseInt(customSec || "0", 10) || 0);
    if (total > 0) {
      restTimer.start(total, t.exerciseId);
      setCustomOpen(false);
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-[430px] px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}
    >
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card via-card to-primary/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-fade-in">
        {/* ── Main row ── */}
        <div className="flex items-center gap-3 px-3 py-3">
          {/* Circular progress + time */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                stroke="currentColor"
                className="text-white/10"
                strokeWidth="4"
              />
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                stroke="url(#restGrad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`}
                style={{ transition: "stroke-dasharray 0.4s linear" }}
              />
              <defs>
                <linearGradient id="restGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="relative text-[13px] font-bold tabular-nums">
              {formatTime(t.remaining)}
            </span>
          </div>

          {/* Label + presets */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {t.finished ? "Repos terminé" : t.isPaused ? "En pause" : "Repos"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => restTimer.setSound(!t.soundEnabled)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/5"
                  aria-label={t.soundEnabled ? "Désactiver le son" : "Activer le son"}
                >
                  {t.soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => restTimer.stop()}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Fermer le minuteur"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!t.finished ? (
              <div className="mt-1.5 flex items-center gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => restTimer.start(p, t.exerciseId)}
                    className={`flex-1 rounded-lg px-1 py-1 text-[11px] font-semibold transition ${
                      t.totalSec === p
                        ? "bg-primary/20 text-primary"
                        : "bg-white/5 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {p < 60 ? `${p}s` : `${Math.floor(p / 60)}'${p % 60 ? p % 60 : ""}`.replace("'0", "'")}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomOpen((v) => !v)}
                  className="rounded-lg bg-white/5 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-white/10"
                >
                  Perso
                </button>

                {t.isPaused ? (
                  <button
                    type="button"
                    onClick={() => restTimer.resume()}
                    className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    aria-label="Reprendre"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => restTimer.pause()}
                    className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/10"
                    aria-label="Pause"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => restTimer.restart()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-purple-500 px-2 py-1.5 text-[11px] font-semibold text-primary-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Relancer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Custom input ── */}
        {customOpen && (
          <div className="flex items-center gap-2 border-t border-white/5 bg-black/20 px-3 py-2">
            <input
              type="number"
              min="0"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              className="w-12 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-center text-sm font-semibold tabular-nums outline-none focus:border-primary"
              placeholder="min"
            />
            <span className="text-xs text-muted-foreground">min</span>
            <input
              type="number"
              min="0"
              max="59"
              value={customSec}
              onChange={(e) => setCustomSec(e.target.value)}
              className="w-12 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-center text-sm font-semibold tabular-nums outline-none focus:border-primary"
              placeholder="sec"
            />
            <span className="text-xs text-muted-foreground">sec</span>
            <button
              type="button"
              onClick={handleCustomStart}
              className="ml-auto rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              Démarrer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
