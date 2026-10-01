import { rankGlowShadow, rankTextGlow, rankThemeByKey } from "@/components/rpg/rankTheme";
import type { RankKey } from "@/lib/fitness/exerciseRanks";
import { formatKg } from "@/lib/fitness/todayCard";
import { describeMinutes, type WeeklyReport } from "@/lib/fitness/weeklyReport";

/** Combien de records on nomme sur l'image : une carte reste une carte, pas une liste. */
const MAX_RECORDS = 3;

/**
 * G28 — la carte partageable d'UNE SEMAINE (F26), rendue dans le cadre d'export 9:16.
 *
 * Purement présentationnelle, et que des faits : chaque chiffre vient du bilan déjà affiché sur la
 * page de la semaine (`buildWeeklyReport`) — rien n'est recalculé ici. Un bloc dont le fait
 * manque n'apparaît pas (pas de volume nul, pas de comparaison sans semaine précédente, pas de
 * phrase sans fait) ; une baisse de volume reste sobre, jamais en rouge. Les couleurs sont celles
 * du rang du joueur, via `rankTheme.ts`.
 */
export function WeekShareCard({ report, rankKey }: { report: WeeklyReport; rankKey: RankKey }) {
  const theme = rankThemeByKey(rankKey);
  const delta = report.volumeDeltaPercent;
  const shown = report.records.slice(0, MAX_RECORDS);
  const hidden = report.records.length - shown.length;

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-[26px] border border-white/10 px-6 py-7"
      style={{
        background: [
          `radial-gradient(120% 70% at 50% 0%, ${theme.glow} 0%, transparent 62%)`,
          "linear-gradient(180deg, #161311 0%, #0b0a09 100%)",
        ].join(", "),
        boxShadow: rankGlowShadow(theme.glow, -10, 60, -28),
      }}
    >
      <header className="text-center">
        <p
          className="text-[13px] font-black uppercase tracking-[0.22em]"
          style={{ color: theme.secondary }}
        >
          {report.label}
        </p>
        <h2
          className="mt-3 font-serif text-[36px] font-semibold italic leading-[1.1] tracking-wide text-white"
          style={{ textShadow: rankTextGlow(theme.glow, 16) }}
        >
          {report.headline}
        </h2>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Stat label="Séances" theme={theme}>
          {report.sessions}
          {report.plannedSessions !== null && (
            <small className="ml-1 text-[13px] font-semibold text-white/50">
              / {report.plannedSessions} prévues
            </small>
          )}
        </Stat>
        <Stat label="Volume" theme={theme}>
          {report.volumeKg > 0 ? (
            <>
              {formatKg(report.volumeKg)}
              <small className="ml-1 text-[13px] font-semibold text-white/50">kg</small>
            </>
          ) : (
            <span className="text-white/40">—</span>
          )}
        </Stat>
        <Stat label="Séries" theme={theme} wide={report.minutes === null}>
          {report.sets}
        </Stat>
        {report.minutes !== null && (
          <Stat label="Temps" theme={theme}>
            {describeMinutes(report.minutes)}
          </Stat>
        )}
      </div>

      {delta !== null && (
        <p className="mt-3 text-center text-[13px] font-bold text-white/70">
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}
          {Math.abs(delta)} % de volume sur la semaine précédente
        </p>
      )}

      {shown.length > 0 && (
        <section
          aria-label="Records battus"
          className="mt-5 rounded-2xl border px-4 py-3.5"
          style={{ borderColor: `${theme.secondary}55`, background: `${theme.secondary}14` }}
        >
          <p
            className="text-[11px] font-black uppercase tracking-[0.2em]"
            style={{ color: theme.secondary }}
          >
            {report.records.length} record{report.records.length > 1 ? "s" : ""} battu
            {report.records.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {shown.map((record) => (
              <li
                key={record.key}
                className="flex items-baseline justify-between gap-3 text-[14px]"
              >
                <span className="min-w-0 truncate font-semibold text-white">{record.name}</span>
                <span className="shrink-0 font-extrabold tabular-nums text-white">
                  {record.weight} kg
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-1.5 text-[12px] text-white/50">
              et {hidden} autre{hidden > 1 ? "s" : ""}
            </p>
          )}
        </section>
      )}

      {report.sentence && (
        <p className="mt-5 text-center font-serif text-[16px] italic leading-relaxed text-white/75">
          {report.sentence}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  theme,
  wide,
  children,
}: {
  label: string;
  theme: ReturnType<typeof rankThemeByKey>;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3.5 text-center ${wide ? "col-span-2" : ""}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{label}</p>
      <p
        className="mt-1 text-[30px] font-black leading-none tracking-tight tabular-nums"
        style={{ color: theme.secondary, textShadow: rankTextGlow(theme.glow, 18) }}
      >
        {children}
      </p>
    </div>
  );
}
