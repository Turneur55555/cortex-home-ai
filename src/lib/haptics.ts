const KEY = "icortex:haptics-enabled";

/** Vibrations activées par défaut (comportement historique inchangé). */
export function isHapticsEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v == null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* noop */
  }
}
