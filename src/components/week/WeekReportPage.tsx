import { Link } from "@tanstack/react-router";
import { ChevronLeft, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekShare } from "@/components/week/WeekShare";
import { useWeekReport } from "@/hooks/useWeekReport";
import { formatKg } from "@/lib/fitness/todayCard";
import {
  describeMinutes,
  isWeekStart,
  weekRangeLabel,
  type WeeklyReport,
} from "@/lib/fitness/weeklyReport";

/** Combien de records on détaille avant de dire « et N autres » : la carte reste une carte, pas une liste. */
const MAX_RECORDS_SHOWN = 5;

function Tile({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white/[0.04] px-3 py-3.5 ring-1 ring-white/5 ${wide ? "col-span-2" : ""}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[26px] font-extrabold leading-none tracking-tight tabular-nums">
        {children}
      </p>
    </div>
  );
}

function VolumeCompare({ report }: { report: WeeklyReport }) {
  if (report.previousVolumeKg === null) return null;
  const max = Math.max(report.volumeKg, report.previousVolumeKg);
  const widthOf = (value: number) => `${Math.max(2, Math.round((value / max) * 100))}%`;
  const delta = report.volumeDeltaPercent;
  return (
    <section
      aria-label="Volume comparé à la semaine précédente"
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
    >
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Volume vs semaine précédente
      </h2>
      <dl className="mt-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <dt className="w-24 shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            Avant
          </dt>
          <dd className="flex min-w-0 flex-1 items-center">
            <span
              className="h-1.5 rounded-full bg-white/25"
              style={{ width: widthOf(report.previousVolumeKg) }}
            />
          </dd>
          <dd className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {formatKg(report.previousVolumeKg)} kg
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-24 shrink-0 whitespace-nowrap text-[11px] font-bold text-primary">
            Cette semaine
          </dt>
          <dd className="flex min-w-0 flex-1 items-center">
            <span
              className="h-1.5 rounded-full bg-primary"
              style={{ width: widthOf(report.volumeKg) }}
            />
          </dd>
          <dd className="shrink-0 whitespace-nowrap text-[11px] font-bold tabular-nums text-primary">
            {formatKg(report.volumeKg)} kg
          </dd>
        </div>
      </dl>
      {delta !== null && (
        <p
          className={`mt-3 text-[12px] font-bold ${delta > 0 ? "text-success" : "text-muted-foreground"}`}
        >
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}
          {Math.abs(delta)} %
        </p>
      )}
    </section>
  );
}

function Records({ report }: { report: WeeklyReport }) {
  if (report.records.length === 0) return null;
  const shown = report.records.slice(0, MAX_RECORDS_SHOWN);
  const hidden = report.records.length - shown.length;
  return (
    <section
      aria-label="Records battus"
      className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"
    >
      <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
        <Trophy aria-hidden className="h-3.5 w-3.5" />
        {report.records.length} record{report.records.length > 1 ? "s" : ""} battu
        {report.records.length > 1 ? "s" : ""}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((record) => (
          <li key={record.key} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold">{record.name}</span>
            <span className="shrink-0 font-extrabold tabular-nums text-primary">
              {record.weight} kg
              {record.previousWeight !== null && (
                <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">
                  +{Math.round((record.weight - record.previousWeight) * 10) / 10} kg
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          et {hidden} autre{hidden > 1 ? "s" : ""}
        </p>
      )}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/semaine"
      className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-white/[0.06] py-2 pl-2.5 pr-4 text-sm font-semibold text-white/90 active:scale-95"
    >
      <ChevronLeft aria-hidden className="h-4 w-4" />
      Mes semaines
    </Link>
  );
}

/**
 * La page d'une semaine — son bilan, daté, rattaché aux Chroniques : tout est dérivé des
 * séances (`lib/fitness/weeklyReport.ts`), rien n'est stocké ni généré. Purement
 * présentationnelle.
 *
 * Une semaine sans séance n'a pas de bilan : on le dit simplement, sans reproche.
 */
export function WeekReportPage({ weekStart }: { weekStart: string }) {
  const valid = isWeekStart(weekStart);
  const { isLoading, report } = useWeekReport(valid ? weekStart : "");

  return (
    <main className="flex flex-1 flex-col px-5 pb-8 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.375rem))]">
      <BackLink />

      {valid && isLoading ? (
        <Skeleton className="h-72 w-full rounded-[26px]" aria-busy="true" />
      ) : !valid || report === null ? (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
          <p className="font-serif text-lg font-semibold italic">Pas de bilan pour cette semaine</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {valid
              ? `Aucune séance de musculation terminée du ${weekRangeLabel(weekStart).replace(" → ", " au ")}.`
              : "Cette semaine n'existe pas."}
          </p>
        </section>
      ) : (
        <article className="flex flex-col gap-4" data-week={report.weekStart}>
          <header className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              {report.label}
            </p>
            <h1 className="mt-2 font-serif text-[30px] font-semibold italic leading-[1.1] tracking-wide">
              {report.headline}
            </h1>
          </header>

          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Séances">
              {report.sessions}
              {report.plannedSessions !== null && (
                <small className="ml-1 text-[12px] font-semibold text-muted-foreground">
                  / {report.plannedSessions} prévues
                </small>
              )}
            </Tile>
            <Tile label="Volume">
              {report.volumeKg > 0 ? (
                <>
                  {formatKg(report.volumeKg)}
                  <small className="ml-1 text-[12px] font-semibold text-muted-foreground">kg</small>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Tile>
            <Tile label="Séries" wide={report.minutes === null}>
              {report.sets}
            </Tile>
            {report.minutes !== null && (
              <Tile label="Temps">{describeMinutes(report.minutes)}</Tile>
            )}
          </div>

          <VolumeCompare report={report} />
          <Records report={report} />

          {report.sentence && (
            <p className="mx-2 text-center font-serif text-[15px] italic leading-relaxed text-white/75">
              {report.sentence}
            </p>
          )}

          <WeekShare report={report} />
        </article>
      )}
    </main>
  );
}
