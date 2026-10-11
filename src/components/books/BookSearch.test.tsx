// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookSearch } from "./BookSearch";

/**
 * Régression : BookSearch vit DANS le <form> de BookEditor. Quand c'était lui-même un <form>,
 * lancer une recherche (Entrée ou loupe) faisait remonter un submit au formulaire parent et
 * tentait d'enregistrer le livre (titre vide → erreur). Chercher ne doit JAMAIS soumettre le parent.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function mount(onParentSubmit: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  act(() => {
    root!.render(
      <QueryClientProvider client={qc}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onParentSubmit();
          }}
        >
          <BookSearch onPick={() => {}} />
        </form>
      </QueryClientProvider>,
    );
  });
  return host;
}

describe("BookSearch dans un formulaire parent", () => {
  it("n'est pas un <form> (pas de formulaire imbriqué)", () => {
    const el = mount(() => {});
    expect(el.querySelectorAll("form")).toHaveLength(1);
  });

  it("Entrée dans le champ lance la recherche sans soumettre le parent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const parentSubmit = vi.fn();
    const el = mount(parentSubmit);
    const input = el.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "dune");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(parentSubmit).not.toHaveBeenCalled();
  });

  it("le bouton loupe ne soumet pas le parent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }),
    );
    const parentSubmit = vi.fn();
    const el = mount(parentSubmit);
    const input = el.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "dune");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const btn = el.querySelector("button[aria-label='Rechercher']") as HTMLButtonElement;
    expect(btn.type).toBe("button");
    await act(async () => btn.click());
    expect(parentSubmit).not.toHaveBeenCalled();
  });
});
