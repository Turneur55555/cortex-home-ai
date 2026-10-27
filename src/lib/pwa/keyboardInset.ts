/**
 * Hauteur du clavier virtuel (iOS/iPadOS) dérivée du `visualViewport`.
 *
 * Sur iPhone, ouvrir le clavier NE rétrécit PAS le layout viewport : un
 * élément `position: fixed; bottom: 0` (feuille du bas, barre d'action) reste
 * ancré derrière le clavier et le champ en cours de saisie devient invisible.
 * Le `visualViewport`, lui, rétrécit : l'écart entre les deux EST le clavier.
 *
 * En dessous du seuil, on considère que l'écart vient des barres de Safari
 * qui se replient au défilement (quelques dizaines de pixels), pas d'un
 * clavier — on renvoie 0 pour ne pas faire sautiller les feuilles.
 */
export const KEYBOARD_INSET_THRESHOLD_PX = 120;

export interface ViewportMetrics {
  /** `window.innerHeight` — hauteur du layout viewport. */
  layoutHeight: number;
  /** `visualViewport.height` — hauteur réellement visible. */
  visualHeight: number;
  /** `visualViewport.offsetTop` — défilement du visual viewport dans le layout. */
  visualOffsetTop: number;
}

export function computeKeyboardInset({
  layoutHeight,
  visualHeight,
  visualOffsetTop,
}: ViewportMetrics): number {
  const raw = layoutHeight - visualHeight - visualOffsetTop;
  if (!Number.isFinite(raw) || raw < KEYBOARD_INSET_THRESHOLD_PX) return 0;
  return Math.round(raw);
}

/** Variable CSS globale lue par les feuilles du bas (`AppSheet`, `Sheet`). */
export const KEYBOARD_INSET_CSS_VAR = "--keyboard-inset";

/**
 * Publie la hauteur du clavier dans `--keyboard-inset` sur `<html>` et la
 * tient à jour. Renvoie la fonction de nettoyage. Sans `visualViewport`
 * (vieux navigateurs, SSR), ne fait rien : la variable garde son repli 0px.
 */
export function installKeyboardInsetVariable(win: Window = window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;
  let frame = 0;
  let last = -1;

  const publish = () => {
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      const inset = computeKeyboardInset({
        layoutHeight: win.innerHeight,
        visualHeight: vv.height,
        visualOffsetTop: vv.offsetTop,
      });
      if (inset === last) return;
      last = inset;
      root.style.setProperty(KEYBOARD_INSET_CSS_VAR, `${inset}px`);
    });
  };

  publish();
  vv.addEventListener("resize", publish);
  vv.addEventListener("scroll", publish);
  return () => {
    win.cancelAnimationFrame(frame);
    vv.removeEventListener("resize", publish);
    vv.removeEventListener("scroll", publish);
    root.style.removeProperty(KEYBOARD_INSET_CSS_VAR);
  };
}
