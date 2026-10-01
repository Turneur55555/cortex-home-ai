// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { SeancesStageSwitch } from "./SeancesStageSwitch";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const links = () => Array.from(container.querySelectorAll("a"));

describe("SeancesStageSwitch", () => {
  it("deux étages, deux routes : Arène → /seances, Chroniques → /chroniques", () => {
    act(() => root.render(<SeancesStageSwitch active="arene" />));
    expect(links().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Arène", "/seances"],
      ["Chroniques", "/chroniques"],
    ]);
  });

  it("l'étage courant porte aria-current, l'autre jamais", () => {
    act(() => root.render(<SeancesStageSwitch active="chroniques" />));
    const [arene, chroniques] = links();
    expect(arene.getAttribute("aria-current")).toBeNull();
    expect(chroniques.getAttribute("aria-current")).toBe("page");
    act(() => root.render(<SeancesStageSwitch active="arene" />));
    expect(links()[0].getAttribute("aria-current")).toBe("page");
    expect(links()[1].getAttribute("aria-current")).toBeNull();
  });

  it("ce sont des liens (navigation), jamais des boutons", () => {
    act(() => root.render(<SeancesStageSwitch active="arene" />));
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Séances");
  });
});
