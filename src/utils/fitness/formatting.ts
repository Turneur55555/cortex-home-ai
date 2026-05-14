export function fmtHours(h: number): string {
  if (h < 1) return "<1h";
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}j`;
}
