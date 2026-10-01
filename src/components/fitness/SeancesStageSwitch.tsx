import { Link } from "@tanstack/react-router";
import { BookOpen, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

export type SeancesStage = "arene" | "chroniques";

/**
 * Les deux étages de « Séances » : l'Arène (on s'entraîne) et les Chroniques (on relit ce
 * qu'on a fait). Deux moitiés d'un même monde, à un tap l'une de l'autre depuis n'importe où,
 * sans changer la barre du bas (décision de Nathan, 30/09/2026).
 *
 * Chaque étage est une VRAIE route (`/seances`, `/chroniques`) : retour arrière du
 * navigateur, lien direct, reprise après rechargement. Ce sont des liens, pas des boutons :
 * l'étage courant porte `aria-current="page"`.
 */
export function SeancesStageSwitch({ active }: { active: SeancesStage }) {
  const item = (stage: SeancesStage) =>
    cn(
      "flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold transition-colors",
      active === stage ? "bg-white text-black" : "text-white/60 hover:text-white/85",
    );

  return (
    <nav
      aria-label="Séances"
      className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1"
    >
      <Link
        to="/seances"
        aria-current={active === "arene" ? "page" : undefined}
        className={item("arene")}
      >
        <Swords aria-hidden className="h-3.5 w-3.5" />
        Arène
      </Link>
      <Link
        to="/chroniques"
        aria-current={active === "chroniques" ? "page" : undefined}
        className={item("chroniques")}
      >
        <BookOpen aria-hidden className="h-3.5 w-3.5" />
        Chroniques
      </Link>
    </nav>
  );
}
