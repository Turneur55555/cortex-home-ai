import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/error-logger";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null; supportId: string | null };

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, supportId: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(
      {
        level: "error",
        message: error.message || "React render error",
        stack: error.stack ?? null,
        context: { boundary: "global", componentStack: info.componentStack ?? null },
      },
      { silent: true },
    ).then((id) => this.setState({ supportId: id }));
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, supportId: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, supportId } = this.state;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Une erreur inattendue s'est produite
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            L'application a rencontré un problème. Vous pouvez réessayer ou recharger la page.
          </p>
          {error?.message && (
            <p className="mt-3 break-words rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
              {error.message}
            </p>
          )}
          {supportId && (
            <p className="mt-3 text-xs text-muted-foreground">
              ID de support :{" "}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(supportId)}
                className="font-mono text-foreground underline-offset-2 hover:underline"
                title="Cliquer pour copier"
              >
                {supportId}
              </button>
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Réessayer
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Recharger
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Accueil
            </a>
          </div>
        </div>
      </div>
    );
  }
}
