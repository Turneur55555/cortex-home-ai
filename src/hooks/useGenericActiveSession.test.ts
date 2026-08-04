import { describe, expect, it } from "vitest";
import { HYBRID_BLOCKS_KEY } from "./useGenericActiveSession";

// Musculation hybride (2026-08-04) — garde-fou anti-régression : les blocs
// d'une séance muscu (workout_segments lus via useActiveWorkoutSegments) ne
// doivent JAMAIS partager la clé de cache React Query que SeancesTab.tsx
// utilise pour décider d'afficher ActiveWorkoutView (muscu) ou
// ActiveGenericSessionView (les 5 autres disciplines) — un cache partagé
// ferait fuiter un faux "workout générique actif" pendant une séance muscu
// hybride et basculerait l'écran par erreur. Voir le commentaire de tête de
// HYBRID_BLOCKS_KEY dans useGenericActiveSession.ts pour le détail complet.
describe("HYBRID_BLOCKS_KEY", () => {
  it("est une clé de cache distincte de la clé générique globale ['fitness','active_generic_workout']", () => {
    expect(HYBRID_BLOCKS_KEY).not.toEqual(["fitness", "active_generic_workout"]);
    expect(HYBRID_BLOCKS_KEY).toEqual(["fitness", "active_workout_segments"]);
  });
});
