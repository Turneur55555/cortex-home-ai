// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookSearchPanel } from "./BookSearchPanel";
import type { BookSearchResult } from "@/lib/books/types";

/**
 * Recherche de l'ajout de livre :
 * - jamais de <form> (un submit imbriqué enregistrait un livre vide pendant la recherche) ;
 * - les tomes d'une saga sont distingués (« Tome 2 ») et transmis à la fiche.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const GOOGLE = {
  items: [
    { id: "1", volumeInfo: { title: "The Primal Hunter", authors: ["Zogarth"] } },
    { id: "2", volumeInfo: { title: "The Primal Hunter 2", authors: ["Zogarth"] } },
    { id: "3", volumeInfo: { title: "The Primal Hunter 3", authors: ["Zogarth"] } },
  ],
};

function mount(onPick: (r: BookSearchResult) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root!.render(
      <QueryClientProvider client={qc}>
        <BookSearchPanel onPick={onPick} onManual={() => {}} />
      </QueryClientProvider>,
    );
  });
  return host;
}

async function type(el: HTMLElement, value: string) {
  const input = el.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("BookSearchPanel", () => {
  it("ne contient aucun <form>", () => {
    expect(mount(() => {}).querySelectorAll("form")).toHaveLength(0);
  });

  it("cherche au fil de la frappe, affiche les tomes et les transmet à la fiche", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes("googleapis") ? GOOGLE : { docs: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onPick = vi.fn();
    const el = mount(onPick);

    await type(el, "primal hunter");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await vi.waitFor(() => expect(el.textContent).toContain("The Primal Hunter · Tome 2"));

    // Google ET Open Library sont interrogés.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("googleapis.com/books"))).toBe(true);
    expect(urls.some((u) => u.includes("openlibrary.org/search.json"))).toBe(true);

    const tome2 = [...el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Tome 2"),
    )!;
    await act(async () => tome2.click());
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ series: "The Primal Hunter", volume: 2 }),
    );
  });

  it("une source en panne n'empêche pas les résultats de l'autre", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("googleapis")
          ? { ok: false, status: 429, json: async () => ({}) }
          : {
              ok: true,
              json: async () => ({
                docs: [{ key: "/w/1", title: "Dune", author_name: ["Herbert"] }],
              }),
            },
      ),
    );
    const el = mount(() => {});
    await type(el, "dune");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await vi.waitFor(() => expect(el.textContent).toContain("Herbert"));
  });
});
