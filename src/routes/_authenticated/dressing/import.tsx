import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  CheckCheck,
  ChevronLeft,
  ImagePlus,
  Loader2,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useWardrobeBulkImport, type BulkWardrobeProposal } from "@/hooks/useWardrobeBulkImport";
import { WARDROBE_ADD_CATEGORIES } from "@/hooks/useWardrobe";
import {
  getCharacteristicsConfig,
  getSizeConfig,
  getSubcategoriesForCategory,
} from "@/lib/wardrobe/taxonomy";

export const Route = createFileRoute("/_authenticated/dressing/import")({
  head: () => ({
    meta: [
      { title: "Importer plusieurs pièces — ICORTEX" },
      {
        name: "description",
        content: "Importe plusieurs photos de vêtements d'un coup dans ton dressing ICORTEX.",
      },
    ],
  }),
  component: BulkImportPage,
});

function statusLabel(proposal: BulkWardrobeProposal): string {
  switch (proposal.status) {
    case "en_attente":
      return "En attente…";
    case "analyse":
      return "Analyse…";
    case "detourage":
      return "Détourage…";
    case "prete":
      return "Prête à valider";
    case "validee":
      return "Ajoutée";
    case "erreur":
      return "Analyse impossible";
    default:
      return "";
  }
}

function BulkImportPage() {
  const navigate = useNavigate();
  const {
    proposals,
    progress,
    addFiles,
    retry,
    skip,
    updateProposal,
    setDuplicateIgnored,
    validate,
    validateAll,
    abandon,
  } = useWardrobeBulkImport();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [validatingAll, setValidatingAll] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const hasStarted = proposals.length > 0;
  const readyCount = proposals.filter((p) => p.status === "prete").length;
  const errorCount = proposals.filter((p) => p.status === "erreur").length;
  const validatedCount = proposals.filter((p) => p.status === "validee").length;
  const stillProcessing = proposals.some(
    (p) => p.status === "en_attente" || p.status === "analyse" || p.status === "detourage",
  );

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    addFiles(fileList);
  }

  function handleLeave() {
    const pending = proposals.filter((p) => p.status !== "validee");
    if (pending.length > 0) {
      const ok = window.confirm(
        `${pending.length} pièce(s) non ajoutée(s) à ton dressing seront perdues. Quitter quand même ?`,
      );
      if (!ok) return;
    }
    abandon();
    void navigate({ to: "/dressing" });
  }

  async function handleValidateAll() {
    setConfirmBulk(false);
    setValidatingAll(true);
    try {
      await validateAll();
    } finally {
      setValidatingAll(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <button
          type="button"
          onClick={handleLeave}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Importer plusieurs pièces</h1>
        {hasStarted && (
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {progress.processed} / {progress.total} analysées
            {errorCount > 0 ? ` · ${errorCount} en erreur` : ""}
            {validatedCount > 0 ? ` · ${validatedCount} ajoutées` : ""}
          </p>
        )}
      </header>

      {!hasStarted ? (
        <div className="rounded-3xl border border-dashed border-border bg-gradient-to-b from-card/80 to-card/40 p-8 text-center">
          <p className="text-sm font-semibold">Sélectionne 20 à 50 photos (ou plus)</p>
          <p className="mx-auto mt-1 max-w-[18rem] text-xs text-muted-foreground">
            Cortex analyse chaque pièce, propose une fiche par photo. Tu vérifies et valides avant
            tout ajout définitif.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card/50 px-4 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Camera className="h-4 w-4" /> Prendre des photos
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground"
            >
              <ImagePlus className="h-4 w-4" /> Choisir dans la photothèque
            </button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <>
          {/* Barre de progression réelle — jamais un pourcentage inventé */}
          <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%`,
              }}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              + Ajouter d'autres photos
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {readyCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmBulk(true)}
                disabled={validatingAll}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {validatingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Tout valider ({readyCount})
              </button>
            )}
          </div>

          {confirmBulk && (
            <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm font-semibold">Ajouter {readyCount} pièces au dressing ?</p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBulk(false)}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleValidateAll()}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Confirmer
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.jobId}
                proposal={proposal}
                allProposals={proposals}
                onRetry={() => retry(proposal.jobId)}
                onSkip={() => skip(proposal.jobId)}
                onUpdate={(patch) => updateProposal(proposal.jobId, patch)}
                onIgnoreDuplicate={(ignored) => setDuplicateIgnored(proposal.jobId, ignored)}
                onValidate={() => void validate(proposal.jobId)}
              />
            ))}
          </ul>

          {!stillProcessing && proposals.length === 0 && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Tout a été traité. Ajoute d'autres photos ou retourne à ton dressing.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function ProposalCard({
  proposal,
  allProposals,
  onRetry,
  onSkip,
  onUpdate,
  onIgnoreDuplicate,
  onValidate,
}: {
  proposal: BulkWardrobeProposal;
  allProposals: BulkWardrobeProposal[];
  onRetry: () => void;
  onSkip: () => void;
  onUpdate: (patch: Partial<BulkWardrobeProposal>) => void;
  onIgnoreDuplicate: (ignored: boolean) => void;
  onValidate: () => void;
}) {
  const subcategoryOptions = proposal.category
    ? getSubcategoriesForCategory(proposal.category)
    : [];
  const sizeConfig = proposal.category ? getSizeConfig(proposal.category) : null;
  const characteristics = proposal.category ? getCharacteristicsConfig(proposal.category) : null;

  const isBusy =
    proposal.status === "analyse" ||
    proposal.status === "detourage" ||
    proposal.status === "en_attente";
  const isError = proposal.status === "erreur";
  const isValidated = proposal.status === "validee";
  const isReady = proposal.status === "prete";

  const otherDuplicateNames = proposal.duplicateOfIds
    .map((id) => allProposals.find((p) => p.jobId === id)?.name)
    .filter((n): n is string => !!n);
  const hasDuplicateWarning =
    proposal.duplicateOfIds.length > 0 && !proposal.duplicateIgnored && isReady;

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card/50">
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted/30 text-[10px] text-muted-foreground">
          {proposal.fileName.length > 10 ? `${proposal.fileName.slice(0, 8)}…` : proposal.fileName}
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {isError && <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />}
            <span>{statusLabel(proposal)}</span>
          </div>

          {isError && (
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground">
                {proposal.errorMessage ?? "Photo — analyse impossible."}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
              >
                <RotateCcw className="h-3 w-3" /> Réessayer
              </button>
            </div>
          )}

          {(isReady || isValidated) && (
            <p className="truncate text-[11px] text-muted-foreground">
              {[proposal.subcategory, proposal.primaryColor].filter(Boolean).join(" · ") ||
                "Détails à compléter"}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onSkip}
          aria-label="Retirer cette photo"
          disabled={isValidated}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isReady && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {hasDuplicateWarning && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px]">
              <p className="flex items-center gap-1.5 font-semibold text-amber-600">
                <TriangleAlert className="h-3.5 w-3.5" /> Pièce potentiellement déjà présente
              </p>
              {otherDuplicateNames.length > 0 && (
                <p className="mt-0.5 text-muted-foreground">
                  Proche de : {otherDuplicateNames.join(", ")}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onIgnoreDuplicate(true)}
                  className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold"
                >
                  Ajouter quand même
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold"
                >
                  Ignorer
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Catégorie
              </label>
              <select
                value={proposal.category ?? ""}
                onChange={(e) =>
                  onUpdate({
                    category: (e.target.value || null) as BulkWardrobeProposal["category"],
                    subcategory: null,
                    size: "",
                  })
                }
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary"
              >
                <option value="">Choisir…</option>
                {WARDROBE_ADD_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Type précis
              </label>
              <select
                value={proposal.subcategory ?? ""}
                onChange={(e) => onUpdate({ subcategory: e.target.value || null })}
                disabled={!proposal.category}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">Choisir…</option>
                {subcategoryOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Couleur
              </label>
              <input
                type="text"
                value={proposal.primaryColor}
                onChange={(e) => onUpdate({ primaryColor: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary"
              />
            </div>

            <div>
              {/* Taille — jamais préremplie par Cortex Vision, toujours vide au départ (§6). */}
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Taille
              </label>
              {sizeConfig ? (
                <select
                  value={proposal.size}
                  onChange={(e) => onUpdate({ size: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary"
                >
                  <option value="">Facultatif</option>
                  {sizeConfig.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={proposal.size}
                  onChange={(e) => onUpdate({ size: e.target.value })}
                  placeholder="Facultatif"
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary"
                />
              )}
            </div>
          </div>

          {characteristics?.usage && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Usage
              </label>
              <p className="text-[11px] text-muted-foreground">
                {proposal.usage.length > 0 ? proposal.usage.join(", ") : "—"}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={proposal.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Nom de la pièce"
              className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={onValidate}
              disabled={!proposal.category}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Valider
            </button>
          </div>
        </div>
      )}

      {isValidated && (
        <div className="border-t border-border px-3 py-2 text-[11px] font-medium text-primary">
          Ajoutée au dressing.
        </div>
      )}
    </li>
  );
}
