import { describe, expect, it } from "vitest";
import {
  chunkIds,
  fetchAllRows,
  fetchAllRowsForIds,
  IN_CHUNK_SIZE,
  PAGE_SIZE,
  type RangeableQuery,
} from "./pagedRead";

/**
 * CHANTIER A — tests du motif de lecture bornée.
 *
 * Le point CENTRAL de ces tests : le serveur simulé applique un plafond
 * `max-rows` **silencieux**, exactement comme PostgREST — une page demandée
 * plus large que le plafond revient rabotée, sans erreur. Un test qui
 * passerait avec les volumes actuels de la base ne prouverait rien ; ici
 * chaque fixture DÉPASSE délibérément le plafond.
 */

interface ServerRow {
  id: string;
  parent_id: string;
}

interface ServerOptions {
  /** Plafond `max-rows` appliqué en silence. */
  maxRows?: number;
  /** Le serveur annonce-t-il le total exact (`count: "exact"`) ? */
  withCount?: boolean;
  /** Erreur renvoyée à la n-ième requête (1-indexé). */
  failOnRequest?: number;
}

interface FakeServer {
  query(filterIds?: string[]): RangeableQuery;
  /** Journal des plages demandées — c'est lui qui PROUVE la pagination. */
  ranges: Array<{ from: number; to: number; inCount?: number }>;
}

function makeServer(rows: ServerRow[], options: ServerOptions = {}): FakeServer {
  const maxRows = options.maxRows ?? 1_000;
  const withCount = options.withCount !== false;
  const ranges: FakeServer["ranges"] = [];
  let requestNumber = 0;

  return {
    ranges,
    query(filterIds?: string[]) {
      return {
        range(from: number, to: number) {
          requestNumber += 1;
          ranges.push({ from, to, inCount: filterIds?.length });
          if (options.failOnRequest === requestNumber) {
            return Promise.resolve({ data: null, error: new Error("réseau coupé"), count: null });
          }
          const matching = filterIds
            ? rows.filter((r) => filterIds.includes(r.parent_id))
            : [...rows];
          // `count: "exact"` porte sur le jeu FILTRÉ, avant pagination.
          const count = withCount ? matching.length : null;
          const page = matching.slice(from, to + 1);
          // Le plafond serveur s'applique EN DERNIER et SANS erreur.
          return Promise.resolve({ data: page.slice(0, maxRows), error: null, count });
        },
      };
    },
  };
}

function seed(count: number, parentCount = 1): ServerRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r-${String(i).padStart(5, "0")}`,
    parent_id: `p-${i % parentCount}`,
  }));
}

describe("chunkIds", () => {
  it("découpe en paquets de la taille demandée", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("renvoie un tableau vide pour une liste vide", () => {
    expect(chunkIds([], 10)).toEqual([]);
  });

  it("borne la longueur d'URL par défaut", () => {
    expect(chunkIds(seed(250).map((r) => r.id))).toHaveLength(Math.ceil(250 / IN_CHUNK_SIZE));
  });

  it("refuse une taille de paquet absurde", () => {
    expect(() => chunkIds([1], 0)).toThrow();
  });
});

describe("fetchAllRows — au-delà du plafond max-rows", () => {
  it("rapatrie l'INTÉGRALITÉ d'un jeu qui dépasse le plafond", async () => {
    // 2 566 lignes = la taille réelle de `exercise_media`. Sans pagination,
    // 1 000 lignes seulement arrivaient, en silence.
    const server = makeServer(seed(2_566));
    const rows = await fetchAllRows<ServerRow>(() => server.query());
    expect(rows).toHaveLength(2_566);
  });

  it("ne perd ni ne duplique aucune ligne", async () => {
    const server = makeServer(seed(2_566));
    const rows = await fetchAllRows<ServerRow>(() => server.query());
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(2_566);
    expect(ids).toEqual(seed(2_566).map((r) => r.id));
  });

  it("préserve l'ordre du serveur", async () => {
    const server = makeServer(seed(1_477));
    const rows = await fetchAllRows<ServerRow>(() => server.query());
    expect(rows.map((r) => r.id)).toEqual(
      [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => r.id),
    );
  });

  it("pagine réellement — plages contiguës et sans trou", async () => {
    const server = makeServer(seed(1_477));
    await fetchAllRows<ServerRow>(() => server.query());
    expect(server.ranges.length).toBeGreaterThan(1);
    let expected = 0;
    for (const range of server.ranges) {
      expect(range.from).toBe(expected);
      expect(range.to).toBe(expected + PAGE_SIZE - 1);
      expected += PAGE_SIZE;
    }
  });

  it("ABSORBE un plafond serveur abaissé SOUS la taille de page", async () => {
    // `max-rows` est une configuration SERVEUR : le résultat ne doit dépendre
    // d'aucune valeur supposée. Ici chaque page revient rabotée à 40 lignes
    // alors qu'on en demande 500 — la boucle doit continuer jusqu'au total.
    const server = makeServer(seed(1_477), { maxRows: 40 });
    const rows = await fetchAllRows<ServerRow>(() => server.query());
    expect(rows).toHaveLength(1_477);
    expect(server.ranges.length).toBe(Math.ceil(1_477 / 40));
  });

  it("gère un jeu vide sans boucler", async () => {
    const server = makeServer([]);
    expect(await fetchAllRows<ServerRow>(() => server.query())).toEqual([]);
    expect(server.ranges).toHaveLength(1);
  });

  it("gère un jeu exactement égal à une page", async () => {
    const server = makeServer(seed(PAGE_SIZE));
    const rows = await fetchAllRows<ServerRow>(() => server.query());
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(server.ranges).toHaveLength(1);
  });
});

describe("fetchAllRows — refus de conclure sans preuve", () => {
  it("LÈVE si le serveur n'annonce pas le total exact", async () => {
    // Sans total, « j'ai tout lu » n'est pas démontrable. Renvoyer les
    // lignes lues ferait exactement ce que ce chantier corrige : une
    // troncature silencieuse.
    const server = makeServer(seed(2_000), { withCount: false });
    await expect(fetchAllRows(() => server.query())).rejects.toThrow(/total exact/i);
  });

  it("propage l'erreur réseau au lieu de renvoyer un jeu partiel", async () => {
    const server = makeServer(seed(2_000), { failOnRequest: 2 });
    await expect(fetchAllRows(() => server.query())).rejects.toThrow(/réseau coupé/);
  });

  it("LÈVE si la pagination n'avance plus", async () => {
    // Plafond serveur à 0 : le total annonce des lignes, aucune n'arrive.
    const server = makeServer(seed(2_000), { maxRows: 0 });
    await expect(fetchAllRows(() => server.query())).rejects.toThrow(/bloquée/i);
  });

  it("nomme la table en cause dans l'erreur", async () => {
    const server = makeServer(seed(10), { withCount: false });
    await expect(fetchAllRows(() => server.query(), { label: "exercise_media" })).rejects.toThrow(
      /exercise_media/,
    );
  });
});

describe("fetchAllRowsForIds — chunking du filtre in(...)", () => {
  it("ne fait AUCUN aller-retour pour une liste d'ids vide", async () => {
    const server = makeServer(seed(100, 10));
    expect(await fetchAllRowsForIds([], () => server.query())).toEqual([]);
    expect(server.ranges).toHaveLength(0);
  });

  it("découpe les ids en paquets bornés", async () => {
    const parentIds = Array.from({ length: 250 }, (_, i) => `p-${i}`);
    const server = makeServer(seed(250, 250));
    await fetchAllRowsForIds<ServerRow>(parentIds, (ids) => server.query(ids));
    expect(server.ranges.every((r) => (r.inCount ?? 0) <= IN_CHUNK_SIZE)).toBe(true);
    expect(server.ranges).toHaveLength(3);
  });

  it("rapatrie tout, sans doublon, quand un paquet dépasse le plafond", async () => {
    // 3 parents seulement, mais 2 400 lignes réparties entre eux : c'est la
    // PAGINATION à l'intérieur d'un paquet qui est éprouvée ici.
    const server = makeServer(seed(2_400, 3), { maxRows: 1_000 });
    const rows = await fetchAllRowsForIds<ServerRow>(["p-0", "p-1", "p-2"], (ids) =>
      server.query(ids),
    );
    expect(rows).toHaveLength(2_400);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_400);
  });

  it("déduplique les ids — les paquets restent disjoints", async () => {
    const server = makeServer(seed(30, 3));
    const rows = await fetchAllRowsForIds<ServerRow>(
      ["p-0", "p-0", "p-1", "p-1", "p-0"],
      (ids) => server.query(ids),
      { chunkSize: 10 },
    );
    // Chaque ligne n'a qu'un parent : aucun doublon possible.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows).toHaveLength(20);
    expect(server.ranges[0].inCount).toBe(2);
  });

  it("propage l'échec d'un paquet au lieu de renvoyer les autres", async () => {
    const server = makeServer(seed(300, 300), { failOnRequest: 2 });
    const parentIds = Array.from({ length: 300 }, (_, i) => `p-${i}`);
    await expect(fetchAllRowsForIds(parentIds, (ids) => server.query(ids))).rejects.toThrow(
      /réseau coupé/,
    );
  });
});
