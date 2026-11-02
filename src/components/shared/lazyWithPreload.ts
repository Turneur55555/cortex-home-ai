import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Chargement différé avec préchargement — voir `DeferredPart.tsx` pour les règles d'usage
 * (jamais sur le parcours de séance).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature générique de React.lazy
export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature générique de React.lazy
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!pending) {
      pending = factory().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  const component = lazy(load) as PreloadableComponent<T>;
  component.preload = load;
  return component;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Lance les chargements pendant un temps mort ; renvoie l'annulation (démontage). */
export function preloadWhenIdle(loaders: ReadonlyArray<() => Promise<unknown>>): () => void {
  if (typeof window === "undefined" || loaders.length === 0) return () => undefined;
  const w = window as IdleWindow;
  const run = () => {
    for (const load of loaders) load().catch(() => undefined);
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}
