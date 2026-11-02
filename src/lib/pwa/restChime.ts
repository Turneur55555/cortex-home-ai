/**
 * LE SIGNAL DE FIN DE REPOS — un seul contexte audio, déverrouillé au toucher.
 *
 * Aucun import React, Supabase ou IndexedDB (convention `/src/lib`) ; seulement l'API Web Audio.
 *
 * ── Le constat (01/11/2026) ──
 * Le minuteur créait un `AudioContext` NEUF au moment où le repos se terminait — dans un rappel
 * de minuterie, donc hors de tout geste. Safari iOS laisse un tel contexte à l'état `suspended` :
 * aucun son. Sur iPhone, la vibration n'existe pas (`navigator.vibrate` absent) et le
 * constructeur `Notification` n'est pas disponible : la fin du repos était MUETTE, seulement
 * visible à l'écran.
 *
 * ── La règle ──
 * - `primeRestChime()` est appelé DANS le geste qui lance le repos (valider une série, relancer
 *   le minuteur) : c'est le seul moment où iOS accepte de démarrer la sortie audio ;
 * - `playRestChime()` réutilise ce même contexte à la fin du repos — jamais un nouveau, jamais
 *   fermé (un seul contexte pour toute la vie de la page : pas de fuite, pas de plafond atteint).
 *
 * Limite assumée : écran verrouillé, iOS suspend la page ; c'est pourquoi la séance active garde
 * l'écran allumé (`useScreenWakeLock`). Le mode silencieux de l'iPhone coupe aussi ce son.
 */

type AudioContextCtor = new () => AudioContext;

let shared: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function sharedContext(): AudioContext | null {
  if (shared && shared.state !== "closed") return shared;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  shared = new Ctor();
  return shared;
}

function resumeIfNeeded(ctx: AudioContext): void {
  if (ctx.state === "running") return;
  // `resume()` hors geste peut être refusé : sans conséquence, le son sera simplement absent.
  ctx.resume().catch(() => undefined);
}

/** À appeler dans un gestionnaire de toucher/clic. Sans effet là où Web Audio n'existe pas. */
export function primeRestChime(): void {
  try {
    const ctx = sharedContext();
    if (!ctx) return;
    resumeIfNeeded(ctx);
    // Un tampon silencieux joué pendant le geste déverrouille la sortie sur les iOS plus anciens.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Audio indisponible : dégradation silencieuse, le minuteur reste visible.
  }
}

/** Deux bips (la, ré). Renvoie `true` si le son a pu être programmé. */
export function playRestChime(): boolean {
  try {
    const ctx = sharedContext();
    if (!ctx) return false;
    resumeIfNeeded(ctx);
    const beep = (when: number, frequency: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + 0.35);
    };
    beep(0, 880);
    beep(0.35, 1175);
    return true;
  } catch {
    return false;
  }
}

export function resetRestChimeForTests(): void {
  shared = null;
}
