// ─── Shared types for stocks components ──────────────────────────────────────

export type View =
  | { level: "rooms" }
  | { level: "compartments"; roomId: string }
  | { level: "items"; roomId: string; compartmentId: string };
