export function simpleHash(s: string): number {
  let h = 0;
  for (const c of s) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return h;
}
