import { useState } from "react";
import { MoreVertical, X } from "lucide-react";

export interface ExerciseMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  /** Nom affiché en titre de la feuille d'actions. */
  title: string;
  actions: ExerciseMenuAction[];
  /** Classe du bouton déclencheur — permet de l'adapter au contexte
   *  (icône seule sur une ligne de liste, bouton plus large en en-tête). */
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * Bouton "..." + feuille d'actions générique, partagé entre le Catalogue,
 * le Picker et la fiche d'analyse. Ne connaît rien de la logique métier :
 * chaque appelant fournit sa propre liste d'actions (modifier / supprimer /
 * promouvoir / démarrer une séance / ajouter à la séance en cours / voir la
 * fiche…) déjà câblée sur ses propres mutations. Toujours visible — jamais
 * de pattern hover-only (invisible et impossible à taper sur mobile).
 */
export function ExerciseActionsMenu({ title, actions, triggerClassName, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={ariaLabel ?? `Actions — ${title}`}
        className={
          triggerClassName ??
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        }
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="truncate text-sm font-semibold">{title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={a.disabled}
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-40 ${
                    a.destructive
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  <span className={a.destructive ? "text-destructive" : "text-primary"}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
