/**
 * Import massif intelligent (Phase 5.1) — logique pure, zéro import React,
 * zéro import DOM. Orchestration de la file (concurrence bornée), du
 * modèle de "proposition" client-side (jamais persistée avant validation),
 * de la détection de doublons (avertissement uniquement, jamais bloquant)
 * et de la validation individuelle/en série.
 *
 * Le pipeline par pièce (Vision → détourage → upload → insert) est
 * entièrement injecté (`BulkImportDeps`) pour rester testable sans réseau
 * ni navigateur, et pour réutiliser EXACTEMENT le pipeline du flux d'ajout
 * individuel (cf. src/hooks/useWardrobeBulkImport.ts qui fournit ces deps
 * à partir de `createWardrobeItemRecord`, `processWardrobePhoto`,
 * `fileToBase64Compressed`, l'edge function `analyze-wardrobe-item`).
 *
 * Règle clé (§10 de la mission) : rien n'est uploadé en Storage tant qu'une
 * pièce n'est pas validée par l'utilisateur — abandonner l'import ne
 * nécessite donc aucun nettoyage Storage, puisqu'aucun objet n'a encore été
 * créé pour les pièces non validées.
 */
import type {
  WardrobeAddCategoryKey,
  WardrobeAnalysisResult,
  CreateWardrobeItemInput,
} from "@/hooks/useWardrobe";
import { buildWardrobePrefill } from "@/hooks/useWardrobe";
import type { WardrobeFit, WardrobePattern, WardrobeSleeveLength, WardrobeUsage } from "./taxonomy";

// ─── File à concurrence bornée ──────────────────────────────────────────────

/**
 * Exécute `worker` sur chaque élément de `items`, avec au plus `limit`
 * exécutions simultanées. Ne lance jamais plus de `limit` promesses en vol
 * en même temps, quel que soit le nombre d'éléments (1, 10, 50…).
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let cursor = 0;

  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: boundedLimit }, () => runner()));
}

// ─── Détection de doublons (avertissement uniquement) ───────────────────────

export interface WardrobeDuplicateKey {
  subcategory: string | null;
  primaryColor: string | null;
  brand: string | null;
}

function normalizeKeyPart(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized.length > 0 ? normalized : null;
}

/**
 * Heuristique légère : même type précis (subcategory) ET (même couleur
 * principale OU même marque) — jamais un blocage, seulement un signal pour
 * proposer "Pièce potentiellement déjà présente" à l'utilisateur, qui reste
 * seul décisionnaire ("Ajouter quand même" / "Ignorer").
 */
export function isLikelyDuplicate(
  candidate: WardrobeDuplicateKey,
  other: WardrobeDuplicateKey,
): boolean {
  const subA = normalizeKeyPart(candidate.subcategory);
  const subB = normalizeKeyPart(other.subcategory);
  if (!subA || !subB || subA !== subB) return false;

  const colorA = normalizeKeyPart(candidate.primaryColor);
  const colorB = normalizeKeyPart(other.primaryColor);
  const colorMatches = !!colorA && !!colorB && colorA === colorB;

  const brandA = normalizeKeyPart(candidate.brand);
  const brandB = normalizeKeyPart(other.brand);
  const brandMatches = !!brandA && !!brandB && brandA === brandB;

  return colorMatches || brandMatches;
}

export function findDuplicateMatches<T extends WardrobeDuplicateKey & { id: string }>(
  candidate: WardrobeDuplicateKey,
  pool: readonly T[],
): string[] {
  return pool.filter((item) => isLikelyDuplicate(candidate, item)).map((item) => item.id);
}

// ─── Modèle de proposition (jamais persisté avant validation) ──────────────

export type BulkJobStatus = "en_attente" | "analyse" | "detourage" | "prete" | "erreur" | "validee";

export type BulkJobErrorStage = "analyse" | "detourage" | "validation" | null;

export interface BulkWardrobeProposal {
  jobId: string;
  fileName: string;
  status: BulkJobStatus;
  errorMessage: string | null;
  errorStage: BulkJobErrorStage;

  category: WardrobeAddCategoryKey | null;
  subcategory: string | null;
  name: string;
  brand: string;
  primaryColor: string;
  /** Jamais préremplie par Cortex Vision — toujours saisie par l'utilisateur (§4/§6). */
  size: string;
  secondaryColors: string[];
  sleeveLength: WardrobeSleeveLength | null;
  fit: WardrobeFit | null;
  material: string;
  pattern: WardrobePattern | null;
  usage: WardrobeUsage[];
  formality: string | null;
  seasons: string[];
  aiDescription: string | null;
  analysisResult: WardrobeAnalysisResult | null;

  hasCutout: boolean;
  useProcessedPhoto: boolean;

  /** ids (pièces existantes en base ou autres propositions) potentiellement en double. */
  duplicateOfIds: string[];
  duplicateIgnored: boolean;

  validated: boolean;
  createdItemId: string | null;
}

function createEmptyProposal(jobId: string, fileName: string): BulkWardrobeProposal {
  return {
    jobId,
    fileName,
    status: "en_attente",
    errorMessage: null,
    errorStage: null,
    category: null,
    subcategory: null,
    name: "",
    brand: "",
    primaryColor: "",
    size: "",
    secondaryColors: [],
    sleeveLength: null,
    fit: null,
    material: "",
    pattern: null,
    usage: [],
    formality: null,
    seasons: [],
    aiDescription: null,
    analysisResult: null,
    hasCutout: false,
    useProcessedPhoto: true,
    duplicateOfIds: [],
    duplicateIgnored: false,
    validated: false,
    createdItemId: null,
  };
}

/** Champs qu'une édition manuelle de la fiche ne doit jamais pouvoir modifier directement. */
const PROTECTED_PROPOSAL_KEYS = new Set<keyof BulkWardrobeProposal>([
  "jobId",
  "fileName",
  "status",
  "validated",
  "createdItemId",
  "analysisResult",
]);

export interface BulkImportDeps {
  analyzePhoto: (file: File) => Promise<WardrobeAnalysisResult>;
  cutoutPhoto: (file: File) => Promise<Blob>;
  createItem: (args: {
    file: File;
    processedFile: Blob | null;
    proposal: BulkWardrobeProposal;
  }) => Promise<string>;
  /** Nombre max de pièces traitées (analyse + détourage) en parallèle. Défaut 3. */
  concurrency?: number;
}

export interface BulkImportProgress {
  total: number;
  /** Analysées avec succès ou en erreur (i.e. traitement terminé, prêtes à revue). */
  processed: number;
  ready: number;
  errors: number;
  validated: number;
}

/**
 * Contrôleur du pipeline d'import massif — état + orchestration, sans aucun
 * lien avec React (testable directement en environnement Node). Le hook
 * `useWardrobeBulkImport` se contente de s'abonner et de refléter l'état
 * dans un `useState`.
 */
export class BulkWardrobeImportController {
  private readonly deps: BulkImportDeps;
  private readonly concurrency: number;
  private proposals = new Map<string, BulkWardrobeProposal>();
  private files = new Map<string, { file: File; cutoutBlob: Blob | null }>();
  private order: string[] = [];
  private listeners = new Set<() => void>();

  constructor(deps: BulkImportDeps) {
    this.deps = deps;
    this.concurrency = Math.max(1, deps.concurrency ?? 3);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  getProposals(): BulkWardrobeProposal[] {
    return this.order
      .map((id) => this.proposals.get(id))
      .filter((p): p is BulkWardrobeProposal => !!p);
  }

  getProposal(jobId: string): BulkWardrobeProposal | null {
    return this.proposals.get(jobId) ?? null;
  }

  getProgress(): BulkImportProgress {
    const all = this.getProposals();
    const errors = all.filter((p) => p.status === "erreur").length;
    const ready = all.filter((p) => p.status === "prete").length;
    const validated = all.filter((p) => p.status === "validee").length;
    return {
      total: all.length,
      processed: errors + ready + validated,
      ready,
      errors,
      validated,
    };
  }

  private patch(jobId: string, patch: Partial<BulkWardrobeProposal>): void {
    const current = this.proposals.get(jobId);
    if (!current) return;
    this.proposals.set(jobId, { ...current, ...patch });
    this.emit();
  }

  /** Ajoute des fichiers à la file et lance leur traitement (analyse + détourage), sans bloquer. */
  addFiles(files: readonly File[]): string[] {
    const ids: string[] = [];
    for (const file of files) {
      const jobId = crypto.randomUUID();
      ids.push(jobId);
      this.order.push(jobId);
      this.files.set(jobId, { file, cutoutBlob: null });
      this.proposals.set(jobId, createEmptyProposal(jobId, file.name));
    }
    this.emit();
    void this.processQueue(ids);
    return ids;
  }

  private async processQueue(jobIds: readonly string[]): Promise<void> {
    await runWithConcurrency(jobIds, this.concurrency, (jobId) => this.processOne(jobId));
  }

  private async processOne(jobId: string): Promise<void> {
    const jobFiles = this.files.get(jobId);
    if (!jobFiles) return;

    this.patch(jobId, { status: "analyse", errorMessage: null, errorStage: null });

    let analysis: WardrobeAnalysisResult;
    try {
      analysis = await this.deps.analyzePhoto(jobFiles.file);
    } catch (err) {
      this.patch(jobId, {
        status: "erreur",
        errorStage: "analyse",
        errorMessage: err instanceof Error ? err.message : "Analyse impossible.",
      });
      return;
    }

    const prefill = buildWardrobePrefill(analysis);
    this.patch(jobId, {
      analysisResult: analysis,
      category: prefill.category.value,
      subcategory: prefill.subcategory.value,
      name: prefill.name.value ?? "",
      primaryColor: prefill.primaryColor.value ?? "",
      secondaryColors: analysis.secondary_colors ?? [],
      sleeveLength: prefill.sleeveLength.value,
      fit: prefill.fit.value,
      material: prefill.material.value ?? "",
      pattern: prefill.pattern.value,
      usage: prefill.usage.value ?? [],
      formality: analysis.formality ?? null,
      seasons: analysis.seasons ?? [],
      aiDescription: analysis.description ?? null,
    });

    this.patch(jobId, { status: "detourage" });
    try {
      const cutout = await this.deps.cutoutPhoto(jobFiles.file);
      this.files.set(jobId, { file: jobFiles.file, cutoutBlob: cutout });
      this.patch(jobId, { hasCutout: true, useProcessedPhoto: true });
    } catch (err) {
      // Ne bloque jamais l'import : l'original reste utilisable tel quel (§9).
      console.error("[dressing][bulk] détourage impossible, original conservé :", err);
      this.patch(jobId, { hasCutout: false, useProcessedPhoto: false });
    }

    this.patch(jobId, { status: "prete" });
  }

  /** Relance l'analyse+détourage d'une pièce en erreur. Isolé des autres jobs (§9). */
  retry(jobId: string): void {
    const proposal = this.proposals.get(jobId);
    if (!proposal || proposal.status !== "erreur") return;
    void this.processQueue([jobId]);
  }

  /** Retire une pièce de la revue sans jamais avoir créé d'objet Storage/DB pour elle (§9/§10). */
  skip(jobId: string): void {
    this.proposals.delete(jobId);
    this.files.delete(jobId);
    this.order = this.order.filter((id) => id !== jobId);
    this.emit();
  }

  /** Correction manuelle d'une fiche avant validation — jamais de champ protégé écrasé. */
  updateProposal(jobId: string, patch: Partial<BulkWardrobeProposal>): void {
    const safePatch: Partial<BulkWardrobeProposal> = {};
    for (const key of Object.keys(patch) as Array<keyof BulkWardrobeProposal>) {
      if (PROTECTED_PROPOSAL_KEYS.has(key)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (safePatch as any)[key] = (patch as any)[key];
    }
    this.patch(jobId, safePatch);
  }

  /** Marque/lève le signal doublon décidé par l'utilisateur ("Ajouter quand même" / "Ignorer"). */
  setDuplicateIgnored(jobId: string, ignored: boolean): void {
    this.patch(jobId, { duplicateIgnored: ignored });
  }

  /** Recalcule les doublons potentiels contre la base existante ET les autres propositions en revue. */
  computeDuplicates(existingItems: readonly (WardrobeDuplicateKey & { id: string })[]): void {
    const proposals = this.getProposals().filter((p) => p.status !== "erreur");
    for (const proposal of proposals) {
      const candidate: WardrobeDuplicateKey = {
        subcategory: proposal.subcategory,
        primaryColor: proposal.primaryColor,
        brand: proposal.brand,
      };
      const existingMatches = findDuplicateMatches(candidate, existingItems);
      const proposalMatches = proposals
        .filter((other) => other.jobId !== proposal.jobId)
        .filter((other) =>
          isLikelyDuplicate(candidate, {
            subcategory: other.subcategory,
            primaryColor: other.primaryColor,
            brand: other.brand,
          }),
        )
        .map((other) => other.jobId);
      const nextIds = [...existingMatches, ...proposalMatches];
      const current = this.proposals.get(proposal.jobId);
      if (current && JSON.stringify(current.duplicateOfIds) !== JSON.stringify(nextIds)) {
        this.patch(proposal.jobId, { duplicateOfIds: nextIds });
      }
    }
  }

  /** Valide une pièce : upload Storage + insert `wardrobe_items` (seul moment où Storage est touché, §10). */
  async validate(
    jobId: string,
  ): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
    const proposal = this.proposals.get(jobId);
    const jobFiles = this.files.get(jobId);
    if (!proposal || !jobFiles) return { ok: false, error: "Pièce introuvable." };
    if (proposal.status !== "prete")
      return { ok: false, error: "Cette pièce n'est pas encore prête." };
    if (!proposal.category) return { ok: false, error: "Catégorie manquante." };

    try {
      const itemId = await this.deps.createItem({
        file: jobFiles.file,
        processedFile: proposal.useProcessedPhoto ? jobFiles.cutoutBlob : null,
        proposal,
      });
      this.patch(jobId, {
        status: "validee",
        validated: true,
        createdItemId: itemId,
        errorMessage: null,
      });
      return { ok: true, itemId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ajout au dressing impossible.";
      this.patch(jobId, { errorMessage: message, errorStage: "validation" });
      return { ok: false, error: message };
    }
  }

  /** Valide en série toutes les pièces prêtes (ou la sélection fournie) — erreurs isolées, jamais d'arrêt du lot (§9). */
  async validateAll(
    jobIds?: readonly string[],
  ): Promise<{ succeeded: string[]; failed: Array<{ jobId: string; error: string }> }> {
    const targets =
      jobIds ??
      this.getProposals()
        .filter((p) => p.status === "prete")
        .map((p) => p.jobId);
    const succeeded: string[] = [];
    const failed: Array<{ jobId: string; error: string }> = [];

    await runWithConcurrency(targets, this.concurrency, async (jobId) => {
      const result = await this.validate(jobId);
      if (result.ok) succeeded.push(jobId);
      else failed.push({ jobId, error: result.error });
    });

    return { succeeded, failed };
  }

  /**
   * Abandon complet de l'import (navigation, annulation) : vide l'état
   * local. Aucun nettoyage Storage nécessaire — rien n'a été uploadé pour
   * les pièces non validées (§10).
   */
  abandon(): void {
    this.proposals.clear();
    this.files.clear();
    this.order = [];
    this.emit();
  }
}

/** Construit le `CreateWardrobeItemInput` (même forme que le flux d'ajout individuel) à partir d'une proposition. */
export function proposalToCreateInput(
  proposal: BulkWardrobeProposal,
  file: File,
  processedFile: Blob | null,
): CreateWardrobeItemInput {
  if (!proposal.category) {
    throw new Error("Catégorie manquante.");
  }
  return {
    file,
    category: proposal.category,
    name: proposal.name,
    brand: proposal.brand,
    primaryColor: proposal.primaryColor,
    subcategory: proposal.subcategory,
    size: proposal.size.trim() || undefined,
    secondaryColors: proposal.secondaryColors,
    sleeveLength: proposal.sleeveLength,
    fit: proposal.fit,
    material: proposal.material.trim() || null,
    pattern: proposal.pattern,
    usage: proposal.usage,
    formality: proposal.formality,
    seasons: proposal.seasons,
    aiDescription: proposal.aiDescription,
    aiMetadata: proposal.analysisResult
      ? (JSON.parse(
          JSON.stringify(proposal.analysisResult),
        ) as CreateWardrobeItemInput["aiMetadata"])
      : null,
    processedFile,
  };
}
