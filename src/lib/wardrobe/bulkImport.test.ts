import { describe, expect, it, vi } from "vitest";
import {
  BulkWardrobeImportController,
  findDuplicateMatches,
  isLikelyDuplicate,
  runWithConcurrency,
  type BulkImportDeps,
} from "./bulkImport";
import type { WardrobeAnalysisResult } from "@/hooks/useWardrobe";

function makeFile(name: string, type = "image/jpeg", sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function makeAnalysis(overrides: Partial<WardrobeAnalysisResult> = {}): WardrobeAnalysisResult {
  return {
    category: "top",
    category_confidence: 0.9,
    subcategory: "tshirt",
    subcategory_confidence: 0.9,
    primary_color: "noir",
    primary_color_confidence: 0.9,
    secondary_colors: [],
    pattern: "uni",
    pattern_confidence: 0.8,
    material: "coton",
    material_confidence: 0.6,
    fit: "regular",
    fit_confidence: 0.6,
    formality: "casual",
    formality_confidence: 0.8,
    seasons: ["ete"],
    sleeve_length: "courtes",
    sleeve_length_confidence: 0.8,
    usage: ["quotidien"],
    usage_confidence: 0.8,
    description: "T-shirt noir uni.",
    ...overrides,
  };
}

// ─── runWithConcurrency ──────────────────────────────────────────────────

describe("runWithConcurrency", () => {
  it("traite 1 élément sans dépasser la limite", async () => {
    let active = 0;
    let maxActive = 0;
    await runWithConcurrency([1], 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
    });
    expect(maxActive).toBe(1);
  });

  it("traite 10 éléments avec une concurrence bornée à 3", async () => {
    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runWithConcurrency(items, 3, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      processed.push(item);
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
    expect(processed.sort((a, b) => a - b)).toEqual(items);
  });

  it("traite 50 éléments sans jamais dépasser la concurrence configurée", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);
    await runWithConcurrency(items, 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 0));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("ne plante pas sur une liste vide", async () => {
    const worker = vi.fn();
    await runWithConcurrency([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});

// ─── Détection de doublons ───────────────────────────────────────────────

describe("isLikelyDuplicate", () => {
  it("détecte un doublon : même type précis + même couleur", () => {
    expect(
      isLikelyDuplicate(
        { subcategory: "tshirt", primaryColor: "Noir", brand: null },
        { subcategory: "tshirt", primaryColor: "noir", brand: "Nike" },
      ),
    ).toBe(true);
  });

  it("détecte un doublon : même type précis + même marque", () => {
    expect(
      isLikelyDuplicate(
        { subcategory: "jean", primaryColor: null, brand: "Levi's" },
        { subcategory: "jean", primaryColor: "bleu", brand: "levi's" },
      ),
    ).toBe(true);
  });

  it("ne signale rien si le type précis diffère", () => {
    expect(
      isLikelyDuplicate(
        { subcategory: "tshirt", primaryColor: "noir", brand: "Nike" },
        { subcategory: "pull", primaryColor: "noir", brand: "Nike" },
      ),
    ).toBe(false);
  });

  it("ne signale rien si ni la couleur ni la marque ne correspondent", () => {
    expect(
      isLikelyDuplicate(
        { subcategory: "tshirt", primaryColor: "noir", brand: "Nike" },
        { subcategory: "tshirt", primaryColor: "blanc", brand: "Adidas" },
      ),
    ).toBe(false);
  });

  it("jamais de faux positif sur deux valeurs manquantes", () => {
    expect(
      isLikelyDuplicate(
        { subcategory: "tshirt", primaryColor: null, brand: null },
        { subcategory: "tshirt", primaryColor: null, brand: null },
      ),
    ).toBe(false);
  });
});

describe("findDuplicateMatches", () => {
  it("retourne les ids des pièces potentiellement dupliquées", () => {
    const pool = [
      { id: "a", subcategory: "tshirt", primaryColor: "noir", brand: null },
      { id: "b", subcategory: "jean", primaryColor: "noir", brand: null },
    ];
    const ids = findDuplicateMatches(
      { subcategory: "tshirt", primaryColor: "noir", brand: null },
      pool,
    );
    expect(ids).toEqual(["a"]);
  });
});

// ─── Contrôleur d'import massif ──────────────────────────────────────────

function makeDeps(overrides: Partial<BulkImportDeps> = {}): BulkImportDeps {
  return {
    concurrency: 3,
    analyzePhoto: vi.fn(async () => makeAnalysis()),
    cutoutPhoto: vi.fn(async () => new Blob(["cutout"], { type: "image/webp" })),
    createItem: vi.fn(async () => crypto.randomUUID()),
    ...overrides,
  };
}

async function flush() {
  // Laisse les microtasks/chaînes de promesses de la file se dérouler,
  // avec un détour par une macrotask pour couvrir les chaînes d'awaits
  // profondes (analyse → détourage) sur un nombre variable de jobs.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("BulkWardrobeImportController — 1 photo", () => {
  it("traite une seule photo jusqu'à l'état 'prete'", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    const proposal = controller.getProposal(jobId);
    expect(proposal?.status).toBe("prete");
    expect(proposal?.category).toBe("tops");
    expect(proposal?.subcategory).toBe("tshirt");
  });

  it("ne préremplit jamais la taille depuis l'analyse IA", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    expect(controller.getProposal(jobId)?.size).toBe("");
  });
});

describe("BulkWardrobeImportController — 10 photos", () => {
  it("traite 10 photos et rapporte une progression réelle (jamais un pourcentage inventé)", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`p${i}.jpg`));
    controller.addFiles(files);
    await flush();
    const progress = controller.getProgress();
    expect(progress.total).toBe(10);
    expect(progress.processed).toBe(10);
    expect(progress.ready).toBe(10);
  });
});

describe("BulkWardrobeImportController — 50 photos", () => {
  it("traite 50 photos sans dépasser la concurrence configurée pour l'analyse", async () => {
    let active = 0;
    let maxActive = 0;
    const deps = makeDeps({
      concurrency: 3,
      analyzePhoto: vi.fn(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
        return makeAnalysis();
      }),
    });
    const controller = new BulkWardrobeImportController(deps);
    const files = Array.from({ length: 50 }, (_, i) => makeFile(`p${i}.jpg`));
    controller.addFiles(files);
    // Attend que tout le pipeline se termine (macrotasks liés aux setTimeout).
    await new Promise((r) => setTimeout(r, 50));
    await flush();

    expect(maxActive).toBeLessThanOrEqual(3);
    const progress = controller.getProgress();
    expect(progress.total).toBe(50);
    expect(progress.processed).toBe(50);
  });
});

describe("BulkWardrobeImportController — succès partiel / isolation des erreurs", () => {
  it("une photo en échec n'empêche jamais les autres d'aboutir", async () => {
    let call = 0;
    const deps = makeDeps({
      analyzePhoto: vi.fn(async (file: File) => {
        call++;
        if (file.name === "bad.jpg") throw new Error("Analyse impossible.");
        return makeAnalysis();
      }),
    });
    const controller = new BulkWardrobeImportController(deps);
    const [okId1, badId, okId2] = controller.addFiles([
      makeFile("ok1.jpg"),
      makeFile("bad.jpg"),
      makeFile("ok2.jpg"),
    ]);
    await flush();

    expect(controller.getProposal(okId1)?.status).toBe("prete");
    expect(controller.getProposal(okId2)?.status).toBe("prete");
    expect(controller.getProposal(badId)?.status).toBe("erreur");
    expect(controller.getProposal(badId)?.errorStage).toBe("analyse");
    expect(call).toBe(3);

    const progress = controller.getProgress();
    expect(progress.errors).toBe(1);
    expect(progress.ready).toBe(2);
  });

  it("le détourage en échec ne bloque jamais l'import : l'original reste utilisable", async () => {
    const deps = makeDeps({
      cutoutPhoto: vi.fn(async () => {
        throw new Error("Détourage impossible.");
      }),
    });
    const controller = new BulkWardrobeImportController(deps);
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    const proposal = controller.getProposal(jobId);
    expect(proposal?.status).toBe("prete");
    expect(proposal?.hasCutout).toBe(false);
    expect(proposal?.useProcessedPhoto).toBe(false);
  });
});

describe("BulkWardrobeImportController — retry", () => {
  it("réessaie une pièce en erreur de façon isolée", async () => {
    let attempt = 0;
    const deps = makeDeps({
      analyzePhoto: vi.fn(async () => {
        attempt++;
        if (attempt === 1) throw new Error("Réseau indisponible.");
        return makeAnalysis();
      }),
    });
    const controller = new BulkWardrobeImportController(deps);
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    expect(controller.getProposal(jobId)?.status).toBe("erreur");

    controller.retry(jobId);
    await flush();
    expect(controller.getProposal(jobId)?.status).toBe("prete");
    expect(attempt).toBe(2);
  });

  it("ne relance pas une pièce qui n'est pas en erreur", async () => {
    const deps = makeDeps();
    const controller = new BulkWardrobeImportController(deps);
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    const callsBefore = (deps.analyzePhoto as ReturnType<typeof vi.fn>).mock.calls.length;
    controller.retry(jobId);
    await flush();
    expect((deps.analyzePhoto as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });
});

describe("BulkWardrobeImportController — édition avant validation", () => {
  it("permet de corriger une fiche proposée avant validation", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    controller.updateProposal(jobId, { name: "Mon t-shirt", primaryColor: "gris", size: "M" });
    const proposal = controller.getProposal(jobId);
    expect(proposal?.name).toBe("Mon t-shirt");
    expect(proposal?.primaryColor).toBe("gris");
    expect(proposal?.size).toBe("M");
  });

  it("ignore toute tentative d'écraser un champ protégé (status, validated…)", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    controller.updateProposal(jobId, { status: "validee", validated: true });
    expect(controller.getProposal(jobId)?.status).toBe("prete");
    expect(controller.getProposal(jobId)?.validated).toBe(false);
  });
});

describe("BulkWardrobeImportController — validation individuelle", () => {
  it("valide une pièce prête : upload/insert appelés, jamais avant", async () => {
    const createItem = vi.fn(async () => "item-123");
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    expect(createItem).not.toHaveBeenCalled();
    const result = await controller.validate(jobId);
    expect(result).toEqual({ ok: true, itemId: "item-123" });
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(controller.getProposal(jobId)?.status).toBe("validee");
    expect(controller.getProposal(jobId)?.createdItemId).toBe("item-123");
  });

  it("refuse de valider une pièce pas encore prête", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    // Pas de flush : encore en cours de traitement.
    const result = await controller.validate(jobId);
    expect(result.ok).toBe(false);
  });

  it("isole l'échec de validation d'une pièce : la fiche reste modifiable, pas de crash", async () => {
    const createItem = vi.fn(async () => {
      throw new Error("Upload impossible.");
    });
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    const result = await controller.validate(jobId);
    expect(result).toEqual({ ok: false, error: "Upload impossible." });
    expect(controller.getProposal(jobId)?.status).toBe("prete");
    expect(controller.getProposal(jobId)?.errorStage).toBe("validation");
  });
});

describe("BulkWardrobeImportController — validation en série", () => {
  it("valide toutes les pièces prêtes, compte les succès et les échecs séparément", async () => {
    let call = 0;
    const createItem = vi.fn(async () => {
      call++;
      if (call === 2) throw new Error("Échec pièce 2.");
      return `item-${call}`;
    });
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    controller.addFiles([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);
    await flush();

    const result = await controller.validateAll();
    expect(result.succeeded.length).toBe(2);
    expect(result.failed.length).toBe(1);

    const progress = controller.getProgress();
    expect(progress.validated).toBe(2);
  });

  it("valide 50 pièces en série sans dépasser la concurrence pour la création", async () => {
    let active = 0;
    let maxActive = 0;
    const createItem = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return crypto.randomUUID();
    });
    const controller = new BulkWardrobeImportController(makeDeps({ createItem, concurrency: 3 }));
    controller.addFiles(Array.from({ length: 50 }, (_, i) => makeFile(`p${i}.jpg`)));
    await new Promise((r) => setTimeout(r, 50));
    await flush();

    const result = await controller.validateAll();
    expect(result.succeeded.length).toBe(50);
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

describe("BulkWardrobeImportController — doublons (avertissement uniquement, jamais bloquant)", () => {
  it("signale un doublon potentiel contre le dressing existant sans jamais bloquer la validation", async () => {
    const createItem = vi.fn(async () => "item-1");
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();

    controller.computeDuplicates([
      { id: "existing-1", subcategory: "tshirt", primaryColor: "noir", brand: null },
    ]);
    expect(controller.getProposal(jobId)?.duplicateOfIds).toContain("existing-1");

    // "Ajouter quand même" : la validation reste possible malgré le doublon.
    const result = await controller.validate(jobId);
    expect(result.ok).toBe(true);
    expect(createItem).toHaveBeenCalledTimes(1);
  });

  it("détecte un doublon entre deux propositions de la même revue", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [id1, id2] = controller.addFiles([makeFile("a.jpg"), makeFile("b.jpg")]);
    await flush();

    controller.computeDuplicates([]);
    expect(controller.getProposal(id1)?.duplicateOfIds).toContain(id2);
    expect(controller.getProposal(id2)?.duplicateOfIds).toContain(id1);
  });

  it("permet d'ignorer explicitement un signal de doublon", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    controller.setDuplicateIgnored(jobId, true);
    expect(controller.getProposal(jobId)?.duplicateIgnored).toBe(true);
  });
});

describe("BulkWardrobeImportController — skip / abandon", () => {
  it("skip retire une pièce de la revue sans jamais avoir appelé createItem", async () => {
    const createItem = vi.fn(async () => "should-not-be-called");
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    controller.skip(jobId);
    expect(controller.getProposal(jobId)).toBeNull();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("abandon vide tout l'état sans nécessiter de nettoyage Storage (rien n'a été uploadé)", async () => {
    const createItem = vi.fn(async () => "should-not-be-called");
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    controller.addFiles(Array.from({ length: 5 }, (_, i) => makeFile(`p${i}.jpg`)));
    await flush();
    controller.abandon();
    expect(controller.getProposals()).toEqual([]);
    // Aucun objet Storage n'a jamais été créé pour ces pièces non validées.
    expect(createItem).not.toHaveBeenCalled();
  });

  it("les pièces déjà validées avant abandon restent en base (createItem a bien été appelé pour elles)", async () => {
    const createItem = vi.fn(async () => "item-validated");
    const controller = new BulkWardrobeImportController(makeDeps({ createItem }));
    const [jobId] = controller.addFiles([makeFile("a.jpg")]);
    await flush();
    await controller.validate(jobId);
    expect(createItem).toHaveBeenCalledTimes(1);
    controller.abandon();
    // abandon() ne "dévalide" pas une pièce déjà créée en base — il vide
    // simplement l'état local de la revue en cours.
    expect(controller.getProposals()).toEqual([]);
  });
});

describe("BulkWardrobeImportController — notifications", () => {
  it("notifie les abonnés à chaque changement d'état", async () => {
    const controller = new BulkWardrobeImportController(makeDeps());
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.addFiles([makeFile("a.jpg")]);
    await flush();
    expect(listener.mock.calls.length).toBeGreaterThan(0);
    unsubscribe();
    const callsAfterUnsub = listener.mock.calls.length;
    controller.addFiles([makeFile("b.jpg")]);
    await flush();
    expect(listener.mock.calls.length).toBe(callsAfterUnsub);
  });
});
