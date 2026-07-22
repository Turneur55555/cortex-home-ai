import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  /**
   * Kept for backward compatibility with existing call sites; no longer
   * renders a notifications bell since the reminders module was removed.
   */
  showBell?: boolean;
}

/**
 * Mobile-first container, max-width 430px centered, with ambient glow.
 *
 * Point unique par lequel TOUT écran authentifié passe (Outlet + BottomNav) :
 * c'est ici que le grain de matériau du rang (RankTheme) est posé une seule
 * fois pour couvrir 100% de l'app, plutôt que d'être dupliqué carte par
 * carte. Le fond (bg-background) reste inchangé — seul un relief très
 * discret (opacity 0.4) se superpose, teinté par ce qu'il y a dessous.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen w-full bg-background">
      {/* Ambient top glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[500px] bg-gradient-glow opacity-60"
      />
      {/* Grain de matériau du rang — sur tout le viewport, très discret */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-rank-grain opacity-40" />
      <div
        className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col"
        style={{
          // Hauteur réelle de la barre de nav (publiée par BottomNav via
          // ResizeObserver, safe area déjà incluse) + marge pour qu'aucun
          // bouton flottant (FAB) ni carte ne passe jamais dessous, sur
          // aucun appareil (avec ou sans Dynamic Island / home indicator).
          // Le repli (5.75rem) ne sert qu'avant le tout premier paint.
          paddingBottom: "calc(var(--bottom-nav-height, 5.75rem) + 6rem)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
