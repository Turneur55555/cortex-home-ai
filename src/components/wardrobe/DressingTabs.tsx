import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type DressingTab = "aujourdhui" | "vestiaire" | "style";

const TABS: Array<{ key: DressingTab; label: string; to: string }> = [
  { key: "aujourdhui", label: "Aujourd'hui", to: "/dressing" },
  { key: "vestiaire", label: "Vestiaire", to: "/dressing/vestiaire" },
  { key: "style", label: "Style", to: "/dressing/historique" },
];

/** Onglets internes du Dressing : Aujourd'hui · Vestiaire · Style. */
export function DressingTabs({ active }: { active: DressingTab }) {
  return (
    <nav
      aria-label="Sections du dressing"
      className="my-3 flex rounded-2xl border border-border bg-card p-[3px]"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "flex-1 rounded-xl py-2 text-center text-[13px] font-semibold transition-colors",
            tab.key === active
              ? "bg-white/[0.08] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "text-muted-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
