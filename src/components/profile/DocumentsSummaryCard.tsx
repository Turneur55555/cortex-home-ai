import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText, Upload } from "lucide-react";
import { useDocuments } from "@/hooks/use-documents";
import { Skeleton } from "@/components/ui/skeleton";

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  return `il y a ${diff}j`;
}

/**
 * Carte de résumé — remplace le double panneau "Docs IA" / "Mes PDF"
 * autrefois dupliqué sur Profil. La page `/documents` est déjà l'expérience
 * complète (import + rapport de déversement) : Profil se contente d'y
 * renvoyer plutôt que d'en réafficher une copie appauvrie (voir audit du
 * 06/07/2026, §2.1). Réutilise `useDocuments()` tel quel — aucune nouvelle
 * requête, aucune logique dupliquée.
 */
export function DocumentsSummaryCard() {
  const { data, isLoading } = useDocuments();
  const count = data?.length ?? 0;
  const latest = data?.[0];

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Documents
        </h2>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl">
        <Link
          to="/documents"
          className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : count === 0 ? (
              <div className="min-w-0">
                <p className="text-sm font-medium">Aucun document</p>
                <p className="text-xs text-muted-foreground">
                  Importe un PDF ou une photo à analyser
                </p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {count} document{count > 1 ? "s" : ""}
                </p>
                {latest && (
                  <p className="truncate text-xs text-muted-foreground">
                    Dernier : {latest.name} · {daysAgo(latest.created_at)}
                  </p>
                )}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        <div className="mt-1 flex gap-2 px-2 pb-1">
          <Link
            to="/documents"
            search={{ upload: true }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/15 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
          >
            <Upload className="h-3.5 w-3.5" />
            Importer
          </Link>
          <Link
            to="/documents"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.08]"
          >
            Voir tous
          </Link>
        </div>
      </div>
    </section>
  );
}
