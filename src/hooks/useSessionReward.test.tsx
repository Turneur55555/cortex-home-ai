// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Quand le serveur confirme l'XP d'une séance, l'XP affichée AILLEURS (fiche de personnage de
 * l'Accueil : l'XP globale) doit se relire. Mesuré sur le banc visuel du
 * 01/11/2026 : après « Je l'ai faite », l'écran de récompense disait « Encore 1 821 XP avant
 * Éternel » et la fiche, restée montée, « Plus que 1 936 XP » — la clôture part par
 * `requestSyncFlush`, hors de l'invalidation post-synchronisation de `useOfflineSync`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  snapshot: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () =>
      table === "xp_events"
        ? Promise.resolve({ data: [{ source: "workout_muscu", amount: 100 }], error: null })
        : builder;
    builder.maybeSingle = () => Promise.resolve({ data: holder.snapshot, error: null });
    return builder;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/hooks/useNetworkStatus", () => ({ useNetworkStatus: () => true }));
vi.mock("@/hooks/useUserStats", () => ({
  useUserStats: () => ({ data: { xp: 71264, level: 30, total_actions: 0 }, isLoading: false }),
}));
vi.mock("@/lib/offline/syncQueue", () => ({
  hasQueuedOperationsForRecord: async () => false,
}));

import { useSessionReward } from "./useSessionReward";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let latest: ReturnType<typeof useSessionReward> | null = null;

function Probe({ id }: { id: string }) {
  latest = useSessionReward(id);
  return null;
}

async function mount(id = "w-1") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe id={id} />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  latest = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey?: unknown })?.queryKey));

describe("useSessionReward — la confirmation serveur rafraîchit l'XP affichée ailleurs", () => {
  it("confirmée : l'XP globale est invalidée, une seule fois par séance", async () => {
    holder.snapshot = { xp_before: 71264, xp_after: 71379, level_before: 30, level_after: 30 };
    const spy = vi.spyOn(client, "invalidateQueries");
    await mount();
    expect(latest?.confirmation).toBe("confirmed");
    const keys = invalidatedKeys(spy);
    expect(keys.filter((k) => k === '["user_stats"]')).toHaveLength(1);

    await mount(); // nouveau rendu, même séance : rien de plus
    expect(invalidatedKeys(spy).filter((k) => k === '["user_stats"]')).toHaveLength(1);
  });

  it("pas encore confirmée : rien n'est invalidé (aucune relecture inutile)", async () => {
    holder.snapshot = { xp_before: null, xp_after: null, level_before: null, level_after: null };
    const spy = vi.spyOn(client, "invalidateQueries");
    await mount();
    expect(latest?.confirmation).not.toBe("confirmed");
    expect(invalidatedKeys(spy)).not.toContain('["user_stats"]');
  });
});
