import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const tabSchema = z.enum(["corps", "seances", "nutrition"]).catch("corps");

const TARGET = {
  corps: "/corps",
  seances: "/seances",
  nutrition: "/nutrition",
} as const;

export const Route = createFileRoute("/_authenticated/fitness/")({
  validateSearch: z.object({ tab: tabSchema.optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: TARGET[search.tab ?? "corps"] });
  },
});
