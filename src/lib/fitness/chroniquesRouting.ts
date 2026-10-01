/**
 * Le contrat de navigation des Chroniques (E20) : quoi faire de l'URL quand on change de module,
 * qu'on ouvre ou referme une Chronique immersive.
 *
 * Logique PURE (zéro React, zéro routeur) : la route (`routes/_authenticated/chroniques.tsx`) fournit
 * les trois effets (`setSearch`, `canGoBack`, `goBack`) ; ce module décide lequel appeler. Séparé de
 * la route pour que ces choix — qui font la différence entre un retour arrière qui ferme une
 * Chronique et un retour arrière qui éjecte du livre — se testent sans navigateur.
 */

import { z } from "zod";
import {
  CHRONIQUES_MODULE_KEYS,
  DEFAULT_CHRONIQUES_MODULE,
  type ChroniquesModuleKey,
} from "@/lib/fitness/chroniquesModules";

/**
 * `?module=` et `?seance=`. Une valeur invalide est IGNORÉE (module par défaut, pas de Chronique)
 * plutôt que de casser la page : un lien périmé ou tapé à la main ne doit jamais donner un écran vide.
 */
export const chroniquesSearchSchema = z.object({
  module: z.enum(CHRONIQUES_MODULE_KEYS).optional().catch(undefined),
  seance: z.string().min(1).optional().catch(undefined),
});

export type ChroniquesSearch = z.infer<typeof chroniquesSearchSchema>;

/**
 * Ce que `SeancesTab` reçoit : l'état des Chroniques vit dans l'URL, jamais dans un état local.
 * `SeancesTab` n'ouvre ni ne ferme rien lui-même.
 */
export interface ChroniquesRouting {
  /** Le module actif (`?module=`). */
  module: ChroniquesModuleKey;
  onModuleChange: (module: ChroniquesModuleKey) => void;
  /** La séance dont la Chronique immersive est ouverte (`?seance=`), s'il y en a une. */
  chronicleId: string | undefined;
  /**
   * Ouvre la Chronique immersive d'une séance. `push` ajoute une entrée d'historique (le retour
   * arrière du navigateur la referme) ; `replace` la remplace (précédent / suivant).
   */
  onChronicleOpen: (workoutId: string, mode: "push" | "replace") => void;
  /**
   * La referme. Revient en arrière quand l'écran a été atteint depuis les Chroniques ; sinon (lien
   * direct, rechargement) remplace l'URL — jamais de sortie surprise de l'application.
   * `replace: true` force le remplacement (identifiant devenu introuvable).
   */
  onChronicleClose: (options?: { replace?: boolean }) => void;
}

export interface ChroniquesRoutingDeps {
  search: ChroniquesSearch;
  /** Applique un correctif à l'URL. `replace` remplace l'entrée d'historique courante au lieu d'en ajouter une. */
  setSearch: (patch: Partial<ChroniquesSearch>, options: { replace: boolean }) => void;
  /** Y a-t-il une entrée d'historique précédente DANS l'application ? */
  canGoBack: () => boolean;
  goBack: () => void;
}

export function createChroniquesRouting(deps: ChroniquesRoutingDeps): ChroniquesRouting {
  const { search, setSearch, canGoBack, goBack } = deps;
  return {
    module: search.module ?? DEFAULT_CHRONIQUES_MODULE,
    // Les trois modules sont des PAIRS : changer de module remplace l'entrée d'historique, le retour
    // arrière ne doit pas rejouer chaque bascule d'onglet. Une Chronique ouverte ne survit pas au
    // changement de module.
    onModuleChange: (module) => setSearch({ module, seance: undefined }, { replace: true }),
    chronicleId: search.seance,
    onChronicleOpen: (workoutId, mode) =>
      setSearch({ seance: workoutId }, { replace: mode === "replace" }),
    onChronicleClose: (options) => {
      if (!options?.replace && canGoBack()) {
        goBack();
        return;
      }
      setSearch({ seance: undefined }, { replace: true });
    },
  };
}
