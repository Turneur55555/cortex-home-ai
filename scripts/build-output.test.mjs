import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isLovableSandbox, resolvePublicDir } from "./build-output.mjs";

/**
 * Régression mesurée en production (octobre 2026) : `/sw.js` en 404 parce que
 * le Service Worker était écrit dans `.output/public` alors que Lovable publie
 * `dist/client`. Ces tests figent la correspondance avec le paquet Lovable.
 */
describe("resolvePublicDir", () => {
  it("vise .output/public hors du bac à sable Lovable (build local, CI)", () => {
    expect(resolvePublicDir({}, "/repo")).toBe("/repo/.output/public");
  });

  it("vise dist/client dans le bac à sable Lovable (site publié)", () => {
    expect(resolvePublicDir({ LOVABLE_SANDBOX: "1" }, "/repo")).toBe("/repo/dist/client");
    expect(resolvePublicDir({ DEV_SERVER__PROJECT_PATH: "/x" }, "/repo")).toBe("/repo/dist/client");
  });

  it("ne confond pas une valeur quelconque avec le bac à sable", () => {
    expect(isLovableSandbox({ LOVABLE_SANDBOX: "0" })).toBe(false);
  });

  it("reste aligné sur la détection et la sortie du paquet Lovable", () => {
    const require = createRequire(import.meta.url);
    const pkgEntry = require.resolve("@lovable.dev/vite-tanstack-config");
    const source = readFileSync(pkgEntry.replace(/index\.cjs$/, "index.js"), "utf8");
    // Mêmes variables d'environnement…
    expect(source).toContain('"LOVABLE_SANDBOX"');
    expect(source).toContain('"DEV_SERVER__PROJECT_PATH"');
    expect(source).toMatch(/LOVABLE_SANDBOX_ENV_VAR\] === "1"/);
    // …et même dossier publié en bac à sable.
    expect(source).toMatch(/publicDir:\s*"dist\/client"/);
  });
});
