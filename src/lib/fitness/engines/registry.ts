// ============================================================
// ENGINE_REGISTRY — point d'entrée UNIQUE des moteurs de discipline.
//
// Le Sensei, l'historique et tout futur consommateur lisent ce
// registre — jamais un import direct d'un moteur particulier, jamais
// un if/switch(discipline) ailleurs dans le code. Ajouter une
// discipline = ajouter une entrée ici + créer son fichier moteur.
// Aucune entrée existante n'est modifiée par cet ajout (Open/Closed).
// ============================================================

import type { DisciplineId, RegistryEntry } from "./types";
import { StrengthWorkoutEngine } from "./strengthEngine";
import { CardioWorkoutEngine } from "./cardioEngine";
import { HyroxWorkoutEngine } from "./hyroxEngine";
import { CourseWorkoutEngine } from "./courseEngine";

export const ENGINE_REGISTRY: Record<DisciplineId, RegistryEntry> = {
  muscu: StrengthWorkoutEngine,
  cardio: CardioWorkoutEngine,
  hyrox: HyroxWorkoutEngine,
  course: CourseWorkoutEngine,

  // Point d'extension — phase 6. Descriptor seul : l'UI doit l'afficher
  // désactivé/"bientôt disponible" et ne jamais appeler
  // generate()/toWorkoutRecord() dessus (voir isReadyEngine dans types.ts).
  guided: { id: "guided", label: "Activité accompagnée", comingSoon: true, feedsRankEngine: false },
};

export function listEngines(): RegistryEntry[] {
  return Object.values(ENGINE_REGISTRY);
}
