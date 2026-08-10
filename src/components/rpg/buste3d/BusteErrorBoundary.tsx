import { Component, type ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Capture les erreurs de chargement du GLB (`useGLTF` lève une erreur au
 * lieu de résoudre sa promesse si le fichier est absent/invalide — normal
 * tant que l'asset définitif n'est pas déposé, voir
 * docs/architecture/rpg-buste-3d-blender-workflow.md). Sans cette limite,
 * une erreur de chargement 3D ferait planter l'écran entier au lieu de
 * simplement retomber sur `RankIllustration` (2D) — un composant
 * fonctionnel React ne peut pas capturer d'erreurs de rendu, d'où la classe.
 */
export class BusteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[BusteErrorBoundary] buste 3D indisponible, repli 2D :", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
