import { useCallback, useEffect, useState } from "react";

export interface Goal {
  id: string;
  title: string;
  progress: number; // 0..100
  target: string; // ISO date
  createdAt: string;
}

const KEY = "icortex.goals.v1";

function load(): Goal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Goal[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

function seed(): Goal[] {
  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
  return [
    { id: crypto.randomUUID(), title: "Boire 2L d'eau / jour", progress: 70, target: inDays(7), createdAt: today.toISOString() },
    { id: crypto.randomUUID(), title: "3 séances de sport / semaine", progress: 45, target: inDays(14), createdAt: today.toISOString() },
    { id: crypto.randomUUID(), title: "Lire 30 minutes / jour", progress: 100, target: inDays(-2), createdAt: today.toISOString() },
  ];
}

function persist(goals: Goal[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(goals));
  } catch {
    // ignore
  }
}

export type GoalStatus = "done" | "late" | "active";

export function statusOf(g: Goal): GoalStatus {
  if (g.progress >= 100) return "done";
  if (new Date(g.target).getTime() < Date.now()) return "late";
  return "active";
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    setGoals(load());
  }, []);

  const addGoal = useCallback((title: string, target: string) => {
    setGoals((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          progress: 0,
          target,
          createdAt: new Date().toISOString(),
        },
      ];
      persist(next);
      return next;
    });
  }, []);

  const updateGoal = useCallback((id: string, patch: Partial<Goal>) => {
    setGoals((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...patch } : g));
      persist(next);
      return next;
    });
  }, []);

  const removeGoal = useCallback((id: string) => {
    setGoals((prev) => {
      const next = prev.filter((g) => g.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const stats = {
    done: goals.filter((g) => statusOf(g) === "done").length,
    total: goals.length,
  };

  return { goals, addGoal, updateGoal, removeGoal, stats };
}
