// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SessionRecap } from "@/lib/fitness/rpg/sessionRecap";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shareImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/share/shareImage", () => ({ shareImage }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useUserStats", () => ({
  useUserStats: () => ({ data: { xp: 0, level: 1, total_actions: 0 } }),
}));

import { SessionRecapScreen } from "./SessionRecapScreen";

const RECAP: SessionRecap = {
  totalSets: 15,
  totalVolumeKg: 4120,
  exercises: [
    { id: "e1", name: "Développé militaire", sets: 5, imageUrl: null, volumeKg: 2000 },
    { id: "e2", name: "Élévations latérales", sets: 10, imageUrl: null, volumeKg: 2120 },
  ] as unknown as SessionRecap["exercises"],
};

let container: HTMLDivElement;
let root: Root;
const onFinish = vi.fn();

beforeEach(() => {
  shareImage.mockReset().mockResolvedValue("shared");
  onFinish.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <SessionRecapScreen
        recap={RECAP}
        date={new Date(2026, 8, 30, 18)}
        prCount={2}
        onFinish={onFinish}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const exportNode = () => document.body.querySelector('div[aria-hidden="true"]') as HTMLElement;
const partager = () =>
  [...document.body.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Partager"),
  ) as HTMLButtonElement;

describe("SessionRecapScreen — le partage signé « Cortex » (G28)", () => {
  it("l'image exportée est signée du mot-marque, plus d'« iCortex »", () => {
    expect(exportNode().textContent).toContain("Cortex");
    expect(document.body.textContent).not.toMatch(/icortex/i);
  });

  it("le rang n'est pas répété dans le pied : la carte porte déjà son bandeau Rang/Grade", () => {
    const cardImages = exportNode().querySelectorAll("img").length;
    // Une illustration de rang (celle du bandeau de la carte) — pas de médaillon en plus.
    expect(cardImages).toBe(1);
  });

  it("Partager capture le nœud 9:16 avec le texte signé et le nom de fichier", async () => {
    await act(async () => {
      partager().click();
    });
    expect(shareImage).toHaveBeenCalledTimes(1);
    const [node, options] = shareImage.mock.calls[0];
    expect(node).toBe(exportNode().firstElementChild);
    expect(options).toEqual({
      title: "Séance terminée — Cortex",
      text: "15 séries · 4\u00a0120 kg 💪",
      filename: "cortex-seance.png",
      width: 540,
      height: 960,
      backgroundColor: "#050505",
    });
  });

  it("« Terminer » reste indépendant du partage", () => {
    const terminer = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Terminer"),
    ) as HTMLButtonElement;
    act(() => terminer.click());
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(shareImage).not.toHaveBeenCalled();
  });
});
