import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODULE_LABELS, type AnalysisResult, type DocModule } from "@/hooks/use-documents";
import type { Tables } from "@/integrations/supabase/types";

export function ResultCard({
  doc,
  result,
  onDismiss,
}: {
  doc: Tables<"documents">;
  result: AnalysisResult;
  onDismiss: () => void;
}) {
  const detected = doc.module as DocModule;

  return (
    <div className="mb-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Analyse IA — détecté : {MODULE_LABELS[detected] ?? detected}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{result.summary}</p>
      {result.key_insights.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {result.key_insights.map((k, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}
      {result.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
          {result.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      <TransferPanel
        items={items}
        defaultTarget={toTransferTarget(detected)}
        onSuccess={onDismiss}
        className="mt-4"
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="min-h-[2.75rem] px-4"
        >
          Fermer
        </Button>
      </div>
    </div>
  );
}
