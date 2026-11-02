// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * `useWeeklyXp` : une lecture serveur BORNÉE (INVARIANTS §4.1) dont la complétude est
 * PROUVÉE — un total tronqué n'est jamais affiché comme un fait.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  response: { data: [] as unknown[], error: null as unknown, count: 0 as number | null },
  calls: [] as Array<[string, ...unknown[]]>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "order"]) {
    builder[method] = (...args: unknown[]) => {
      holder.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    holder.calls.push(["limit", ...args]);
    return Promise.resolve(holder.response);
  };
  return {
    supabase: {
      from: (table: string) => {
        holder.calls.push(["from", table]);
        return builder;
      },
    },
  };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-11-01" }));

import { useWeeklyXp } from "./useWeeklyXp";

let container: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useWeeklyXp> | null = null;

function Probe() {
  latest = useWeeklyXp();
  return null;
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  holder.calls = [];
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const at = (ymd: string) => new Date(`${ymd}T12:00:00`).toISOString();

describe("useWeeklyXp", () => {
  it("lit `xp_events` du joueur depuis le lundi de la semaine précédente, bornée, comptée", async () => {
    holder.response = {
      data: [
        { amount: 100, created_at: at("2026-10-30") },
        { amount: 619, created_at: at("2026-10-20") },
      ],
      error: null,
      count: 2,
    };
    await mount();
    expect(latest?.summary).toEqual({ thisWeek: 100, lastWeek: 619 });
    expect(holder.calls).toContainEqual(["from", "xp_events"]);
    expect(holder.calls).toContainEqual(["select", "amount, created_at", { count: "exact" }]);
    expect(holder.calls).toContainEqual(["eq", "user_id", "u-1"]);
    expect(holder.calls).toContainEqual([
      "gte",
      "created_at",
      new Date("2026-10-19T00:00:00").toISOString(),
    ]);
    expect(holder.calls.some(([m]) => m === "limit")).toBe(true);
  });

  it("le serveur annonce plus de lignes qu'il n'en renvoie : RIEN plutôt qu'un total tronqué", async () => {
    holder.response = {
      data: [{ amount: 100, created_at: at("2026-10-30") }],
      error: null,
      count: 5000,
    };
    await mount();
    expect(latest?.summary).toBeNull();
  });

  it("erreur (hors connexion) : rien — jamais « +0 XP »", async () => {
    holder.response = { data: [], error: new Error("Failed to fetch"), count: null };
    await mount();
    expect(latest?.summary).toBeNull();
  });
});
