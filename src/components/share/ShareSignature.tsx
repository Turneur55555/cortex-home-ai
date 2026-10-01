import { RankIllustration } from "@/components/rpg/RankIllustration";
import {
  rankGlowShadow,
  rankRingInset,
  rankTextGlow,
  rankThemeByKey,
} from "@/components/rpg/rankTheme";
import { BRAND_NAME } from "@/lib/brand";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { cn } from "@/lib/utils";

/**
 * G28 — LE MOT-MARQUE. Mis en capitales par la typographie, pas par la valeur : le texte lu par un
 * lecteur d'écran reste « Cortex » (`lib/brand.ts`).
 */
export function ShareWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-black uppercase tracking-[0.34em]", className)}>{BRAND_NAME}</span>
  );
}

export interface SignatureRank {
  key: RankKey;
  label: string;
  grade: string;
}

/**
 * G28 — LE PIED DE CARTE SIGNÉ de toute image exportée : ce que l'app a de plus partagé ne dit plus
 * d'où il vient sans que ce soit écrit.
 *
 *  - avec un `rank` (le Titre global du joueur) : mot-marque aux couleurs du rang, « Rang · Grade »
 *    dessous, et à droite le médaillon — découpé dans l'illustration officielle du rang
 *    (`RankIllustration`, seul composant qui représente un rang) ;
 *  - sans `rank` : le mot-marque seul, centré. C'est le cas des cartes qui portent DÉJÀ un rang
 *    (récap de séance : son bandeau Rang/Grade ; affiche de record : le rang de l'exercice, qui
 *    n'est pas le Titre du joueur) — le répéter dans le pied les doublonnerait, ou pire, mettrait
 *    deux rangs différents sur la même image.
 *
 * Aucune adresse : la carte est identifiable, elle n'amène personne — il n'y a pas de page
 * d'accueil publique à assumer.
 *
 * Toute couleur de rang passe par `rankTheme.ts`.
 */
export function ShareSignature({ rank }: { rank?: SignatureRank | null }) {
  if (!rank) {
    return (
      <p className="mt-6 text-center text-[13px] text-white/45">
        <ShareWordmark />
      </p>
    );
  }

  const theme = rankThemeByKey(rank.key);
  return (
    <div className="mt-6 flex w-full items-center justify-between border-t border-white/10 pt-4">
      <div className="min-w-0">
        <p
          className="text-[18px]"
          style={{ color: theme.text, textShadow: rankTextGlow(theme.glow, 14) }}
        >
          <ShareWordmark />
        </p>
        <p className="mt-1 truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">
          {rank.label} · {rank.grade}
        </p>
      </div>
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
        style={{ boxShadow: rankGlowShadow(theme.glow, 0, 22, -4) }}
      >
        <RankIllustration
          rankKey={rank.key}
          label={rank.label}
          className="h-full w-full"
          style={{ transform: "scale(1.5)", transformOrigin: "50% 12%" }}
        />
        {/* Le liseré est un calque PAR-DESSUS : un `inset` sur le conteneur passerait sous l'image. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: rankRingInset(theme.primary, "BF") }}
        />
      </div>
    </div>
  );
}
