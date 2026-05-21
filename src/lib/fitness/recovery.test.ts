import { describe, it, expect } from "vitest";
import { computeRecovery, RECOVERY_COLORS, RECOVERY_LABELS, type Workout } from "./recovery";

// Date de référence fixe pour rendre les tests déterministes
const NOW = new Date("2026-05-21T12:00:00Z");

// Helpers pour construire des dates relatives à NOW
function hoursAgo(hours: number): string {
  const d = new Date(NOW.getTime() - hours * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

describe("computeRecovery", () => {
  it("retourne 'unknown' pour tous les muscles si aucun entraînement", () => {
    const result = computeRecovery([], NOW);
    for (const [, recovery] of result) {
      expect(recovery.status).toBe("unknown");
      expect(recovery.lastTrained).toBeNull();
      expect(recovery.hoursSinceLast).toBeNull();
      expect(recovery.hoursRemaining).toBeNull();
    }
  });

  it("retourne une Map avec tous les muscles du MUSCLE_META", () => {
    const result = computeRecovery([], NOW);
    // 14 muscles attendus
    expect(result.size).toBe(14);
  });

  it("marque un muscle 'fatigued' si entraîné il y a moins de 48h", () => {
    const workout: Workout = {
      date: hoursAgo(24),  // entraîné il y a 24h
      exercises: [{ name: "bench press" }],
    };
    const result = computeRecovery([workout], NOW);
    const pec = result.get("pectoraux");
    expect(pec).toBeDefined();
    expect(pec!.status).toBe("fatigued");
  });

  it("marque un muscle 'recovering' si entraîné entre 48h et la fenêtre de récup", () => {
    // Les pectoraux ont une fenêtre de 72h — entraîné il y a 60h → recovering
    const workout: Workout = {
      date: hoursAgo(60),
      exercises: [{ name: "bench press" }],
    };
    const result = computeRecovery([workout], NOW);
    const pec = result.get("pectoraux");
    expect(pec).toBeDefined();
    expect(pec!.status).toBe("recovering");
  });

  it("marque un muscle 'ready' si entraîné au-delà de sa fenêtre de récup", () => {
    // Les pectoraux ont une fenêtre de 72h — entraîné il y a 80h → ready
    const workout: Workout = {
      date: hoursAgo(80),
      exercises: [{ name: "bench press" }],
    };
    const result = computeRecovery([workout], NOW);
    const pec = result.get("pectoraux");
    expect(pec).toBeDefined();
    expect(pec!.status).toBe("ready");
  });

  it("prend en compte le dernier entraînement quand plusieurs workouts existent", () => {
    const workouts: Workout[] = [
      { date: hoursAgo(100), exercises: [{ name: "squat" }] }, // vieux
      { date: hoursAgo(24), exercises: [{ name: "squat" }] },  // récent → fatigued
    ];
    const result = computeRecovery(workouts, NOW);
    const quads = result.get("quadriceps");
    expect(quads!.status).toBe("fatigued");
  });

  it("retourne 'unknown' pour les muscles non sollicités dans les workouts", () => {
    const workout: Workout = {
      date: hoursAgo(10),
      exercises: [{ name: "bench press" }], // cible pec, triceps, épaules
    };
    const result = computeRecovery([workout], NOW);
    // Le dos n'est pas touché par bench press
    const dos = result.get("dos");
    expect(dos!.status).toBe("unknown");
  });

  it("calcule hoursRemaining à 0 si la fenêtre de récup est dépassée", () => {
    const workout: Workout = {
      date: hoursAgo(100),
      exercises: [{ name: "bench press" }],
    };
    const result = computeRecovery([workout], NOW);
    const pec = result.get("pectoraux");
    expect(pec!.hoursRemaining).toBe(0);
    expect(pec!.status).toBe("ready");
  });

  it("gère une liste d'exercices null dans un workout", () => {
    const workout: Workout = {
      date: hoursAgo(10),
      exercises: null,
    };
    // Ne doit pas planter
    expect(() => computeRecovery([workout], NOW)).not.toThrow();
    const result = computeRecovery([workout], NOW);
    // Aucun muscle ne doit être entraîné
    for (const [, recovery] of result) {
      expect(recovery.status).toBe("unknown");
    }
  });

  it("gère un exercice inconnu sans planter", () => {
    const workout: Workout = {
      date: hoursAgo(10),
      exercises: [{ name: "exercice_inventé_xyz" }],
    };
    expect(() => computeRecovery([workout], NOW)).not.toThrow();
    const result = computeRecovery([workout], NOW);
    // Aucun muscle ne doit être entraîné (exercice non reconnu → muscles vides)
    for (const [, recovery] of result) {
      expect(recovery.status).toBe("unknown");
    }
  });

  it("chaque MuscleRecovery a l'id et le label corrects", () => {
    const result = computeRecovery([], NOW);
    const pec = result.get("pectoraux");
    expect(pec!.id).toBe("pectoraux");
    expect(pec!.label).toBe("Pectoraux");
    expect(pec!.recoveryWindowHours).toBe(72);
  });
});

describe("RECOVERY_COLORS", () => {
  it("contient les 4 statuts attendus", () => {
    expect(RECOVERY_COLORS).toHaveProperty("fatigued");
    expect(RECOVERY_COLORS).toHaveProperty("recovering");
    expect(RECOVERY_COLORS).toHaveProperty("ready");
    expect(RECOVERY_COLORS).toHaveProperty("unknown");
  });

  it("chaque statut a une couleur fill et stroke", () => {
    for (const [, colors] of Object.entries(RECOVERY_COLORS)) {
      expect(colors.fill).toBeTruthy();
      expect(colors.stroke).toBeTruthy();
    }
  });
});

describe("RECOVERY_LABELS", () => {
  it("contient un label pour chaque statut", () => {
    expect(RECOVERY_LABELS.fatigued).toBe("Fatigué");
    expect(RECOVERY_LABELS.recovering).toBe("En récup");
    expect(RECOVERY_LABELS.ready).toBe("Prêt");
    expect(RECOVERY_LABELS.unknown).toBe("Inconnu");
  });
});
