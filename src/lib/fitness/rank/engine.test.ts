// ============================================================
// Simulation sur profils représentatifs — sert à valider les
// barèmes AVANT de les figer, pas encore branché dans l'app.
// Lance `npm run test -- rank/engine` pour voir le tableau récapitulatif.
// ============================================================

import { describe, expect, it } from "vitest";
import { DEFAULT_RANK_ENGINE_CONFIG } from "./config";
import { computeRankState } from "./engine";
import { RANK_TIERS, LEVELS_PER_RANK } from "../exerciseRanks";
import type { SessionInput } from "./types";

const ROMAN = ["I", "II", "III", "IV", "V"];

function labelForTier(tierIndex: number): string {
  const idx = Math.max(0, Math.min(29, Math.round(tierIndex)));
  const rank = RANK_TIERS[Math.floor(idx / LEVELS_PER_RANK)];
  const level = (idx % LEVELS_PER_RANK) + 1;
  return `${rank.label} ${ROMAN[level - 1]}`;
}

function addDays(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function session(date: string, reps: number, weight: number | null): SessionInput {
  return { workoutId: date, date, sets: [{ reps, weight }] };
}

const NOW = new Date("2026-07-05");

interface Profile {
  label: string;
  exercise: string;
  bodyweight: number;
  sessions: SessionInput[];
  now?: Date;
}

const profiles: Profile[] = [
  {
    label: "1. Débutant — 1ère séance",
    exercise: "Squat",
    bodyweight: 70,
    sessions: [session(addDays(NOW, 0), 8, 40)],
  },
  {
    label: "2. Intermédiaire — 1ère séance (exemple utilisateur)",
    exercise: "Tirage vertical prise serrée",
    bodyweight: 75,
    sessions: [session(addDays(NOW, 0), 10, 70)],
  },
  {
    label: "3. Intermédiaire — même niveau confirmé sur 10 séances / 87j",
    exercise: "Tirage vertical prise serrée",
    bodyweight: 75,
    sessions: [
      session(addDays(NOW, -90), 10, 50),
      session(addDays(NOW, -80), 10, 53),
      session(addDays(NOW, -70), 10, 55),
      session(addDays(NOW, -60), 10, 58),
      session(addDays(NOW, -50), 10, 60),
      session(addDays(NOW, -40), 10, 63),
      session(addDays(NOW, -30), 10, 66),
      session(addDays(NOW, -20), 10, 70),
      session(addDays(NOW, -10), 10, 72),
      session(addDays(NOW, -3), 11, 70),
    ],
  },
  {
    label: "4. Avancé — progression régulière longue durée",
    exercise: "Soulevé de terre",
    bodyweight: 80,
    sessions: [
      session(addDays(NOW, -120), 5, 120),
      session(addDays(NOW, -110), 5, 122.5),
      session(addDays(NOW, -95), 5, 125),
      session(addDays(NOW, -85), 4, 130),
      session(addDays(NOW, -70), 4, 135),
      session(addDays(NOW, -60), 3, 140),
      session(addDays(NOW, -45), 3, 145),
      session(addDays(NOW, -35), 3, 150),
      session(addDays(NOW, -20), 3, 155),
      session(addDays(NOW, -10), 3, 158),
      session(addDays(NOW, -3), 3, 160),
    ],
  },
  {
    label: "5. Expert en plateau — charge stable, actif",
    exercise: "Développé militaire",
    bodyweight: 78,
    sessions: Array.from({ length: 10 }, (_, i) => session(addDays(NOW, -3 - i * 12), 5, 65)),
  },
  {
    label: "6. Même profil qu'en 4, mais arrêt de 100 jours",
    exercise: "Soulevé de terre",
    bodyweight: 80,
    now: new Date("2026-07-05"),
    sessions: [
      session(addDays(new Date("2026-03-01"), -120), 5, 120),
      session(addDays(new Date("2026-03-01"), -95), 5, 125),
      session(addDays(new Date("2026-03-01"), -70), 4, 135),
      session(addDays(new Date("2026-03-01"), -45), 3, 145),
      session(addDays(new Date("2026-03-01"), -20), 3, 155),
      session(addDays(new Date("2026-03-01"), -3), 3, 160),
    ],
  },
  {
    label: "7. Poids de corps — débutant tractions strictes",
    exercise: "Traction",
    bodyweight: 80,
    sessions: [session(addDays(NOW, 0), 3, null)],
  },
  {
    label: "8. Isolation — curl haltère",
    exercise: "Curl haltère",
    bodyweight: 75,
    sessions: [session(addDays(NOW, 0), 10, 12)],
  },
  {
    label: "9. Élite — référence Primordial confirmée sur 15 séances / 104j",
    exercise: "Développé couché",
    bodyweight: 80,
    sessions: [
      session(addDays(NOW, -150), 5, 85),
      session(addDays(NOW, -135), 5, 90),
      session(addDays(NOW, -120), 5, 95),
      session(addDays(NOW, -105), 5, 100),
      session(addDays(NOW, -90), 5, 103),
      session(addDays(NOW, -75), 5, 104),
      session(addDays(NOW, -60), 5, 103),
      session(addDays(NOW, -50), 5, 105),
      session(addDays(NOW, -40), 5, 104),
      session(addDays(NOW, -30), 5, 106),
      session(addDays(NOW, -20), 5, 105),
      session(addDays(NOW, -15), 5, 107),
      session(addDays(NOW, -10), 5, 106),
      session(addDays(NOW, -5), 5, 108),
      session(addDays(NOW, -1), 5, 107),
    ],
  },
];

describe("moteur Rang/Maîtrise — profils représentatifs", () => {
  it("produit des rangs cohérents sur les 8 profils (voir tableau console)", () => {
    const rows = profiles.map((p) => {
      const result = computeRankState(
        DEFAULT_RANK_ENGINE_CONFIG,
        p.exercise,
        p.sessions,
        p.bodyweight,
        p.now ?? NOW,
      );
      return {
        Profil: p.label,
        Famille: result.family,
        "Ratio/Reps brut": result.rawRatioOrReps.toFixed(2),
        "Position brute (0-30)": result.rawTierPosition.toFixed(1),
        "Rang affiché": labelForTier(result.confirmedTierIndex),
        "Maîtrise %": result.masteryPercent,
        Indice: result.nextRankHint,
      };
    });
    // eslint-disable-next-line no-console
    console.table(rows);

    // Sanity checks argumentés (pas de valeurs figées à la décimale près) :

    // 1. Débutant : Guerrier (ratio 0.72 → bande 0.5-0.9)
    const beginner = computeRankState(DEFAULT_RANK_ENGINE_CONFIG, "Squat", profiles[0].sessions, 70, NOW);
    expect(beginner.confirmedTierIndex).toBeGreaterThanOrEqual(5);
    expect(beginner.confirmedTierIndex).toBeLessThan(10);

    // 2. Intermédiaire 1ère séance : plafond potentiel en zone Olympien,
    // mais NON confirmé → capé juste sous le seuil (Titan haut), mastery élevée.
    const interFirst = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Tirage vertical prise serrée",
      profiles[1].sessions,
      75,
      NOW,
    );
    expect(interFirst.rawTierPosition).toBeGreaterThanOrEqual(20);
    expect(interFirst.confirmedTierIndex).toBeLessThan(20);
    expect(interFirst.masteryPercent).toBeGreaterThanOrEqual(60);

    // 3. Même niveau confirmé sur 10 séances / 87j → Olympien réellement atteint
    // (constance démontrée dans le temps, pas juste un pic récent).
    const interConfirmed = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Tirage vertical prise serrée",
      profiles[2].sessions,
      75,
      NOW,
    );
    expect(interConfirmed.confirmedTierIndex).toBeGreaterThanOrEqual(20);

    // 4. Avancé : Olympien avec expérience/fréquence/consistance élevées.
    const advanced = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Soulevé de terre",
      profiles[3].sessions,
      80,
      NOW,
    );
    expect(advanced.confirmedTierIndex).toBeGreaterThanOrEqual(20);

    // 5. Plateau actif : rang maintenu, mastery modérée (pas de bonus overload/PR).
    const plateau = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Développé militaire",
      profiles[4].sessions,
      78,
      NOW,
    );
    expect(plateau.confirmedTierIndex).toBeGreaterThanOrEqual(15);

    // 6. Arrêt prolongé : le rang recule d'au plus 1 palier vs. le même
    // historique évalué sans le trou d'inactivité.
    const withGap = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Soulevé de terre",
      profiles[5].sessions,
      80,
      new Date("2026-07-05"),
    );
    const withoutGap = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Soulevé de terre",
      profiles[5].sessions,
      80,
      new Date("2026-03-08"), // proche de la dernière séance, pas de décroissance
    );
    expect(withoutGap.confirmedTierIndex - withGap.confirmedTierIndex).toBeLessThanOrEqual(1);
    expect(withoutGap.confirmedTierIndex - withGap.confirmedTierIndex).toBeGreaterThanOrEqual(0);

    // 7. Poids de corps débutant : 3 reps = tout début de Guerrier.
    const bodyweightBeginner = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Traction",
      profiles[6].sessions,
      80,
      NOW,
    );
    expect(bodyweightBeginner.family).toBe("poids_de_corps");
    expect(bodyweightBeginner.confirmedTierIndex).toBeGreaterThanOrEqual(4);
    expect(bodyweightBeginner.confirmedTierIndex).toBeLessThan(10);

    // 8. Isolation : classification correcte.
    const isolation = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Curl haltère",
      profiles[7].sessions,
      75,
      NOW,
    );
    expect(isolation.family).toBe("isolation");

    // 9. Référence Primordial : seule une constance longue et étalée y donne accès.
    const elite = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Développé couché",
      profiles[8].sessions,
      80,
      NOW,
    );
    expect(elite.confirmedTierIndex).toBeGreaterThanOrEqual(25);

    // Un sous-ensemble de seulement 4 séances (extrait des 4 dernières) ne
    // suffit PAS à confirmer Primordial : ni l'expérience (15 requises), ni
    // l'étalement dans le temps ne sont réunis avec si peu de séances.
    const eliteTooFewSessions = computeRankState(
      DEFAULT_RANK_ENGINE_CONFIG,
      "Développé couché",
      profiles[8].sessions.slice(-4),
      80,
      NOW,
    );
    expect(eliteTooFewSessions.confirmedTierIndex).toBeLessThan(25);
  });
});
