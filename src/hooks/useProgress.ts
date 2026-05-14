import { useEffect, useState } from "react";

export interface ProgressData {
  weekly: { day: string; value: number }[];
  habits: { name: string; done: boolean }[];
  delta: number; // %
  history: { label: string; value: string }[];
}

const dayNames = ["L", "M", "M", "J", "V", "S", "D"];

function build(): ProgressData {
  // Pseudo-stable values seeded by current week
  const seed = new Date().getUTCDay();
  const weekly = dayNames.map((day, i) => ({
    day,
    value: 35 + ((seed * 13 + i * 23) % 60),
  }));
  return {
    weekly,
    habits: [
      { name: "Hydratation", done: true },
      { name: "Sport", done: true },
      { name: "Méditation", done: false },
      { name: "Sommeil 7h+", done: true },
      { name: "Lecture", done: false },
    ],
    delta: 12,
    history: [
      { label: "Cette semaine", value: "+12%" },
      { label: "Sessions", value: "9" },
      { label: "Calories brûlées", value: "3 280" },
      { label: "Temps actif", value: "5h 24" },
    ],
  };
}

export function useProgress() {
  const [data, setData] = useState<ProgressData | null>(null);
  useEffect(() => {
    setData(build());
  }, []);
  return data;
}
