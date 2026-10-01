// @vitest-environment jsdom
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareSignature } from "@/components/share/ShareSignature";
import { ShareExportFrame, EXPORT_HEIGHT, EXPORT_WIDTH } from "@/components/share/ShareExportFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const RANK = { key: "guerrier", label: "Guerrier", grade: "Vétéran" } as const;

describe("ShareSignature — le pied de carte signé", () => {
  it("le mot-marque se lit « Cortex » (capitales par la typographie, pas par la valeur)", () => {
    act(() => root.render(<ShareSignature />));
    const mark = container.querySelector(".uppercase");
    expect(mark?.textContent).toBe("Cortex");
    expect(container.textContent).not.toMatch(/icortex/i);
  });

  it("avec un rang : mot-marque, « Rang · Grade » et médaillon tiré de l'illustration officielle", () => {
    act(() => root.render(<ShareSignature rank={RANK} />));
    expect(container.textContent).toContain("Cortex");
    expect(container.textContent).toContain("Guerrier · Vétéran");
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("alt")).toBe("Illustration du rang Guerrier");
  });

  it("le médaillon est découpé en cercle, avec un liseré par-dessus l'image", () => {
    act(() => root.render(<ShareSignature rank={RANK} />));
    const medal = container.querySelector("img")?.parentElement as HTMLElement;
    expect(medal.className).toContain("rounded-full");
    expect(medal.className).toContain("overflow-hidden");
    // Un liseré `inset` sur le conteneur passerait SOUS l'image : il doit être un calque à part.
    const ring = medal.querySelector("span[aria-hidden]") as HTMLElement;
    expect(ring).not.toBeNull();
    expect(ring.style.boxShadow).toContain("inset 0 0 0 1px");
  });

  it("sans rang : le mot-marque seul — jamais un médaillon ni un rang inventé", () => {
    act(() => root.render(<ShareSignature rank={null} />));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("Cortex");
  });

  it("aucune adresse dans la signature : la carte est identifiable, elle n'amène personne", () => {
    act(() => root.render(<ShareSignature rank={RANK} />));
    expect(container.textContent).not.toMatch(/https?:|www\.|\.app|\.com/i);
  });
});

describe("ShareExportFrame — le cadre capturé", () => {
  it("la signature est DANS le nœud capturé : une signature hors cadre ne serait jamais exportée", () => {
    const ref = createRef<HTMLDivElement>();
    act(() =>
      root.render(
        <ShareExportFrame exportRef={ref} rank={RANK}>
          <p data-testid="card">la carte</p>
        </ShareExportFrame>,
      ),
    );
    const node = ref.current as HTMLDivElement;
    expect(node).not.toBeNull();
    expect(node.querySelector('[data-testid="card"]')).not.toBeNull();
    expect(node.textContent).toContain("Cortex");
    expect(node.textContent).toContain("Guerrier · Vétéran");
  });

  it("hors écran, masqué des lecteurs d'écran, 540×960 (9:16)", () => {
    const ref = createRef<HTMLDivElement>();
    act(() =>
      root.render(
        <ShareExportFrame exportRef={ref}>
          <p>x</p>
        </ShareExportFrame>,
      ),
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.getAttribute("aria-hidden")).toBe("true");
    expect(outer.className).toContain("left-[-10000px]");
    expect(outer.className).toContain("pointer-events-none");
    expect(outer.style.width).toBe(`${EXPORT_WIDTH}px`);
    expect(outer.style.height).toBe(`${EXPORT_HEIGHT}px`);
    expect(EXPORT_WIDTH / EXPORT_HEIGHT).toBeCloseTo(9 / 16, 5);
  });

  it("sans rang : pied de carte au mot-marque seul", () => {
    const ref = createRef<HTMLDivElement>();
    act(() =>
      root.render(
        <ShareExportFrame exportRef={ref}>
          <p>x</p>
        </ShareExportFrame>,
      ),
    );
    expect((ref.current as HTMLElement).querySelector("img")).toBeNull();
    expect((ref.current as HTMLElement).textContent).toBe("xCortex");
  });
});
