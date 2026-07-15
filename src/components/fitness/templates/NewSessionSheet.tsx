// ============================================================
// Phase A (15/07/2026) — porte d'entrée UNIQUE "Nouvelle séance"
// (voir docs/architecture/phase-a-nouvelle-seance.md, A.1-A.4).
//
// Étape 1 : choix de discipline, lu depuis ENGINE_REGISTRY (les 6
// disciplines existantes, présentées de façon homogène — icône/couleur
// déjà portées par chaque moteur depuis la Phase 7). Ajouter une
// discipline au registre l'ajoute automatiquement ici, zéro modification
// de ce fichier (même contrat Open/Closed que CoachSheet.tsx).
//
// Étape 2 : modes réellement disponibles pour la discipline choisie —
// jamais de bouton grisé. Musculation garde ses parcours dédiés
// (StartWorkoutSheet/SavedTemplatesSheet, inchangés) ; les 5 autres
// disciplines n'ont pas de "Modèle" (fonctionnalité non câblée pour
// elles, pas de faux choix) mais gagnent un "Libre" générique (séance
// active vide, voir A.6/sessionViewHelpers.ts) qu'elles n'avaient pas
// avant cette phase. "Coach IA" route toujours vers CoachSheet avec la
// discipline déjà choisie (prop initialDiscipline, évite de la choisir
// deux fois).
//
// Ce composant ne supprime rien : NewSessionChoiceSheet, StartWorkoutSheet,
// SavedTemplatesSheet, CoachSheet restent tels quels et sont réutilisés
// tels quels (A.7).
// ============================================================

import { useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks, Loader2, Sparkles, Zap } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { DisciplineIcon } from "@/components/fitness/session/DisciplineIcon";
import { listEngines, ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { useStartGenericActiveWorkout } from "@/hooks/useGenericActiveSession";
import { defaultWorkoutName } from "@/lib/fitness/config";

function ModeButton({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function NewSessionSheet({
  onClose,
  onChooseBlankMuscu,
  onChooseSavedMuscu,
  onChooseCoach,
}: {
  onClose: () => void;
  /** Musculation garde StartWorkoutSheet tel quel (inchangé depuis toujours). */
  onChooseBlankMuscu: () => void;
  /** Musculation garde SavedTemplatesSheet tel quel (inchangé). */
  onChooseSavedMuscu: () => void;
  /** Ouvre CoachSheet avec la discipline déjà choisie ici. */
  onChooseCoach: (discipline: DisciplineId) => void;
}) {
  const [discipline, setDiscipline] = useState<DisciplineId | null>(null);
  const startBlankGeneric = useStartGenericActiveWorkout();

  // Toute discipline non-comingSoon du registre — homogène, aucune liste
  // codée en dur (A.2). Aujourd'hui les 6 existantes sont toutes prêtes.
  const engines = listEngines().filter((e) => !e.comingSoon);

  const handleStartBlankGeneric = (id: DisciplineId) => {
    if (startBlankGeneric.isPending) return;
    startBlankGeneric.mutate(
      {
        draft: { discipline: id, name: defaultWorkoutName(), duration_minutes: 0, metadata: {} },
        seedSegments: [],
      },
      { onSuccess: onClose },
    );
  };

  // ── Étape 1 : discipline ──────────────────────────────────────────
  if (!discipline) {
    return (
      <Sheet title="Nouvelle séance" onClose={onClose}>
        <p className="mb-4 text-xs text-muted-foreground">Choisis une discipline.</p>
        <div className="grid grid-cols-2 gap-3">
          {engines.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setDiscipline(entry.id)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-center transition-colors hover:border-primary/40"
            >
              <span
                className={
                  "flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 " +
                  entry.accentClassName
                }
              >
                <DisciplineIcon icon={entry.icon} className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-foreground">{entry.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  // ── Étape 2 : mode, filtré par capacité réelle (A.3) ────────────────
  const entry = ENGINE_REGISTRY[discipline];
  const isMuscu = discipline === "muscu";

  return (
    <Sheet title={entry.label} onClose={onClose}>
      <button
        type="button"
        onClick={() => setDiscipline(null)}
        className="mb-4 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Changer de discipline
      </button>

      <div className="space-y-3">
        {isMuscu ? (
          <ModeButton
            icon={<Zap className="h-5 w-5" />}
            title="Libre"
            description="Choisis un nom et une salle, ajoute tes exercices au fil de la séance."
            onClick={() => {
              onClose();
              onChooseBlankMuscu();
            }}
          />
        ) : (
          <ModeButton
            icon={
              startBlankGeneric.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Zap className="h-5 w-5" />
              )
            }
            title="Libre"
            description="Démarre une séance vide, ajoute tes blocs au fil de la séance."
            disabled={startBlankGeneric.isPending}
            onClick={() => handleStartBlankGeneric(discipline)}
          />
        )}

        {isMuscu && (
          <ModeButton
            icon={<ListChecks className="h-5 w-5" />}
            title="Modèle"
            description="Repars d'une séance sauvegardée (Push, Jambes, HYROX Force...)."
            onClick={() => {
              onClose();
              onChooseSavedMuscu();
            }}
          />
        )}

        <ModeButton
          icon={<Sparkles className="h-5 w-5" />}
          title="Coach IA"
          description="Le Sensei te pose quelques questions et prépare la séance."
          onClick={() => {
            onClose();
            onChooseCoach(discipline);
          }}
        />
      </div>
    </Sheet>
  );
}
