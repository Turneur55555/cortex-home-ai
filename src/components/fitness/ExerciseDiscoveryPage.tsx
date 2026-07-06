import { AlertTriangle, Activity, Dumbbell, Gauge, ListChecks, Zap } from "lucide-react";
import type { MuscleContribution, TraitImpact } from "@/lib/fitness/analysis";
import { Bar, MuscleRow, SectionCard } from "./ExerciseAnalysisPrimitives";

// ============================================================
// Page "Découverte" d'un exercice jamais pratiqué — pensée comme la future
// encyclopédie des exercices de l'app, pas comme un simple état vide de
// ExerciseAnalysisSheet. Chaque section est un bloc indépendant : on peut
// en ajouter de nouvelles (conseils d'exécution, erreurs fréquentes, media,
// intégration BodyMap) sans toucher aux autres.
//
// Principe non négociable : aucune section n'affiche de contenu inventé.
// - Muscles / bénéfices viennent des moteurs déjà validés ailleurs dans
//   l'app (resolveMuscleRoles, computePhysicalImpact) — jamais vides,
//   jamais fabriqués ici.
// - Variantes = heuristique catalogue (lib/fitness/exerciseSimilar.ts).
// - Conseils d'exécution / erreurs fréquentes / media : props optionnelles,
//   volontairement non alimentées pour l'instant (aucune source fiable de
//   contenu par exercice n'existe encore côté produit). Le jour où cette
//   source existera (curation manuelle ou pipeline IA vérifié), il suffira
//   de les passer en props — la section s'affichera automatiquement, sans
//   changement de layout.
// ============================================================

export interface DiscoveryMedia {
  type: "image" | "video";
  url: string;
  label?: string;
}

interface Props {
  exerciseName: string;
  imageUrl?: string | null;
  muscles: MuscleContribution[];
  physicalImpact: TraitImpact[];
  similarExercises?: Array<{ name: string; group: string }>;
  onSelectSimilar?: (name: string) => void;
  ctaLabel: string | null;
  onCta?: () => void;
  /** Extension future : galerie image/vidéo de l'exercice (au-delà de la
   *  seule illustration statique actuelle). Non alimenté pour l'instant. */
  media?: DiscoveryMedia[];
  /** Extension future : conseils d'exécution curatés. Non alimenté pour
   *  l'instant — aucun contenu de technique n'est inventé automatiquement
   *  (risque de blessure si une consigne est fausse). */
  executionTips?: string[];
  /** Extension future : erreurs fréquentes curatées. Même principe que
   *  executionTips : rien tant qu'il n'y a pas de source fiable. */
  commonMistakes?: string[];
  /** Extension future : rendu BodyMap mettant en évidence les muscles
   *  principaux/secondaires (au lieu de / en plus des barres ci-dessous).
   *  Reçoit la liste des muscles déjà résolue — libre à l'appelant de
   *  brancher <BodyMap /> ici quand ce sera prêt. */
  renderMuscleVisual?: (muscles: MuscleContribution[]) => React.ReactNode;
}

export function ExerciseDiscoveryPage({
  exerciseName,
  imageUrl,
  muscles,
  physicalImpact,
  similarExercises,
  onSelectSimilar,
  ctaLabel,
  onCta,
  media,
  executionTips,
  commonMistakes,
  renderMuscleVisual,
}: Props) {
  const primary = muscles.filter((m) => m.role === "primary");
  const secondary = muscles.filter((m) => m.role === "secondary");

  return (
    <>
      <DiscoveryHero exerciseName={exerciseName} imageUrl={imageUrl} media={media} />
      <DiscoveryIntro exerciseName={exerciseName} primary={primary} secondary={secondary} />

      {renderMuscleVisual?.(muscles)}

      {(primary.length > 0 || secondary.length > 0) && (
        <DiscoveryMuscles primary={primary} secondary={secondary} />
      )}

      {physicalImpact.length > 0 && <DiscoveryBenefits physicalImpact={physicalImpact} />}

      {executionTips && executionTips.length > 0 && (
        <SectionCard icon={<ListChecks className="h-3.5 w-3.5" />} title="Conseils d'exécution">
          <ul className="space-y-1.5">
            {executionTips.map((tip, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-foreground/85">
                • {tip}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {commonMistakes && commonMistakes.length > 0 && (
        <SectionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Erreurs fréquentes">
          <ul className="space-y-1.5">
            {commonMistakes.map((mistake, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-foreground/85">
                • {mistake}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {similarExercises && similarExercises.length > 0 && (
        <DiscoverySimilar items={similarExercises} onSelect={onSelectSimilar} />
      )}

      {ctaLabel && onCta && <DiscoveryCta label={ctaLabel} onClick={onCta} />}
    </>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function DiscoveryHero({
  exerciseName,
  imageUrl,
  media,
}: {
  exerciseName: string;
  imageUrl?: string | null;
  media?: DiscoveryMedia[];
}) {
  // Pour l'instant une seule image statique ; `media` permettra plus tard
  // une galerie (photos + vidéos de démonstration) sans changer l'API des
  // appelants (media est optionnel, imageUrl reste le repli par défaut).
  const gallery = media && media.length > 0 ? media : imageUrl ? [{ type: "image" as const, url: imageUrl }] : [];

  if (gallery.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-surface/60 text-muted-foreground">
        <Dumbbell className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/5">
      {gallery[0].type === "video" ? (
        <video src={gallery[0].url} className="max-h-56 w-full object-contain" controls />
      ) : (
        <img src={gallery[0].url} alt={exerciseName} className="max-h-56 w-full object-contain" loading="lazy" />
      )}
    </div>
  );
}

function DiscoveryIntro({
  exerciseName,
  primary,
  secondary,
}: {
  exerciseName: string;
  primary: MuscleContribution[];
  secondary: MuscleContribution[];
}) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Pas encore pratiqué</p>
      <p className="text-[12.5px] leading-relaxed text-foreground/90">
        {discoveryBlurb(exerciseName, primary, secondary)}
      </p>
    </div>
  );
}

function DiscoveryMuscles({
  primary,
  secondary,
}: {
  primary: MuscleContribution[];
  secondary: MuscleContribution[];
}) {
  return (
    <SectionCard icon={<Activity className="h-3.5 w-3.5" />} title="Muscles sollicités">
      <div className="space-y-3">
        {primary.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Principal</p>
            <div className="space-y-2">
              {primary.map((m) => (
                <MuscleRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}
        {secondary.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Secondaire</p>
            <div className="space-y-2">
              {secondary.map((m) => (
                <MuscleRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DiscoveryBenefits({ physicalImpact }: { physicalImpact: TraitImpact[] }) {
  return (
    <SectionCard icon={<Gauge className="h-3.5 w-3.5" />} title="Bénéfices">
      <div className="space-y-2">
        {physicalImpact.slice(0, 4).map((t) => (
          <div key={t.trait}>
            <div className="mb-0.5 flex items-center justify-between text-[11px]">
              <span className="text-foreground/85">{t.label}</span>
            </div>
            <Bar value={t.score} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function DiscoverySimilar({
  items,
  onSelect,
}: {
  items: Array<{ name: string; group: string }>;
  onSelect?: (name: string) => void;
}) {
  return (
    <SectionCard icon={<Dumbbell className="h-3.5 w-3.5" />} title="Variantes / exercices similaires">
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => onSelect?.(s.name)}
            disabled={!onSelect}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none"
          >
            {s.name}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function DiscoveryCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all active:scale-[0.99]"
    >
      <Zap className="h-4 w-4" />
      {label}
    </button>
  );
}

// ── Texte déterministe (jamais inventé — dérivé des rôles musculaires) ─────

function discoveryBlurb(name: string, primary: MuscleContribution[], secondary: MuscleContribution[]): string {
  if (primary.length === 0) {
    return `« ${name} » ne fait pas encore partie de tes séances. Lance-toi pour débloquer son rang, sa progression et ses records.`;
  }
  const p = joinLabels(primary.map((m) => m.label));
  const s = secondary.length > 0 ? `, avec l'appui de ${joinLabels(secondary.map((m) => m.label))}` : "";
  return `« ${name} » cible principalement ${p}${s}. Pas encore pratiqué — lance-toi pour débloquer le rang, la progression et les records sur cet exercice.`;
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(", ") + " et " + labels[labels.length - 1];
}
