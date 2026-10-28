import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Régression du 28/10/2026 : montée dans `#offline-root` (div DANS <body>), la racine du shell
// offline se retrouvait contenue dans le <body> qu'elle rend elle-même (route racine → singletons
// <html>/<body>). Tout portail vers `document.body` faisait alors boucler la remontée des
// événements React à l'infini : Nutrition figeait. La racine doit être montée sur `document`.
describe("shell offline — point de montage React", () => {
  const source = readFileSync(resolve(__dirname, "offline-client.tsx"), "utf8");

  it("monte la racine sur document, jamais sur un élément du body", () => {
    expect(source).toMatch(/createRoot\(document\)/);
    expect(source).not.toMatch(/getElementById\(/);
  });
});
