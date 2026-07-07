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

export const ENGINE_REGISTRY: Record<DisciplineId, RegistryEntry> = {
  muscu: StrengthWorkoutEngine,

  // Points d'extension — phases 3 à 6. Descriptors seuls : l'UI doit les
  // afficher désactivés/"bientôt disponible" et ne jamais appeler
  // generate()/toWorkoutRecord() dessus (voir isReadyEngine dans types.ts).
  hyrox: { id: "hyrox", label: "HYROX", comingSoon: true, feedsRankEngine: false },
  course: { id: "course", label: "Course", comingSoon: true, feedsRankEngine: false },
  cardio: { id: "cardio", label: "Cardio", comingSoon: true, feedsRankEngine: false },
  guided: { id: "guided", label: "Activité accompagnée", comingSoon: true, feedsRankEngine: false },
};

export function listEngines(): RegistryEntry[] {
  return Object.values(ENGINE_REGISTRY);
}
