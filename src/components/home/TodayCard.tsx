import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, Flame, Moon, Swords } from "lucide-react";
import { toast } from "sonner";
import { WeeklyPlanSheet } from "@/components/fitness/plan/WeeklyPlanSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityStreak } from "@/hooks/useActivityStreak";
import { useTodayCard } from "@/hooks/useTodayCard";
import { useStartWorkoutFromSavedTemplate, useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import type { TodayAction, TodayButton, TodayCardKind } from "@/lib/fitness/todayCard";
import { cn } from "@/lib/utils";

/** À partir de combien de jours d'affilée on affiche la flamme : « 1 » n'est pas une série. */
const MIN_STREAK_SHOWN = 2;

function KindIcon({ kind }: { kind: TodayCardKind }) {
  const className = "h-3.5 w-3.5";
  if (kind === "done") return <Check aria-hidden className={className} strokeWidth={3} />;
  if (kind === "rest") return <Moon aria-hidden className={className} />;
  return <Swords aria-hidden className={className} />;
}

/**
 * La Carte du jour — ce que l'Accueil dit en premier : quoi faire aujourd'hui.
 *
 * Purement présentationnelle pour le TEXTE (tout vient de `resolveTodayCard`,
 * `lib/fitness/todayCard.ts`) ; elle ne fait qu'EXÉCUTER l'action que la règle
 * attache à chaque bouton :
 *   - démarrer une séance sauvegardée se fait ICI (la mutation existe, offline-
 *     first, avec sa garde « une seule séance active »), puis on rejoint l'écran
 *     Séances où la séance en cours s'affiche ;
 *   - les autres boutons renvoient vers l'écran Séances, qui porte tout le
 *     parcours de séance (clôture, récompense, récap) — ce parcours n'est PAS
 *     dupliqué sur l'Accueil.
 *
 * Aucune estimation affichée : jamais de pourcentage de récupération.
 * Couleurs : uniquement les jetons du thème (`primary` suit le Rang courant).
 */
export function TodayCard() {
  const { isLoading, state } = useTodayCard();
  const navigate = useNavigate();
  const templates = useWorkoutTemplates();
  const startTemplate = useStartWorkoutFromSavedTemplate();
  const streak = useActivityStreak();
  const [planOpen, setPlanOpen] = useState(false);

  if (isLoading || state.kind === "loading") {
    return <Skeleton className="mb-4 h-[188px] w-full rounded-[26px]" aria-busy="true" />;
  }

  const run = async (action: TodayAction) => {
    switch (action.type) {
      case "resume":
        void navigate({ to: "/seances" });
        return;
      case "new-session":
        void navigate({ to: "/seances", search: { demarrer: "nouvelle" } });
        return;
      case "edit-plan":
        setPlanOpen(true);
        return;
      case "start-template": {
        if (startTemplate.isPending) return;
        const row = templates.data?.find((t) => t.id === action.templateId);
        if (!row) {
          toast.error("Cette séance sauvegardée est introuvable.");
          return;
        }
        try {
          await startTemplate.mutateAsync(row);
        } catch {
          return; // la mutation a déjà affiché son erreur
        }
        void navigate({ to: "/seances" });
        return;
      }
    }
  };

  const busy = startTemplate.isPending;
  const showStreak = !streak.isLoading && streak.current >= MIN_STREAK_SHOWN;

  // Deux boutons côte à côte quand la place le permet ; sur un écran étroit le
  // second passe SOUS le premier et prend toute la largeur (`flex-wrap`), plutôt
  // que de casser un libellé sur deux lignes.
  const renderButton = (button: TodayButton, variant: "primary" | "ghost") => (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run(button.action)}
      className={cn(
        "min-h-[48px] whitespace-nowrap rounded-2xl px-4 text-[13.5px] active:scale-[0.98] disabled:opacity-60",
        variant === "primary"
          ? "grow-[3] basis-40 bg-primary font-bold text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary-glow-soft)]"
          : "grow basis-auto bg-white/[0.07] font-semibold text-foreground",
      )}
    >
      {button.label}
    </button>
  );

  return (
    <>
      <motion.section
        aria-label="Aujourd'hui"
        data-kind={state.kind}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative mb-4 overflow-hidden rounded-[26px] border border-primary/30 bg-gradient-to-br from-primary/[0.16] via-white/[0.03] to-transparent p-5 shadow-[0_14px_48px_-24px_var(--primary-glow-soft)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            <KindIcon kind={state.kind} />
            <span className="truncate">{state.kicker}</span>
          </p>
          {showStreak && (
            <span
              role="img"
              aria-label={`${streak.current} jours d'activité d'affilée`}
              className="flex shrink-0 items-center gap-1 rounded-full bg-orange-500/[0.12] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-orange-300 ring-1 ring-orange-400/30"
            >
              <Flame aria-hidden className="h-3.5 w-3.5" />
              {streak.current}
            </span>
          )}
        </div>

        <h2 className="mt-2 line-clamp-2 break-words font-serif text-[28px] font-semibold italic leading-[1.1] tracking-wide text-foreground">
          {state.title}
        </h2>

        {state.subtitle && (
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{state.subtitle}</p>
        )}

        {(state.primary || state.secondary) && (
          <div className="mt-4 flex flex-wrap gap-2.5">
            {state.primary && renderButton(state.primary, "primary")}
            {state.secondary && renderButton(state.secondary, "ghost")}
          </div>
        )}

        {state.lastTime && (
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{state.lastTime}</p>
        )}
      </motion.section>

      {planOpen && <WeeklyPlanSheet onClose={() => setPlanOpen(false)} />}
    </>
  );
}
