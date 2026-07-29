import { Activity, Dumbbell } from "lucide-react";
import { ExerciseMuscleBodyMap } from "../BodyMap";
import { SectionCard, MuscleRow } from "../ExerciseAnalysisPrimitives";
import { ROLE_LABELS, type MuscleContribution, type MuscleRole } from "@/lib/fitness/analysis";

// ============================================================
// Muscles sollicités — visualisation corps humain (BodyMap partagé, jamais
// dupliqué) + détail par rôle. `equipment`/`secondaryMuscles` viennent du
// dataset (config.equipment / config.secondary_muscles) et sont affichés
// tels quels quand le moteur de rôles ne les couvre pas déjà.
// ============================================================

export function ExerciseMuscleSection({
  muscles,
  equipment,
}: {
  muscles: MuscleContribution[];
  equipment?: string | null;
}) {
  if (muscles.length === 0 && !equipment) return null;

  return (
    <SectionCard icon={<Activity className="h-3.5 w-3.5" />} title="Muscles sollicités">
      <div className="space-y-4">
        {muscles.length > 0 && <ExerciseMuscleBodyMap muscles={muscles} />}

        {(["primary", "secondary", "stabilizer"] as MuscleRole[]).map((role) => {
          const group = muscles.filter((m) => m.role === role);
          if (group.length === 0) return null;
          return (
            <div key={role}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {ROLE_LABELS[role]}
              </p>
              <div className="space-y-2">
                {group.map((m) => (
                  <MuscleRow key={m.id} m={m} />
                ))}
              </div>
            </div>
          );
        })}

        {equipment && (
          <div className="flex items-center gap-2 border-t border-border pt-3 text-[11.5px] text-foreground/80">
            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Équipement :</span>
            <span className="font-medium capitalize">{equipment}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
