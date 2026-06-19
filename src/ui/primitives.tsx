/**
 * Shared UI primitives — extracted from duplicated patterns across the app.
 * Single source of truth for visual coherence.
 *
 * NOT a replacement for shadcn/ui — these are project-specific composites built
 * on top of the design tokens defined in src/styles.css.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Stat ─────────────────────────────────────────────────────────────────────

type StatTone = "default" | "indigo" | "danger" | "success" | "amber";

const STAT_VALUE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  indigo: "text-indigo-300",
  danger: "text-destructive",
  success: "text-success",
  amber: "text-amber-300",
};

export interface StatProps {
  label: string;
  value: number | string;
  tone?: StatTone;
  className?: string;
}

export function Stat({ label, value, tone = "default", className }: StatProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/60 p-2.5 backdrop-blur",
        className,
      )}
    >
      <div className={cn("text-xl font-bold", STAT_VALUE_CLASS[tone])}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ─── FilterPill ───────────────────────────────────────────────────────────────

type PillTone = "primary" | "danger" | "amber";

const PILL_ACTIVE_CLASS: Record<PillTone, string> = {
  primary: "border-primary/50 bg-primary/15 text-foreground",
  danger: "border-destructive/50 bg-destructive/15 text-destructive",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-300",
};

export interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}

export function FilterPill({
  active,
  onClick,
  children,
  tone = "primary",
  className,
}: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
        active
          ? PILL_ACTIVE_CLASS[tone]
          : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── IconBtn (toolbar-style) ──────────────────────────────────────────────────

export interface IconBtnProps {
  active?: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  className?: string;
}

export function IconBtn({ active, onClick, icon: Icon, label, className }: IconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        active ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = Bell,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/30 p-10 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-primary px-4 text-xs font-semibold text-primary-foreground shadow-glow"
        >
          <Plus className="h-4 w-4" /> {actionLabel}
        </button>
      )}
    </div>
  );
}
