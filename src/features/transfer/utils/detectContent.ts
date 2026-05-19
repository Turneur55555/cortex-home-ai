import type { DetectionResult } from "../types";

export function parseDocAnalysis(raw: string | null | undefined): Array<Record<string, unknown>> {
  if (!raw) return [];
  try {
    const p: unknown = JSON.parse(raw);
    if (Array.isArray(p)) return p as Array<Record<string, unknown>>;
    if (p && typeof p === "object") {
      const obj = p as Record<string, unknown>;
      const val = obj.items ?? obj.extracted_items ?? obj.data;
      if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    }
    return [];
  } catch {
    return [];
  }
}

export function detectTransferableContent(
  source: string | null | undefined | Array<Record<string, unknown>>,
): DetectionResult {
  const items = Array.isArray(source) ? source : parseDocAnalysis(source);
  return {
    canTransfer: items.length > 0,
    items,
    totalItems: items.length,
  };
}
