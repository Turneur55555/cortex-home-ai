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
 * c'est ici que le grain de matériau, la respiration du halo ambiant et
 * l'éclat de lumière du rang (RankTheme) sont posés une seule fois pour
 * couvrir 100% de l'app, plutôt que d'être dupliqués carte par carte. Le
 * fond (bg-background) reste inchangé — seuls un relief discret (grain), un
 * rythme de halo et un passage de lumière propres au rang (RANK_AMBIANCE) se
 * superposent.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen w-full bg-background">
      {/* Ambient top glow — respire au rythme du rang (RANK_AMBIANCE.haloDuration) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[500px] bg-gradient-glow animate-rank-breathe"
      />
      {/* Grain de matériau du rang — sur tout le viewport, très discret */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-rank-grain" />
      {/* Éclat de lumière du rang — un seul passage diagonal, cadencé par
          RANK_AMBIANCE.sweepDuration (reflets cuivrés/éclats dorés/reflets
          cristallins/braises, selon la couleur et le rythme du rang) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -inset-y-1/4 -inset-x-1/2 rank-glint-layer" />
      </div>
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
