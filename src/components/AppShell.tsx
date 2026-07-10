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
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen w-full bg-background">
      {/* Ambient top glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[500px] bg-gradient-glow opacity-60"
      />
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
