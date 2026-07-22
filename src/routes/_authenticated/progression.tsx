import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import { ProfileRPGData, type ProfileRPGDataValue } from "@/components/profile/rpg/ProfileRPGData";
import { RPGProgressionSection } from "@/components/profile/rpg/RPGProgressionSection";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";
import { StatChip } from "@/components/profile/shared";
import { computeBroadActivity, CATALOG_GROUPS } from "@/lib/profile/achievements/muscleVolume";
import { gradeName } from "@/lib/fitness/rpg/grade";

export const Route = createFileRoute("/_authenticated/progression")({
  head: () => ({
    meta: [
      { title: "Progression RPG — ICORTEX" },
      {
        name: "description",
        content: "Le détail complet de ta progression : rangs, exercices, records.",
      },
    ],
  }),
  component: ProgressionPage,
});

function ProgressionPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Progression RPG</h1>
      </header>

      <ProfileRPGData>
        {({
          rankAggregate,
          achievements,
          topExercises,
          nameByKey,
          histByName,
          volByName,
          prByName,
          workouts,
        }) => (
          <ProgressionDetail
            rankAggregate={rankAggregate}
            achievements={achievements}
            topExercises={topExercises}
            nameByKey={nameByKey}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
            workouts={workouts}
          />
        )}
      </ProfileRPGData>
    </main>
  );
}

function ProgressionDetail({
  rankAggregate,
  achievements,
  topExercises,
  nameByKey,
  histByName,
  volByName,
  prByName,
  workouts,
}: Pick<
  ProfileRPGDataValue,
  | "rankAggregate"
  | "achievements"
  | "topExercises"
  | "nameByKey"
  | "histByName"
  | "volByName"
  | "prByName"
  | "workouts"
>) {
  const broad = useMemo(() => computeBroadActivity(workouts, 8), [workouts]);
  const previewExercises = broad.broadExercises.length > 0 ? broad.broadExercises : topExercises;

  return (
    <>
      <RPGProgressionSection />

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Détails
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {rankAggregate.average && (
            <StatChip
              label="Rang moyen"
              value={`${rankAggregate.average.rank.label} — ${gradeName(rankAggregate.average.rank.key, rankAggregate.average.levelInRank)}`}
            />
          )}
          {broad.dominantMuscleGroup && (
            <StatChip
              label="Catégorie dominante"
              value={broad.dominantMuscleGroup}
              hint={`${broad.categoriesTrainedCount}/${CATALOG_GROUPS.length} travaillées`}
            />
          )}
          <StatChip
            label="Activité récente"
            value={`${broad.distinctWeeksActive} semaine${broad.distinctWeeksActive > 1 ? "s" : ""}`}
            hint={`${broad.distinctMonthsActive} mois actifs`}
          />
          {achievements.rarestUnlocked && (
            <StatChip label="Succès le plus rare" value={achievements.rarestUnlocked.def.title} />
          )}
        </div>
      </section>

      {previewExercises.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Rang par exercice
          </h2>
          <ExerciseRankStrip
            topExercises={previewExercises}
            nameByKey={nameByKey}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
          />
        </section>
      )}
    </>
  );
}
