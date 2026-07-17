import { CalendarClock, Swords } from "lucide-react";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { useActiveSeason } from "@/hooks/useActiveSeason";

// Palette « saison » indigo — distincte de l'or (XP) et des couleurs de rang.
// À terme, le thème de la saison pourra piloter cette palette (S2/S3).
const SEASON_COLORS = {
  gradient: "linear-gradient(90deg,#312e81 0%,#6366f1 55%,#a5b4fc 100%)",
  primary: "#6366f1",
  secondary: "#a5b4fc",
  glow: "rgba(99,102,241,0.5)",
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function romanize(n: number): string {
  return ROMAN[n] ?? String(n);
}

/**
 * Carte du track de Saison sur l'Accueil (S0, lecture seule). Affiche
 * l'identité de la saison, le palier atteint, les Points de Saison et le
 * compte à rebours de fin. Se masque s'il n'y a pas de saison active
 * (intersaison, ou tables pas encore déployées). Les objectifs/quêtes
 * quotidiens viendront enrichir cette zone en S1.
 */
export function SeasonTrackCard() {
  const { season, ps, tier, tierProgress, daysRemaining, isLoading } = useActiveSeason();

  if (isLoading || !season) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Swords className="h-3 w-3 text-muted-foreground" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Saison {romanize(season.index)}
        </h2>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-4"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(99,102,241,0.14) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      >
        {/* En-tête identité + compte à rebours */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              Saison {romanize(season.index)} — {season.name}
            </p>
            {season.theme && (
              <p className="mt-0.5 truncate font-serif text-[11px] italic text-white/50">
                {season.theme}
              </p>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white/80 ring-1 ring-white/10">
            <CalendarClock className="h-3 w-3" />
            J-{daysRemaining}
          </span>
        </div>

        {/* Palier + PS */}
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              Palier
            </p>
            <p className="text-2xl font-black leading-none text-white">{tier}</p>
          </div>
          <p className="text-xs font-bold" style={{ color: SEASON_COLORS.secondary }}>
            {ps} PS
          </p>
        </div>

        {/* Barre vers le palier suivant */}
        <div className="mt-2">
          <MasteryBar
            percent={tierProgress.progress * 100}
            colors={SEASON_COLORS}
            segments={1}
            height={8}
            showLabel={false}
          />
        </div>
        <p className="mt-1.5 text-right text-[10px] text-white/40">
          {tierProgress.isMax
            ? "Palier maximum atteint 🏆"
            : `Encore ${tierProgress.psToNext} PS avant le palier ${tier + 1}`}
        </p>
      </div>
    </section>
  );
}
