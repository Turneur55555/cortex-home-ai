import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer, X } from "lucide-react";

const PRESETS = [60, 90, 120, 180] as const;

function playBeep(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio non disponible
  }
}

export function RestTimer({
  defaultSeconds = 90,
  onClose,
}: {
  defaultSeconds?: number;
  onClose: () => void;
}) {
  const [total, setTotal] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx() as AudioContext;
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) {
      setRunning(false);
      const ctx = ensureAudio();
      if (ctx) playBeep(ctx);
      try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch {}
    } else if (remaining <= 3) {
      const ctx = ensureAudio();
      if (ctx) playBeep(ctx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const reset = (newTotal = total) => {
    setTotal(newTotal);
    setRemaining(newTotal);
    setRunning(true);
  };

  const done = remaining === 0;
  const progress = total > 0 ? remaining / total : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Temps de repos
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted-foreground" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex h-40 w-40 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128" aria-hidden>
              <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="8" className="stroke-border" />
              <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" className={done ? "stroke-destructive" : "stroke-primary"} style={{ transition: "stroke-dashoffset 0.9s linear" }} />
            </svg>
            <div className="flex flex-col items-center">
              <span className={`text-4xl font-bold tabular-nums tracking-tight ${done ? "text-destructive" : ""}`}>{display}</span>
              {done && <span className="mt-1 text-xs font-semibold text-destructive">Terminé !</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => reset()} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted-foreground transition-all active:scale-90" aria-label="Réinitialiser"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => setRunning((r) => !r)} disabled={done} className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition-all active:scale-90 disabled:opacity-50" aria-label={running ? "Pause" : "Reprendre"}>
              {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold transition-all active:scale-90" aria-label="Terminé — fermer">✓</button>
          </div>
          <div className="flex gap-2">
            {PRESETS.map((s) => (
              <button key={s} type="button" onClick={() => reset(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${total === s ? "bg-primary/20 text-primary" : "bg-surface text-muted-foreground"}`}>
                {s < 60 ? `${s}s` : `${s / 60}min`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
