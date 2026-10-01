// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WeeklyReport } from "@/lib/fitness/weeklyReport";

/**
 * La page d'une semaine : ce qu'elle AFFICHE vient de `buildWeeklyReport` (testée à
 * part). Ici : chaque bloc n'apparaît que si son fait existe, et rien n'est inventé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  value: { isLoading: false, report: null as unknown },
  asked: [] as string[],
}));

vi.mock("@/hooks/useWeekReport", () => ({
  useWeekReport: (weekStart: string) => {
    holder.asked.push(weekStart);
    return holder.value;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

// G28 : le bouton de partage lit l'XP du joueur (AuthProvider, react-query) — sans rapport avec ce
// que la page affiche ; il a son propre test (WeekShare.test.tsx).
vi.mock("./WeekShare", () => ({ WeekShare: () => <div data-testid="stub-WeekShare" /> }));

import { WeekReportPage } from "./WeekReportPage";

function makeReport(over: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    weekStart: "2026-09-21",
    weekEnd: "2026-09-27",
    weekNumber: 39,
    label: "Semaine 39 · 21 → 27 septembre",
    headline: "Ta meilleure semaine",
    sessions: 5,
    plannedSessions: 5,
    plannedDone: 5,
    sets: 68,
    volumeKg: 18420,
    minutes: 250,
    previousVolumeKg: 13640,
    volumeDeltaPercent: 35,
    records: [
      { key: "squat", name: "Squat", weight: 120, previousWeight: 115 },
      { key: "rowing", name: "Rowing barre", weight: 75, previousWeight: 72.5 },
    ],
    sentence: "Rythme tenu : 5 séances sur 5, et 2 records battus.",
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.value = { isLoading: false, report: null };
  holder.asked = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(report: WeeklyReport | null, opts: { weekStart?: string; isLoading?: boolean } = {}) {
  holder.value = { isLoading: opts.isLoading ?? false, report };
  act(() => root.render(<WeekReportPage weekStart={opts.weekStart ?? "2026-09-21"} />));
}

const text = () => container.textContent ?? "";
const region = (name: string) => container.querySelector(`[aria-label="${name}"]`);

describe("WeekReportPage — le partage (G28)", () => {
  it("un bilan existe : le bouton de partage est proposé", () => {
    show(makeReport());
    expect(container.querySelector('[data-testid="stub-WeekShare"]')).not.toBeNull();
  });

  it.each([
    ["semaine sans séance", () => show(null)],
    ["chargement", () => show(null, { isLoading: true })],
    ["semaine invalide", () => show(null, { weekStart: "n-importe-quoi" })],
  ])("%s : rien à partager, aucun bouton", (_name, render) => {
    render();
    expect(container.querySelector('[data-testid="stub-WeekShare"]')).toBeNull();
  });
});

describe("WeekReportPage — états", () => {
  it("pendant le chargement : un squelette, aucun chiffre", () => {
    show(null, { isLoading: true });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector("article")).toBeNull();
    expect(text()).not.toContain("Pas de bilan");
  });

  it("semaine sans séance : on le dit simplement, sans reproche ni célébration", () => {
    show(null);
    expect(text()).toContain("Pas de bilan pour cette semaine");
    expect(text()).toContain("Aucune séance de musculation terminée du 21 au 27 septembre.");
    expect(text()).not.toMatch(/dommage|manqué|objectif|bravo/i);
  });

  it("identifiant de semaine invalide : « n'existe pas », et le hook n'est jamais interrogé avec", () => {
    show(null, { weekStart: "n-importe-quoi" });
    expect(text()).toContain("Cette semaine n'existe pas.");
    expect(holder.asked).toEqual([""]);
  });

  it("un jour qui n'est pas un lundi n'est pas une semaine", () => {
    show(null, { weekStart: "2026-09-22" });
    expect(text()).toContain("Cette semaine n'existe pas.");
  });

  it("aucune date technique (ISO) exposée, même aux lecteurs d'écran", () => {
    show(makeReport());
    expect(text()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("toujours un retour vers « Mes semaines »", () => {
    show(null);
    expect(container.querySelector('a[href="/semaine"]')?.textContent).toContain("Mes semaines");
  });
});

describe("WeekReportPage — le bilan", () => {
  it("l'en-tête : la semaine et le titre", () => {
    show(makeReport());
    expect(text()).toContain("Semaine 39 · 21 → 27 septembre");
    expect(container.querySelector("h1")?.textContent).toBe("Ta meilleure semaine");
    expect(container.querySelector("article")?.getAttribute("data-week")).toBe("2026-09-21");
  });

  it("les chiffres sont DANS le DOM, jamais un « 0 » en attente d'animation", () => {
    show(makeReport());
    expect(text()).toContain("5/ 5 prévues");
    expect(text()).toContain("18 420");
    expect(text()).toContain("68");
    expect(text()).toContain("4 h 10");
    expect(text()).not.toMatch(/(^|\D)0(\D|$)/); // aucun zéro isolé
  });

  it("sans plan vérifiable : « 5 » seul, jamais un « prévues » inventé", () => {
    show(makeReport({ plannedSessions: null, plannedDone: null }));
    expect(text()).not.toContain("prévues");
  });

  it("temps inconnu : pas de tuile « Temps » (jamais « 0 min »)", () => {
    show(makeReport({ minutes: null }));
    expect(text()).not.toContain("Temps");
    expect(text()).not.toContain("min");
  });

  it("aucune charge (poids de corps) : le volume est « — », pas « 0 kg »", () => {
    show(makeReport({ volumeKg: 0, previousVolumeKg: null, volumeDeltaPercent: null }));
    expect(text()).not.toMatch(/(^|\D)0\s?kg/); // « 120 kg » (un record) ne compte pas
    expect(container.querySelector("article")?.textContent).toContain("—");
  });
});

describe("WeekReportPage — la comparaison de volume", () => {
  it("une hausse : « +35 % », en vert", () => {
    show(makeReport());
    const compare = region("Volume comparé à la semaine précédente");
    expect(compare?.textContent).toContain("13 640 kg");
    expect(compare?.textContent).toContain("18 420 kg");
    const delta = Array.from(compare!.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("%"),
    );
    expect(delta?.textContent).toBe("+35 %");
    expect(delta?.className).toContain("text-success");
  });

  it("une baisse : « −20 % », sobre (jamais en rouge) — un fait, pas un reproche", () => {
    show(makeReport({ previousVolumeKg: 20000, volumeKg: 16000, volumeDeltaPercent: -20 }));
    const delta = Array.from(
      region("Volume comparé à la semaine précédente")!.querySelectorAll("p"),
    ).find((p) => p.textContent?.includes("%"));
    expect(delta?.textContent).toBe("−20 %");
    expect(delta?.className).not.toMatch(/red|destructive|danger/);
    expect(delta?.className).toContain("text-muted-foreground");
  });

  it("pas de semaine précédente : la carte n'existe pas", () => {
    show(makeReport({ previousVolumeKg: null, volumeDeltaPercent: null }));
    expect(region("Volume comparé à la semaine précédente")).toBeNull();
  });

  it("la barre de la semaine la plus forte fait 100 %, l'autre est proportionnelle", () => {
    show(makeReport({ previousVolumeKg: 10000, volumeKg: 20000, volumeDeltaPercent: 100 }));
    const bars = Array.from(
      region("Volume comparé à la semaine précédente")!.querySelectorAll<HTMLElement>(
        "span.rounded-full",
      ),
    );
    expect(bars.map((bar) => bar.style.width)).toEqual(["50%", "100%"]);
  });
});

describe("WeekReportPage — les records", () => {
  it("la liste, avec la charge et l'écart au record précédent", () => {
    show(makeReport());
    const records = region("Records battus");
    expect(records?.textContent).toContain("2 records battus");
    expect(records?.textContent).toContain("Squat");
    expect(records?.textContent).toContain("120 kg");
    expect(records?.textContent).toContain("+5 kg");
    expect(records?.textContent).toContain("+2.5 kg");
  });

  it("un seul record : singulier", () => {
    show(
      makeReport({ records: [{ key: "squat", name: "Squat", weight: 120, previousWeight: 115 }] }),
    );
    expect(region("Records battus")?.textContent).toContain("1 record battu");
  });

  it("au-delà de 5 : les 5 premiers, puis « et N autres »", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      key: `k${i}`,
      name: `Exo ${i}`,
      weight: 50 + i,
      previousWeight: 40,
    }));
    show(makeReport({ records: many }));
    const records = region("Records battus")!;
    expect(records.querySelectorAll("li")).toHaveLength(5);
    expect(records.textContent).toContain("et 3 autres");
  });

  it("aucun record : la carte n'existe pas (on n'en invente pas)", () => {
    show(makeReport({ records: [] }));
    expect(region("Records battus")).toBeNull();
  });
});

describe("WeekReportPage — la phrase", () => {
  it("affichée quand elle existe", () => {
    show(makeReport());
    expect(text()).toContain("Rythme tenu : 5 séances sur 5, et 2 records battus.");
  });

  it("absente quand il n'y a rien de vrai à dire", () => {
    show(makeReport({ sentence: null }));
    expect(text()).not.toContain("Rythme tenu");
    expect(container.querySelectorAll("p.font-serif")).toHaveLength(0);
  });
});
