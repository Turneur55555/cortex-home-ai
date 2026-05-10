import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "./stocks";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ICORTEX" },
      { name: "description", content: "PDFs analysés par l'IA." },
    ],
  }),
  component: () => <ComingSoon title="Documents" subtitle="Upload PDF + analyse IA — bientôt disponible." />,
});
