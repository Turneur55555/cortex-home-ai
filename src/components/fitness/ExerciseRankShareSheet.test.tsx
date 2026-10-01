// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RANK_TIERS, type RankState } from "@/lib/fitness/exerciseRanks";
import { gradeName } from "@/lib/fitness/rpg/grade";

/**
 * L'affiche de record partagée. Ce test existe parce que, du 31/07/2026 à la remise en état, cette
 * affiche a circulé avec un montage de diagnostic iOS (deux <img> bruts sur fond vert, dont un chargé
 * depuis un domaine tiers, et un panneau de mesures) à la place de l'illustration officielle — et
 * qu'aucun test ne regardait ce qu'elle contient.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shareImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/share/shareImage", () => ({ shareImage }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ExerciseRankShareSheet } from "./ExerciseRankShareSheet";

const GUERRIER = RANK_TIERS.find((tier) => tier.key === "guerrier")!;
const RANK: RankState = {
  tierIndex: 6,
  rank: GUERRIER,
  levelInRank: 2,
  romanLevel: "II",
  fullName: "Guerrier II",
  xp: 40,
  currentTierXp: 40,
  nextTierXp: 100,
  xpToNext: 60,
  progress: 0.4,
  isMax: false,
};
const BEST = { tonnage: 4800, weight: 120, reps: 5, oneRM: 140 };

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

beforeEach(() => {
  shareImage.mockReset().mockResolvedValue("shared");
  onClose.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ExerciseRankShareSheet exerciseName="Squat" rank={RANK} best={BEST} onClose={onClose} />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const body = () => document.body;
const buttonByText = (label: string) =>
  [...body().querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label),
  ) as HTMLButtonElement;
const click = async (button: HTMLButtonElement) =>
  act(async () => {
    button.click();
  });

describe("ExerciseRankShareSheet — ce que contient l'affiche", () => {
  it("l'illustration OFFICIELLE du rang, et aucun montage de diagnostic", () => {
    expect(body().querySelector('img[alt="Illustration du rang Guerrier"]')).not.toBeNull();
    expect(body().querySelectorAll("img")).toHaveLength(1);
    expect(body().innerHTML).not.toMatch(/placehold\.co|colosse\.webp|DEBUG|lime/i);
    expect(body().textContent).not.toMatch(/\(brut\)|contrôle externe|naturalWidth/i);
  });

  it("le nom de l'exercice, le grade et le record, tels quels", () => {
    const text = body().textContent ?? "";
    expect(text).toContain("Squat");
    expect(text).toContain(gradeName("guerrier", 2));
    expect(text).toContain("120");
    expect(text).toContain("Record battu");
  });
});

describe("ExerciseRankShareSheet — le partage", () => {
  it("la carte capturée est signée « Cortex » et porte l'illustration", async () => {
    await click(buttonByText("Partager"));
    expect(shareImage).toHaveBeenCalledTimes(1);
    const node = shareImage.mock.calls[0][0] as HTMLElement;
    expect(node.textContent).toContain("Cortex");
    expect(node.textContent).toContain("Squat");
    expect(node.querySelector("img")).not.toBeNull();
  });

  it("Partager : texte signé, fichier cortex-<rang>.png, cacheBust conservé", async () => {
    await click(buttonByText("Partager"));
    const grade = gradeName("guerrier", 2);
    expect(shareImage.mock.calls[0][1]).toEqual({
      title: `Guerrier — ${grade} — Squat`,
      text: `Rang Guerrier — ${grade} sur Cortex 💪`,
      filename: "cortex-guerrier.png",
      cacheBust: true,
      backgroundColor: "#050505",
    });
  });

  it("le bouton d'enregistrement n'ouvre jamais la feuille de partage", async () => {
    const download = [...body().querySelectorAll("button")].find(
      (b) => !b.textContent?.trim() && b.getAttribute("aria-label") !== "Fermer",
    ) as HTMLButtonElement;
    await click(download);
    expect(shareImage.mock.calls[0][1]).toMatchObject({ mode: "download", cacheBust: true });
  });

  it("Échap ferme l'affiche", () => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
