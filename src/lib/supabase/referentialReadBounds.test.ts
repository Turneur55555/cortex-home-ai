import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHANTIER A — LECTURES DE RÉFÉRENTIEL BORNÉES (AUD-01 / AUD-02 / AUD-03).
 *
 * Ces tests font tourner les VRAIES lectures des hooks contre un serveur
 * simulé qui reproduit la seule contrainte qui compte ici : PostgREST
 * applique un plafond `max-rows` **silencieux** — une réponse trop large
 * revient rabotée, sans erreur, sans en-tête d'alerte, sans rien.
 *
 * POURQUOI DES FIXTURES SURDIMENSIONNÉES : un test qui passerait avec les
 * volumes actuels de la base ne démontrerait rien du tout, puisque c'est
 * précisément le DÉPASSEMENT du plafond qui déclenchait la perte. Chaque
 * fixture ci-dessous dépasse donc délibérément le plafond simulé, et
 * plusieurs cas abaissent ce plafond pour vérifier que le résultat n'en
 * dépend pas (c'est une configuration serveur, inconnue du client).
 *
 * Le journal des requêtes est vérifié autant que le résultat : c'est lui qui
 * prouve le BORNAGE (pagination réelle, `in(...)` découpé, colonnes
 * demandées) et pas seulement que le compte est bon.
 */

interface Row extends Record<string, unknown> {
  id: string;
}

interface RequestLog {
  table: string;
  columns: string;
  eq: Record<string, unknown>;
  inColumn?: string;
  inCount?: number;
  orders: string[];
  rangeFrom?: number;
  rangeTo?: number;
  returned: number;
}

const server = new Map<string, Row[]>();
const requests: RequestLog[] = [];
/** Plafond `max-rows` du simulateur, réglable PAR TABLE (config SERVEUR). */
let maxRowsByTable: Record<string, number> = {};
const DEFAULT_MAX_ROWS = 1_000;
/** Table dont la prochaine lecture échouera (coupure réseau simulée). */
let failTable: string | null = null;

function compareBy(orders: { column: string; ascending: boolean }[]) {
  return (a: Row, b: Row): number => {
    for (const { column, ascending } of orders) {
      const av = a[column];
      const bv = b[column];
      if (av === bv) continue;
      // Comparaison NUMÉRIQUE quand les deux valeurs le sont — sinon
      // `sort_order` 10 passerait avant 9, ce que Postgres ne fait pas.
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "") < String(bv ?? "")
            ? -1
            : 1;
      return cmp * (ascending ? 1 : -1);
    }
    return 0;
  };
}

function createFakeSupabase() {
  return {
    from(table: string) {
      const eq: Record<string, unknown> = {};
      const neq: Record<string, unknown> = {};
      const orders: { column: string; ascending: boolean }[] = [];
      let inFilter: { column: string; values: string[] } | null = null;
      let columns = "";
      let countRequested = false;

      const exec = async (range?: { from: number; to: number }) => {
        if (failTable === table) {
          failTable = null;
          return { data: null, error: new Error(`réseau coupé (${table})`), count: null };
        }
        let rows = (server.get(table) ?? []).filter(
          (row) =>
            Object.entries(eq).every(([c, v]) => row[c] === v) &&
            Object.entries(neq).every(([c, v]) => row[c] !== v),
        );
        if (inFilter) {
          const set = new Set(inFilter.values);
          rows = rows.filter((row) => set.has(row[inFilter!.column] as string));
        }
        rows = [...rows].sort(compareBy(orders));
        // `count: "exact"` porte sur le jeu FILTRÉ, avant pagination.
        const count = countRequested ? rows.length : null;
        if (range) rows = rows.slice(range.from, range.to + 1);
        // Plafond serveur appliqué EN DERNIER et SANS erreur — comme PostgREST.
        const truncated = rows.slice(0, maxRowsByTable[table] ?? DEFAULT_MAX_ROWS);
        requests.push({
          table,
          columns,
          eq: { ...eq },
          inColumn: inFilter?.column,
          inCount: inFilter?.values.length,
          orders: orders.map((o) => o.column),
          rangeFrom: range?.from,
          rangeTo: range?.to,
          returned: truncated.length,
        });
        // Projection : ne renvoie que les colonnes demandées, alias
        // `x:config->>y` compris — c'est ainsi qu'on prouve qu'une colonne
        // volumineuse (description, media, config) n'est PLUS rapatriée.
        const wanted = columns
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const project = (row: Row) => {
          if (wanted.length === 0 || wanted.includes("*")) return { ...row };
          const out: Row = { id: row.id };
          for (const col of wanted) {
            const alias = /^([\w]+)\s*:\s*([\w]+)->>?([\w]+)$/.exec(col);
            if (alias) {
              const source = row[alias[2]] as Record<string, unknown> | null | undefined;
              out[alias[1]] = source?.[alias[3]] ?? null;
              continue;
            }
            out[col] = row[col];
          }
          return out;
        };
        return { data: truncated.map(project), error: null, count };
      };

      const builder: Record<string, unknown> = {
        select(cols: string, options?: { count?: "exact"; head?: boolean }) {
          columns = cols;
          countRequested = options?.count === "exact";
          return builder;
        },
        eq(column: string, value: unknown) {
          eq[column] = value;
          return builder;
        },
        neq(column: string, value: unknown) {
          neq[column] = value;
          return builder;
        },
        in(column: string, values: string[]) {
          inFilter = { column, values };
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orders.push({ column, ascending: options?.ascending !== false });
          return builder;
        },
        range: (from: number, to: number) => exec({ from, to }),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          exec().then(resolve, reject),
      };
      return builder;
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return createFakeSupabase();
  },
}));
vi.mock("@/integrations/supabase/db", () => ({
  get db() {
    return createFakeSupabase();
  },
}));

// Imports APRÈS les mocks (vi.mock est hoisté).
import { fetchFullExerciseCatalog } from "@/hooks/useExerciseCatalog";
import { fetchCatalogMediaMap, fetchMediaMapForExercises } from "@/hooks/useExerciseCatalogEntry";
import { fetchExerciseSessions, fetchUserExerciseInstances } from "@/hooks/useExerciseSetHistory";
import { fetchCourseSegmentInstances } from "@/hooks/useSegmentHistory";

const USER = "11111111-1111-4111-8111-111111111111";

function pad(n: number, width = 5) {
  return String(n).padStart(width, "0");
}

beforeEach(() => {
  server.clear();
  requests.length = 0;
  maxRowsByTable = {};
  failTable = null;
});

// ══════════════════════════════════════════════════════════════════════════
// AUD-01 — CATALOGUE D'EXERCICES
// ══════════════════════════════════════════════════════════════════════════
describe("AUD-01 — catalogue d'exercices", () => {
  /** 1 477 = le volume réel de `exercise_reference` en discipline muscu. */
  const CATALOG_SIZE = 1_477;

  function seedCatalog(size = CATALOG_SIZE) {
    server.set(
      "exercise_reference",
      Array.from({ length: size }, (_, i) => ({
        id: `ref-${pad(i)}`,
        name: `Exercice ${pad(i)}`,
        category: i % 2 === 0 ? "Pectoraux" : "Dos",
        sort_order: i,
        created_at: "2026-01-01T00:00:00.000Z",
        discipline_id: "muscu",
        // Colonnes volumineuses qui NE DOIVENT PLUS être rapatriées.
        description: "x".repeat(400),
        media: { poids: "lourd" },
        config: { equipment: i % 3 === 0 ? "barre" : "haltères", secondary_muscles: ["a", "b"] },
      })),
    );
    server.set("user_exercise_reference", []);
    server.set("exercises", []);
  }

  it("rapatrie l'INTÉGRALITÉ du catalogue au-delà du plafond max-rows", async () => {
    seedCatalog();
    const rows = await fetchFullExerciseCatalog("muscu");
    // Avant le chantier : 1 000 lignes seulement, en silence.
    expect(rows).toHaveLength(CATALOG_SIZE);
  });

  it("ne perd ni ne duplique aucun exercice", async () => {
    seedCatalog();
    const rows = await fetchFullExerciseCatalog("muscu");
    expect(new Set(rows.map((r) => r.id)).size).toBe(CATALOG_SIZE);
  });

  it("préserve le tri existant (catégorie, sort_order, nom)", async () => {
    seedCatalog();
    const rows = await fetchFullExerciseCatalog("muscu");
    const categories = rows.map((r) => r.category);
    // "Dos" avant "Pectoraux" : tri alphabétique par catégorie, inchangé.
    expect(categories[0]).toBe("Dos");
    expect(categories[categories.length - 1]).toBe("Pectoraux");
    const dos = rows.filter((r) => r.category === "Dos").map((r) => r.sort_order);
    expect(dos).toEqual([...dos].sort((a, b) => a - b));
  });

  it("le résultat NE DÉPEND PAS du plafond serveur", async () => {
    seedCatalog();
    maxRowsByTable = { exercise_reference: 37 };
    const rows = await fetchFullExerciseCatalog("muscu");
    expect(rows).toHaveLength(CATALOG_SIZE);
  });

  it("ne demande PLUS description/media/config — payload réduit", async () => {
    seedCatalog();
    const rows = await fetchFullExerciseCatalog("muscu");
    const catalogRequests = requests.filter((r) => r.table === "exercise_reference");
    for (const request of catalogRequests) {
      expect(request.columns).not.toContain("*");
      expect(request.columns).not.toContain("description");
      expect(request.columns).not.toContain("media");
      expect(request.columns).not.toMatch(/(^|[\s,])config([\s,]|$)/);
    }
    // La donnée réellement utilisée (config.equipment) reste disponible,
    // dans la forme attendue par l'UI.
    expect(rows[0].config?.equipment).toBeDefined();
    expect(rows.some((r) => r.config?.equipment === "barre")).toBe(true);
    // Les colonnes lourdes n'arrivent plus jusqu'au client.
    expect(rows[0].description).toBeUndefined();
    expect(rows[0].media).toBeUndefined();
  });

  it("pagine réellement, en plages contiguës", async () => {
    seedCatalog();
    const pages = requests.length;
    await fetchFullExerciseCatalog("muscu");
    const catalogPages = requests.filter((r) => r.table === "exercise_reference");
    expect(catalogPages.length).toBeGreaterThan(1);
    expect(pages).toBe(0);
    let expected = 0;
    for (const page of catalogPages) {
      expect(page.rangeFrom).toBe(expected);
      expected = (page.rangeTo ?? 0) + 1;
    }
  });

  it("trie par un ordre TOTAL (départage par id)", async () => {
    seedCatalog();
    await fetchFullExerciseCatalog("muscu");
    const first = requests.find((r) => r.table === "exercise_reference")!;
    expect(first.orders).toEqual(["category", "sort_order", "name", "id"]);
  });

  it("fusionne le catalogue personnel et les exercices déjà pratiqués", async () => {
    seedCatalog(3);
    server.set("user_exercise_reference", [
      {
        id: "own-1",
        name: "Mon exercice",
        category: "Perso",
        sort_order: 1,
        created_at: "",
        discipline_id: "muscu",
      },
    ]);
    server.set("exercises", [{ id: "e1", name: "Exercice libre" }]);
    const rows = await fetchFullExerciseCatalog("muscu");
    expect(rows.find((r) => r.name === "Mon exercice")?.owned).toBe(true);
    expect(rows.find((r) => r.name === "Exercice libre")?.category).toBe("Mes exercices");
    expect(rows.find((r) => r.name === "Exercice libre")?.id).toBe("custom__Exercice libre");
  });

  it("tolère toujours l'échec de la lecture des exercices pratiqués", async () => {
    // Contrat PRÉSERVÉ : avant le chantier l'erreur de cette 3e requête
    // n'était pas vérifiée. Faire échouer toute la query viderait l'écran
    // du catalogue sur une erreur transitoire — ce serait une régression.
    seedCatalog(3);
    failTable = "exercises";
    const rows = await fetchFullExerciseCatalog("muscu");
    expect(rows).toHaveLength(3);
  });

  it("laisse en revanche remonter l'échec du catalogue lui-même", async () => {
    seedCatalog(3);
    failTable = "exercise_reference";
    await expect(fetchFullExerciseCatalog("muscu")).rejects.toThrow(/réseau coupé/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUD-02 — MÉDIAS D'EXERCICES
// ══════════════════════════════════════════════════════════════════════════
describe("AUD-02 — médias d'exercices", () => {
  /** 2 566 = le volume réel de `exercise_media`. */
  const MEDIA_SIZE = 2_566;

  function seedMedia(exerciseCount = MEDIA_SIZE / 2) {
    const rows: Row[] = [];
    for (let i = 0; i < exerciseCount; i += 1) {
      rows.push({
        id: `m-${pad(i)}-img`,
        exercise_reference_id: `ref-${pad(i)}`,
        media_type: "image",
        url: `https://x/${i}.webp`,
        is_primary: true,
      });
      rows.push({
        id: `m-${pad(i)}-gif`,
        exercise_reference_id: `ref-${pad(i)}`,
        media_type: "gif",
        url: `https://x/${i}.gif`,
        is_primary: true,
      });
    }
    server.set("exercise_media", rows);
    return rows;
  }

  it("rapatrie TOUS les médias au-delà du plafond max-rows", async () => {
    seedMedia();
    const map = await fetchCatalogMediaMap();
    // Avant : ~1 000 lignes reçues, donc la moitié des exercices privés de
    // photo et de GIF, sans la moindre erreur.
    expect(map.size).toBe(MEDIA_SIZE / 2);
  });

  it("le dernier exercice de la table a bien sa photo ET son GIF", async () => {
    seedMedia();
    const last = `ref-${pad(MEDIA_SIZE / 2 - 1)}`;
    const entry = (await fetchCatalogMediaMap()).get(last);
    expect(entry?.primaryPhotoUrl).toMatch(/\.webp$/);
    expect(entry?.primaryGifUrl).toMatch(/\.gif$/);
    expect(entry?.hasGif).toBe(true);
  });

  it("le résultat NE DÉPEND PAS du plafond serveur", async () => {
    seedMedia();
    maxRowsByTable = { exercise_media: 13 };
    expect((await fetchCatalogMediaMap()).size).toBe(MEDIA_SIZE / 2);
  });

  it("agrège exactement comme avant (photo, gif, vidéo)", async () => {
    server.set("exercise_media", [
      {
        id: "a",
        exercise_reference_id: "ref-1",
        media_type: "image",
        url: "p.webp",
        is_primary: true,
      },
      {
        id: "b",
        exercise_reference_id: "ref-1",
        media_type: "gif",
        url: "g.gif",
        is_primary: false,
      },
      { id: "c", exercise_reference_id: "ref-1", media_type: "video", url: "v", is_primary: false },
    ]);
    const entry = (await fetchCatalogMediaMap()).get("ref-1");
    expect(entry).toEqual({
      primaryPhotoUrl: "p.webp",
      primaryGifUrl: null, // non primaire : inchangé par rapport à avant
      hasGif: true,
      hasVideo: true,
    });
  });

  it("la variante par ids ne lit QUE les exercices affichés", async () => {
    seedMedia();
    const map = await fetchMediaMapForExercises(["ref-00003", "ref-00007"]);
    expect(map.size).toBe(2);
    expect([...map.keys()].sort()).toEqual(["ref-00003", "ref-00007"]);
    // Une seule requête, filtrée : plus jamais 2 566 lignes pour 2 vignettes.
    expect(requests).toHaveLength(1);
    expect(requests[0].inCount).toBe(2);
  });

  it("la variante par ids ne fait AUCUN aller-retour sans exercice", async () => {
    seedMedia();
    expect((await fetchMediaMapForExercises([])).size).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it("la variante par ids découpe un grand nombre d'ids en paquets bornés", async () => {
    seedMedia();
    const ids = Array.from({ length: 250 }, (_, i) => `ref-${pad(i)}`);
    const map = await fetchMediaMapForExercises(ids);
    expect(map.size).toBe(250);
    expect(requests.every((r) => (r.inCount ?? 0) <= 100)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUD-03 — HISTORIQUE ET PROGRESSION
// ══════════════════════════════════════════════════════════════════════════
describe("AUD-03 — historique profond (musculation)", () => {
  it("rapatrie TOUTES les instances d'exercices au-delà du plafond", async () => {
    server.set(
      "exercises",
      Array.from({ length: 2_400 }, (_, i) => ({
        id: `e-${pad(i)}`,
        user_id: USER,
        workout_id: `w-${pad(i % 600)}`,
        name: "Développé couché",
        reps: 8,
        weight: 80,
        sets: 3,
        exercise_reference_id: "ref-1",
      })),
    );
    const rows = await fetchUserExerciseInstances(USER);
    expect(rows).toHaveLength(2_400);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_400);
  });

  it("n'applique AUCUNE fenêtre de 200 séances — l'historique reste profond", async () => {
    // Le store local est borné à 200 séances (WORKOUTS_HYDRATION_LIMIT) ;
    // cet historique-ci ne doit surtout PAS hériter de cette limite, sinon
    // les courbes de progression perdraient tout le passé.
    server.set(
      "exercises",
      Array.from({ length: 600 }, (_, i) => ({
        id: `e-${pad(i)}`,
        user_id: USER,
        workout_id: `w-${pad(i)}`,
        name: "Squat",
        reps: 5,
        weight: 100,
        sets: 3,
        exercise_reference_id: "ref-2",
      })),
    );
    const rows = await fetchUserExerciseInstances(USER);
    expect(rows).toHaveLength(600);
    expect(new Set(rows.map((r) => r.workout_id)).size).toBe(600);
  });

  it("ne lit que les instances de l'utilisateur", async () => {
    server.set("exercises", [
      { id: "e1", user_id: USER, workout_id: "w1", name: "A", reps: 1, weight: 1, sets: 1 },
      { id: "e2", user_id: "autre", workout_id: "w2", name: "A", reps: 1, weight: 1, sets: 1 },
    ]);
    const rows = await fetchUserExerciseInstances(USER);
    expect(rows.map((r) => r.id)).toEqual(["e1"]);
  });

  it("reconstruit TOUTES les séances malgré un plafond serveur bas", async () => {
    const SESSIONS = 400;
    const instances = Array.from({ length: SESSIONS }, (_, i) => ({
      id: `e-${pad(i)}`,
      workout_id: `w-${pad(i)}`,
      name: "Développé couché",
      reps: null,
      weight: null,
      sets: null,
      exercise_reference_id: "ref-1",
    }));
    server.set(
      "exercise_sets",
      instances.flatMap((instance, i) =>
        [1, 2, 3].map((setNumber) => ({
          id: `s-${pad(i)}-${setNumber}`,
          exercise_id: instance.id,
          set_number: setNumber,
          reps: 8,
          weight: 80 + i,
          completed: true,
        })),
      ),
    );
    server.set(
      "workouts",
      instances.map((instance, i) => ({
        id: instance.workout_id,
        date: `2026-01-${pad((i % 28) + 1, 2)}`,
      })),
    );
    // Plafond volontairement bas sur les DEUX tables enfants.
    maxRowsByTable = { exercise_sets: 90, workouts: 60 };

    const sessions = await fetchExerciseSessions(instances, "Développé couché");

    expect(sessions).toHaveLength(SESSIONS);
    expect(sessions.every((s) => s.sets.length === 3)).toBe(true);
    // Aucune série perdue ni dupliquée sur l'ensemble de l'historique.
    expect(sessions.reduce((total, s) => total + s.sets.length, 0)).toBe(SESSIONS * 3);
    // Ordre chronologique croissant, comme avant le chantier.
    const dates = sessions.map((s) => s.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("découpe le filtre in(...) en paquets bornés", async () => {
    const instances = Array.from({ length: 250 }, (_, i) => ({
      id: `e-${pad(i)}`,
      workout_id: `w-${pad(i)}`,
      name: "Squat",
      reps: 5,
      weight: 100,
      sets: 1,
      exercise_reference_id: "ref-2",
    }));
    server.set("exercise_sets", []);
    server.set(
      "workouts",
      instances.map((i) => ({ id: i.workout_id, date: "2026-02-01" })),
    );
    await fetchExerciseSessions(instances, "Squat");
    const withIn = requests.filter((r) => r.inCount != null);
    expect(withIn.length).toBeGreaterThan(0);
    expect(withIn.every((r) => (r.inCount ?? 0) <= 100)).toBe(true);
  });

  it("garde le repli sur le résumé agrégé quand aucune série détaillée n'existe", async () => {
    const instances = [
      {
        id: "e1",
        workout_id: "w1",
        name: "Squat",
        reps: 5,
        weight: 100,
        sets: 3,
        exercise_reference_id: "ref-2",
      },
    ];
    server.set("exercise_sets", []);
    server.set("workouts", [{ id: "w1", date: "2026-03-01" }]);
    const sessions = await fetchExerciseSessions(instances, "Squat");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets).toHaveLength(3);
    expect(sessions[0].sets[0]).toEqual({ set_number: 1, reps: 5, weight: 100 });
  });

  it("ignore les séries non validées (H3), comportement inchangé", async () => {
    const instances = [
      {
        id: "e1",
        workout_id: "w1",
        name: "Squat",
        reps: null,
        weight: null,
        sets: null,
        exercise_reference_id: "ref-2",
      },
    ];
    server.set("exercise_sets", [
      { id: "s1", exercise_id: "e1", set_number: 1, reps: 5, weight: 100, completed: true },
      { id: "s2", exercise_id: "e1", set_number: 2, reps: 5, weight: 100, completed: false },
    ]);
    server.set("workouts", [{ id: "w1", date: "2026-03-01" }]);
    const sessions = await fetchExerciseSessions(instances, "Squat");
    expect(sessions[0].sets).toHaveLength(1);
  });
});

describe("AUD-03 — historique profond (segments Course)", () => {
  it("rapatrie TOUS les segments au-delà du plafond, sur toutes les séances", async () => {
    const SESSIONS = 1_200;
    server.set(
      "workouts",
      Array.from({ length: SESSIONS }, (_, i) => ({
        id: `w-${pad(i)}`,
        date: `2026-01-${pad((i % 28) + 1, 2)}`,
        user_id: USER,
        discipline: "course",
        status: "completed",
      })),
    );
    server.set(
      "workout_segments",
      Array.from({ length: SESSIONS }, (_, i) => ({
        id: `sg-${pad(i)}`,
        workout_id: `w-${pad(i)}`,
        label: "400m allure 5 km",
        metrics: { distance: 400 },
        completed: true,
        exercise_id: "ex-1",
      })),
    );
    maxRowsByTable = { workouts: 250, workout_segments: 250 };

    const instances = await fetchCourseSegmentInstances(USER);

    expect(instances).toHaveLength(SESSIONS);
    expect(new Set(instances.map((i) => i.workoutId)).size).toBe(SESSIONS);
    // Chaque segment est bien rattaché à la date de SA séance.
    expect(instances.every((i) => i.date !== "")).toBe(true);
  });

  it("ne lit que les séances Course terminées de l'utilisateur", async () => {
    server.set("workouts", [
      { id: "w1", date: "2026-01-01", user_id: USER, discipline: "course", status: "completed" },
      { id: "w2", date: "2026-01-02", user_id: USER, discipline: "course", status: "active" },
      { id: "w3", date: "2026-01-03", user_id: USER, discipline: "muscu", status: "completed" },
      { id: "w4", date: "2026-01-04", user_id: "autre", discipline: "course", status: "completed" },
    ]);
    server.set("workout_segments", [
      { id: "s1", workout_id: "w1", label: "L", metrics: {}, completed: true, exercise_id: null },
      { id: "s2", workout_id: "w2", label: "L", metrics: {}, completed: true, exercise_id: null },
    ]);
    const instances = await fetchCourseSegmentInstances(USER);
    expect(instances.map((i) => i.workoutId)).toEqual(["w1"]);
  });

  it("ne fait aucune lecture de segments sans séance", async () => {
    server.set("workouts", []);
    server.set("workout_segments", []);
    expect(await fetchCourseSegmentInstances(USER)).toEqual([]);
    expect(requests.filter((r) => r.table === "workout_segments")).toHaveLength(0);
  });
});
