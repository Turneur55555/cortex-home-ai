export type TransferTarget =
  | "alimentation"
  | "pharmacie"
  | "habits"
  | "menager"
  | "nutrition"
  | "fitness"
  | "body";

export const TRANSFER_LABELS: Record<TransferTarget, string> = {
  alimentation: "Alimentation",
  pharmacie: "Pharmacie",
  habits: "Garde-robe",
  menager: "Ménager",
  nutrition: "Nutrition",
  fitness: "Séances",
  body: "Mesures corporelles",
};

export const ALL_TARGETS: TransferTarget[] = [
  "nutrition",
  "fitness",
  "body",
  "alimentation",
  "pharmacie",
  "habits",
  "menager",
];

export type DetectionResult = {
  canTransfer: boolean;
  items: Array<Record<string, unknown>>;
  totalItems: number;
};

export type TransferStatus =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; count: number; target: TransferTarget }
  | { phase: "error"; message: string };
