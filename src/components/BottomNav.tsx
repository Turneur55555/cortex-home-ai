import { useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Dumbbell, Apple, User } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/seances", label: "Séances", icon: Dumbbell },
  { to: "/nutrition", label: "Nutrition", icon: Apple },
  { to: "/profil", label: "Profil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Publie la hauteur réellement rendue de la barre (safe area incluse, via
  // son propre paddingBottom) dans une variable CSS globale, pour que
  // n'importe quel écran puisse réserver exactement l'espace nécessaire en
  // bas de sa ScrollView plutôt qu'une estimation figée — s'adapte seul aux
  // Dynamic Island, aux appareils sans encoche, et aux réglages de police.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const publishHeight = () => {
      document.documentElement.style.setProperty("--bottom-nav-height", `${el.offsetHeight}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <nav className="pointer-events-auto relative overflow-hidden rounded-3xl border border-white/10 bg-background/60 px-2 py-2 shadow-elevated backdrop-blur-2xl">
        {/* subtle inner glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 50% 120%, var(--primary-glow-soft), transparent 60%)",
          }}
        />
        <ul className="relative flex items-center justify-between">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  data-testid={`nav-${to === "/" ? "home" : to.replace("/", "")}`}
                  className="group relative flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5"
                >
                  <span className="relative flex h-9 w-12 items-center justify-center">
                    {active && (
                      <motion.span
                        layoutId="nav-active-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-primary/20 shadow-[0_0_18px_var(--primary-glow-soft)]"
                        style={{
                          backgroundImage:
                            "linear-gradient(135deg, var(--primary-glow-soft), transparent)",
                        }}
                      />
                    )}
                    <motion.span
                      whileTap={{ scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                      className={
                        active
                          ? "relative text-white drop-shadow-[0_0_8px_var(--primary-glow-soft)]"
                          : "relative text-muted-foreground transition-colors group-hover:text-foreground"
                      }
                    >
                      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                    </motion.span>
                  </span>
                  <span
                    className={
                      active
                        ? "text-[10px] font-semibold text-foreground"
                        : "text-[10px] font-medium text-muted-foreground"
                    }
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
