import { Loader2 } from "lucide-react";

export function LoadingScreen({ label = "Chargement…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}
