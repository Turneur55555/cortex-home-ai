// ============================================================
// Primitives visuelles partagées par les cartes d'exercice du module
// Séance — ActiveExerciseCard (séance active, avec performances/historique)
// et TemplateExerciseCard (modèle de séance sauvegardé, sans performances).
// Objectif : une seule source de vérité pour l'apparence (carte, en-tête,
// photo, champ chiffré, boutons) afin que les deux écrans restent
// visuellement indiscernables sans dupliquer le markup.
// ============================================================

import { useRef } from "react";
import { Camera, ChevronDown, Dumbbell, Loader2, Plus, type LucideIcon } from "lucide-react";

// ─── Carte ───────────────────────────────────────────────────────────────────

export function ExerciseCardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/5 bg-surface/80 p-4 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      {children}
    </div>
  );
}

// ─── Photo + upload ──────────────────────────────────────────────────────────

export function ExercisePhotoTile({
  imageUrl,
  name,
  onOpenPreview,
  onPickPhoto,
  uploading,
}: {
  imageUrl: string | null;
  name: string;
  onOpenPreview?: () => void;
  onPickPhoto: (file: File) => void;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <button
        type="button"
        onClick={onOpenPreview}
        aria-label="Voir la photo et les détails"
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/10 transition-opacity active:opacity-70"
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <Dumbbell className="h-7 w-7 text-primary/70" />
        )}
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Ajouter une photo"
        className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPickPhoto(file);
        }}
      />
    </div>
  );
}

// ─── En-tête (photo + titre repliable + badges + actions) ──────────────────

export function ExerciseCardHeader({
  photo,
  title,
  collapsed,
  onToggleCollapse,
  metaLine,
  badges,
  actions,
}: {
  photo: React.ReactNode;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  metaLine?: React.ReactNode;
  badges?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {photo}

      <button type="button" onClick={onToggleCollapse} className="min-w-0 flex-1 pt-0.5 text-left">
        <div className="flex items-start gap-1.5">
          <h3 className="line-clamp-2 flex-1 text-[17px] font-semibold leading-tight tracking-tight">
            {title}
          </h3>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${
              collapsed ? "" : "rotate-180"
            }`}
          />
        </div>

        {metaLine}

        {badges && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
      </button>

      <div className="flex shrink-0 flex-col gap-1.5">{actions}</div>
    </div>
  );
}

// ─── Boutons ─────────────────────────────────────────────────────────────────

export function ExerciseCardIconButton({
  icon: Icon,
  onClick,
  label,
  disabled,
  variant = "default",
}: {
  icon: LucideIcon;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 disabled:opacity-30 ${
        variant === "destructive"
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-primary/10 hover:text-primary"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function ExerciseCardPillButton({
  icon: Icon = Plus,
  label,
  onClick,
  disabled,
}: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-white/[0.05] text-[13px] font-semibold text-primary transition-all active:scale-[0.99] hover:bg-primary/10 disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/** CTA "Ajouter un exercice" — même bouton en séance active et en modèle. */
export function AddExerciseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-4 text-sm font-semibold text-primary transition-all active:scale-[0.99] hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
    >
      {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Ajouter un exercice
    </button>
  );
}

// ─── Confirmation de suppression (exercice) ─────────────────────────────────

export function ExerciseCardConfirmDelete({
  label,
  detail,
  onCancel,
  onConfirm,
}: {
  label: string;
  detail?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 animate-in fade-in zoom-in-95 duration-150">
      <p className="text-sm font-semibold text-destructive">{label}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-border py-2 text-xs font-medium"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-destructive py-2 text-xs font-semibold text-destructive-foreground"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

// ─── Champ chiffré tactile (kg / reps) ──────────────────────────────────────

export function ExerciseCardStatField({
  value,
  onChange,
  onCommit,
  placeholder,
  unit,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder: string;
  unit: string;
  step?: string;
}) {
  return (
    <label className="flex h-12 flex-1 flex-col items-center justify-center rounded-[14px] bg-white/[0.05] transition-all focus-within:bg-primary/10 focus-within:ring-1 focus-within:ring-primary/40">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="w-full bg-transparent text-center text-[15px] font-bold leading-none tabular-nums outline-none placeholder:font-semibold placeholder:text-muted-foreground/25"
      />
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/45">
        {unit}
      </span>
    </label>
  );
}

/** Capsule numérotée à gauche d'une ligne de série — même taille que le
 *  champ chiffré pour rester alignée dans la ligne. */
export function ExerciseCardSetIndex({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-12 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.06]">
      {children}
    </div>
  );
}

/** Ligne de série générique (capsule + zone de contenu + actions) — le
 *  contenu de la capsule et les actions restent fournis par l'appelant
 *  (séance active : 1RM live/tendance/validation ; modèle : rien). */
export function ExerciseCardSetRow({
  tone,
  children,
}: {
  tone?: "success" | "warning" | null;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`group flex items-center gap-1.5 rounded-2xl py-1 pl-1 pr-1 transition-colors ${
        tone === "success" ? "bg-success/[0.07]" : tone === "warning" ? "bg-warning/[0.06]" : ""
      }`}
    >
      {children}
    </li>
  );
}
