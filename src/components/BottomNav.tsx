import { Link, useLocation } from "@tanstack/react-router";
import { Home, Package, Dumbbell, FileText, User } from "lucide-react";

const tabs = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/fitness", label: "Fitness", icon: Dumbbell },
  { to: "/stocks", label: "Stocks", icon: Package },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/profil", label: "Profil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="sticky bottom-0 z-30 mt-auto border-t border-border bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl">
      <ul className="flex items-center justify-between">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                data-testid={`nav-${to === "/" ? "home" : to.replace("/", "")}`}
                className="group flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors"
              >
                <span
                  className={
                    active
                      ? "flex h-9 w-12 items-center justify-center rounded-full bg-primary/15 text-primary shadow-glow transition-all"
                      : "flex h-9 w-12 items-center justify-center rounded-full text-muted-foreground transition-all group-hover:text-foreground"
                  }
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
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
  );
}
