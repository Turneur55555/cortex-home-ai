import { useEffect, useState } from "react";

const KEY = "icortex.streak.v1";

interface StreakState {
  days: string[]; // ISO yyyy-mm-dd ordered ascending
  best: number;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function load(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StreakState;
  } catch {
    // ignore
  }
  // seed with today + 6 previous days
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(ymd(d));
  }
  const initial: StreakState = { days, best: 7 };
  try {
    localStorage.setItem(KEY, JSON.stringify(initial));
  } catch {
    // ignore
  }
  return initial;
}

function consecutive(days: string[]): number {
  if (!days.length) return 0;
  const set = new Set(days);
  let count = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    if (set.has(ymd(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return count;
}

export function useStreak() {
  const [state, setState] = useState<StreakState>({ days: [], best: 0 });

  useEffect(() => {
    const s = load();
    setState({ ...s, best: Math.max(s.best, consecutive(s.days)) });
  }, []);

  return {
    days: state.days,
    current: consecutive(state.days),
    best: state.best,
  };
}
