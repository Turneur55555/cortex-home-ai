import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "./stocks";

export const Route = createFileRoute("/_authenticated/fitness")({
  head: () => ({
    meta: [
      { title: "Fitness — ICORTEX" },
      { name: "description", content: "Suivi corps, séances et nutrition." },
    ],
  }),
  component: () => <ComingSoon title="Fitness" subtitle="Suivi corporel, séances et macros — bientôt disponible." />,
});
