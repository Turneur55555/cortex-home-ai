import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasServerRewardSnapshot,
  resolveRewardConfirmation,
  type RewardServerSnapshot,
} from "./rewardConfirmation";

/**
 * CHANTIER 4 — CRIT-03. Règle unique couverte ici : une récompense n'est
 * « confirmée » QUE si le serveur a réellement déposé ses quatre compteurs
 * sur la séance. Tout le reste est un état d'attente honnête.
 */

const full: RewardServerSnapshot = {
  xp_before: 1200,
  xp_after: 1350,
  level_before: 7,
  level_after: 8,
};

describe("hasServerRewardSnapshot", () => {
  it("vrai quand les quatre compteurs serveur sont présents", () => {
    expect(hasServerRewardSnapshot(full)).toBe(true);
  });

  it("accepte des compteurs à zéro (première séance : xp_before = 0)", () => {
    expect(
      hasServerRewardSnapshot({ xp_before: 0, xp_after: 50, level_before: 1, level_after: 1 }),
    ).toBe(true);
  });

  it("faux si la ligne n'a pas encore été lue", () => {
    expect(hasServerRewardSnapshot(null)).toBe(false);
    expect(hasServerRewardSnapshot(undefined)).toBe(false);
  });

  it("faux si un seul compteur manque — jamais de demi-confirmation", () => {
    expect(hasServerRewardSnapshot({ ...full, xp_after: null })).toBe(false);
    expect(hasServerRewardSnapshot({ ...full, xp_before: null })).toBe(false);
    expect(hasServerRewardSnapshot({ ...full, level_before: null })).toBe(false);
    expect(hasServerRewardSnapshot({ ...full, level_after: null })).toBe(false);
  });

  it("faux pour une séance jamais traitée par le trigger (tout à null)", () => {
    expect(
      hasServerRewardSnapshot({
        xp_before: null,
        xp_after: null,
        level_before: null,
        level_after: null,
      }),
    ).toBe(false);
  });
});

describe("resolveRewardConfirmation", () => {
  it("ONLINE, serveur a versé l'XP → confirmed", () => {
    expect(
      resolveRewardConfirmation({ snapshot: full, hasQueuedWorkoutOps: false, isOnline: true }),
    ).toBe("confirmed");
  });

  it("OFFLINE → jamais confirmé, même sans opération en file", () => {
    expect(
      resolveRewardConfirmation({ snapshot: null, hasQueuedWorkoutOps: false, isOnline: false }),
    ).toBe("syncing");
  });

  it("ONLINE mais clôture encore en file → syncing (aucune récompense serveur possible)", () => {
    expect(
      resolveRewardConfirmation({ snapshot: null, hasQueuedWorkoutOps: true, isOnline: true }),
    ).toBe("syncing");
  });

  it("ONLINE, clôture partie, récompense pas encore relue → awaiting-server", () => {
    expect(
      resolveRewardConfirmation({ snapshot: null, hasQueuedWorkoutOps: false, isOnline: true }),
    ).toBe("awaiting-server");
  });

  it("une ligne serveur lue mais sans compteurs n'est PAS une confirmation", () => {
    const empty: RewardServerSnapshot = {
      xp_before: null,
      xp_after: null,
      level_before: null,
      level_after: null,
    };
    expect(
      resolveRewardConfirmation({ snapshot: empty, hasQueuedWorkoutOps: true, isOnline: true }),
    ).toBe("syncing");
  });

  it("une récompense déjà confirmée le reste si l'appareil repasse hors ligne", () => {
    // La valeur affichée vient bien du serveur : la repasser en « en attente »
    // serait tout aussi malhonnête que d'inventer une progression.
    expect(
      resolveRewardConfirmation({ snapshot: full, hasQueuedWorkoutOps: true, isOnline: false }),
    ).toBe("confirmed");
  });
});

/**
 * Garde-fou de câblage (même esprit que `offlineQueryConvention.test.ts`) :
 * la décision ci-dessus ne sert à rien si l'écran l'ignore. Le projet ne
 * monte pas de composants React en test (suite en environnement `node`), on
 * vérifie donc au niveau des sources que l'écran consomme bien l'état et
 * conditionne l'affichage de l'XP.
 */
describe("câblage de l'écran de récompense", () => {
  const screen = readFileSync(
    join(process.cwd(), "src/components/fitness/session/SessionRewardScreen.tsx"),
    "utf8",
  );

  it("l'écran lit l'état de confirmation renvoyé par useSessionReward", () => {
    expect(screen).toContain("confirmation");
    expect(screen).toMatch(/rewardPending\s*=\s*confirmation !== "confirmed"/);
  });

  it("le montant d'XP n'est jamais rendu tant que la récompense n'est pas confirmée", () => {
    expect(screen).toContain("{hasXp && !rewardPending && (");
  });

  it("un état honnête est proposé pour chacun des deux cas d'attente", () => {
    expect(screen).toContain("Récompense en attente de synchronisation");
    expect(screen).toContain("Calcul de ta récompense");
  });
});
