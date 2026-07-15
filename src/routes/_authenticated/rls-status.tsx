import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ExternalLink, ShieldCheck, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rls-status")({
  head: () => ({
    meta: [
      { title: "État des tests RLS — ICORTEX" },
      { name: "description", content: "État des tests d'isolation RLS et dernières exécutions CI." },
    ],
  }),
  component: RlsStatusPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Source de vérité : src/lib/security/rls.test.ts
// Si tu ajoutes/retires un test là-bas, mets à jour cette liste.
// ─────────────────────────────────────────────────────────────────────────────
type Suite = {
  key: "user_stats" | "user_badges" | "storage_objects";
  title: string;
  description: string;
  tests: string[];
};

const SUITES: Suite[] = [
  {
    key: "user_stats",
    title: "user_stats",
    description: "Lecture seule côté client — pas d'INSERT/UPDATE direct.",
    tests: [
      "Alice ne voit que ses propres stats",
      "Alice ne peut PAS INSERT dans user_stats",
      "Alice ne peut PAS UPDATE ses stats directement",
      "Alice ne peut PAS voir les stats de Bob",
    ],
  },
  {
    key: "user_badges",
    title: "user_badges",
    description: "Déblocage uniquement via RPC unlock_user_badge.",
    tests: [
      "Alice ne peut PAS INSERT directement dans user_badges",
      "unlock_user_badge échoue si critères non remplis",
      "unlock_user_badge refuse un badge inconnu",
      "Alice ne voit pas les badges de Bob",
    ],
  },
  {
    key: "storage_objects",
    title: "storage.objects",
    description: "Buckets privés : food-images, clothes-images, pharmacy-images, pdf-documents.",
    tests: [
      "Alice peut uploader dans son dossier",
      "Alice ne peut PAS uploader dans le dossier de Bob",
      "Alice ne peut PAS lire un fichier de Bob",
      "Alice ne peut PAS supprimer un fichier de Bob",
      "Utilisateur anonyme ne peut RIEN faire",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Actions — configurer via VITE_GITHUB_REPO="owner/repo"
// (sinon la section affiche un message explicatif)
// ─────────────────────────────────────────────────────────────────────────────
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined;
const WORKFLOW_FILE = "rls-tests.yml";

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_commit: { message: string } | null;
  head_branch: string;
  run_number: number;
}

async function fetchRuns(): Promise<WorkflowRun[]> {
  if (!GITHUB_REPO) return [];
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=10`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = (await res.json()) as { workflow_runs: WorkflowRun[] };
  return json.workflow_runs ?? [];
}

function ConclusionBadge({ run }: { run: WorkflowRun }) {
  if (run.status !== "completed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> {run.status}
      </Badge>
    );
  }
  const ok = run.conclusion === "success";
  return (
    <Badge variant={ok ? "default" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {run.conclusion ?? "unknown"}
    </Badge>
  );
}

function RlsStatusPage() {
  const {
    data: runs,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["rls-ci-runs", GITHUB_REPO],
    queryFn: fetchRuns,
    enabled: !!GITHUB_REPO,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const latest = runs?.[0];
  const overallOk = latest?.status === "completed" && latest?.conclusion === "success";

  return (
    <div className="mx-auto w-full max-w-[430px] space-y-4 px-4 pb-24 pt-[max(1.75rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">État des tests RLS</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Isolation entre utilisateurs sur <code>user_stats</code>, <code>user_badges</code> et{" "}
          <code>storage.objects</code>.
        </p>
      </header>

      {/* Résumé CI */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Dernière exécution CI</CardTitle>
              <CardDescription>Workflow {WORKFLOW_FILE}</CardDescription>
            </div>
            {GITHUB_REPO && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Rafraîchir"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!GITHUB_REPO && (
            <p className="text-xs text-muted-foreground">
              Définis <code>VITE_GITHUB_REPO="owner/repo"</code> dans <code>.env</code> pour afficher
              les exécutions GitHub Actions ici.
            </p>
          )}
          {GITHUB_REPO && isLoading && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {GITHUB_REPO && isError && (
            <p className="text-sm text-destructive">Erreur : {(error as Error).message}</p>
          )}
          {latest && (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  #{latest.run_number} · {latest.head_branch}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {latest.head_commit?.message ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(latest.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ConclusionBadge run={latest} />
                <a
                  href={latest.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Voir <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
          {GITHUB_REPO && !isLoading && !latest && !isError && (
            <p className="text-sm text-muted-foreground">Aucune exécution trouvée.</p>
          )}
        </CardContent>
      </Card>

      {/* Statut global */}
      {GITHUB_REPO && latest && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            overallOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {overallOk
            ? "Tous les tests d'isolation RLS sont au vert."
            : "La dernière exécution n'est pas verte — investiguer."}
        </div>
      )}

      {/* Suites */}
      <Tabs defaultValue="user_stats" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="user_stats">Stats</TabsTrigger>
          <TabsTrigger value="user_badges">Badges</TabsTrigger>
          <TabsTrigger value="storage_objects">Storage</TabsTrigger>
        </TabsList>
        {SUITES.map((s) => (
          <TabsContent key={s.key} value={s.key} className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {s.tests.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          overallOk ? "text-emerald-400" : "text-muted-foreground",
                        )}
                      />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Historique CI */}
      {GITHUB_REPO && runs && runs.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Historique récent</CardTitle>
            <CardDescription>10 dernières exécutions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <a
                key={r.id}
                href={r.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/40 p-2 transition hover:bg-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    #{r.run_number} · {r.head_branch}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <ConclusionBadge run={r} />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        Source : <code>src/lib/security/rls.test.ts</code> ·{" "}
        <code>.github/workflows/rls-tests.yml</code>
      </p>
    </div>
  );
}
