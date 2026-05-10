import type { ReactNode } from "react";
import { NotificationsBell } from "./NotificationsBell";

interface AppShellProps {
  children: ReactNode;
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
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
        <div className="pointer-events-none fixed top-3 z-40 mx-auto w-full max-w-[430px] px-3">
          <div className="pointer-events-auto flex justify-end">
            <NotificationsBell />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
