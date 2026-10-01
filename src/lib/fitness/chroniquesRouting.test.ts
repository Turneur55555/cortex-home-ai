import { describe, expect, it, vi } from "vitest";
import {
  chroniquesSearchSchema,
  createChroniquesRouting,
  type ChroniquesRoutingDeps,
} from "./chroniquesRouting";

function make(over: Partial<ChroniquesRoutingDeps> = {}) {
  const setSearch = vi.fn<ChroniquesRoutingDeps["setSearch"]>();
  const goBack = vi.fn();
  const canGoBack = vi.fn(() => false);
  const routing = createChroniquesRouting({
    search: {},
    setSearch,
    canGoBack,
    goBack,
    ...over,
  });
  return { routing, setSearch, goBack, canGoBack };
}

describe("chroniquesSearchSchema — une valeur invalide est ignorée, jamais fatale", () => {
  it("accepte les trois modules et un identifiant de séance", () => {
    expect(chroniquesSearchSchema.parse({ module: "forge", seance: "abc" })).toEqual({
      module: "forge",
      seance: "abc",
    });
    for (const module of ["legendes", "forge", "progression"]) {
      expect(chroniquesSearchSchema.parse({ module }).module).toBe(module);
    }
  });

  it("module inconnu → ignoré ; identifiant vide ou non textuel → ignoré", () => {
    expect(chroniquesSearchSchema.parse({ module: "n-importe-quoi" }).module).toBeUndefined();
    expect(chroniquesSearchSchema.parse({ seance: "" }).seance).toBeUndefined();
    expect(chroniquesSearchSchema.parse({ seance: 42 }).seance).toBeUndefined();
  });

  it("aucun paramètre : tout est facultatif", () => {
    expect(chroniquesSearchSchema.parse({})).toEqual({});
  });
});

describe("createChroniquesRouting — l'état lu depuis l'URL", () => {
  it("sans module : Les Légendes ; avec : celui de l'URL", () => {
    expect(make().routing.module).toBe("legendes");
    expect(make({ search: { module: "progression" } }).routing.module).toBe("progression");
  });

  it("l'identifiant de Chronique est celui de l'URL", () => {
    expect(make().routing.chronicleId).toBeUndefined();
    expect(make({ search: { seance: "w-1" } }).routing.chronicleId).toBe("w-1");
  });
});

describe("createChroniquesRouting — changer de module", () => {
  it("REMPLACE l'entrée d'historique (les modules sont des pairs) et ferme la Chronique ouverte", () => {
    const { routing, setSearch, goBack } = make({ search: { module: "legendes", seance: "w-1" } });
    routing.onModuleChange("forge");
    expect(setSearch).toHaveBeenCalledTimes(1);
    const [patch, options] = setSearch.mock.calls[0];
    // Égalité STRICTE : la route fusionne `{ ...previous, ...patch }` — sans la clé `seance` dans le
    // correctif, la Chronique ouverte survivrait au changement de module (`toHaveBeenCalledWith`
    // ignore les propriétés `undefined` et ne le verrait pas).
    expect(patch).toStrictEqual({ module: "forge", seance: undefined });
    expect(options).toEqual({ replace: true });
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe("createChroniquesRouting — ouvrir une Chronique", () => {
  it("push : une entrée d'historique de plus (le retour arrière la referme)", () => {
    const { routing, setSearch } = make();
    routing.onChronicleOpen("w-1", "push");
    expect(setSearch).toHaveBeenCalledWith({ seance: "w-1" }, { replace: false });
  });

  it("replace : précédent / suivant ne s'empilent pas", () => {
    const { routing, setSearch } = make({ search: { seance: "w-1" } });
    routing.onChronicleOpen("w-2", "replace");
    expect(setSearch).toHaveBeenCalledWith({ seance: "w-2" }, { replace: true });
  });
});

describe("createChroniquesRouting — refermer une Chronique", () => {
  it("atteinte depuis les Chroniques : le retour arrière la referme (rien n'est écrit dans l'URL)", () => {
    const { routing, setSearch, goBack } = make({
      search: { seance: "w-1" },
      canGoBack: () => true,
    });
    routing.onChronicleClose();
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(setSearch).not.toHaveBeenCalled();
  });

  it("atteinte directement (lien, rechargement) : on REMPLACE l'URL — jamais de sortie de l'application", () => {
    const { routing, setSearch, goBack } = make({
      search: { seance: "w-1" },
      canGoBack: () => false,
    });
    routing.onChronicleClose();
    expect(goBack).not.toHaveBeenCalled();
    expect(setSearch.mock.calls[0][0]).toStrictEqual({ seance: undefined });
    expect(setSearch.mock.calls[0][1]).toEqual({ replace: true });
  });

  it("identifiant devenu introuvable : toujours le remplacement, même s'il y a un historique", () => {
    const { routing, setSearch, goBack } = make({
      search: { seance: "inconnu" },
      canGoBack: () => true,
    });
    routing.onChronicleClose({ replace: true });
    expect(goBack).not.toHaveBeenCalled();
    expect(setSearch).toHaveBeenCalledWith({ seance: undefined }, { replace: true });
  });

  it("`replace: false` explicite se comporte comme l'absence d'option", () => {
    const { routing, goBack } = make({ search: { seance: "w-1" }, canGoBack: () => true });
    routing.onChronicleClose({ replace: false });
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
