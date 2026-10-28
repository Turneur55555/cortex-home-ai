import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSW } from "workbox-build";
import { buildSwOptions, shellAssetUrls } from "./generate-sw.mjs";

/**
 * Couvre le bug diagnostiqué (Service Worker jamais servable hors ligne,
 * shell absent du précache) : génération réelle du précache/SW via
 * `workbox-build` contre une fixture minimale imitant `.output/public/`
 * (offline.html + assets), sans dépendre d'un vrai build complet (lent).
 */

let tmpDir;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function makeFixturePublicDir() {
  const dir = await mkdtemp(join(tmpdir(), "cortex-sw-test-"));
  await mkdir(join(dir, "assets"), { recursive: true });
  await mkdir(join(dir, "icons"), { recursive: true });
  await writeFile(
    join(dir, "offline.html"),
    `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/offline-ABC123.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/styles-XYZ789.css">
    </head><body><div id="offline-root"></div></body></html>`,
    "utf8",
  );
  await writeFile(join(dir, "assets", "offline-ABC123.js"), "console.log('shell');", "utf8");
  await writeFile(join(dir, "assets", "styles-XYZ789.css"), "body{margin:0}", "utf8");
  await writeFile(join(dir, "manifest.webmanifest"), "{}", "utf8");
  await writeFile(join(dir, "icons", "icon-192.png"), "fake-png", "utf8");
  await writeFile(join(dir, "icons", "icon-512.png"), "fake-png", "utf8");
  await writeFile(join(dir, "icons", "apple-touch-icon.png"), "fake-png", "utf8");
  return dir;
}

describe("shellAssetUrls", () => {
  it("extrait le shell + son JS + son CSS depuis offline.html", async () => {
    tmpDir = await makeFixturePublicDir();
    const urls = await shellAssetUrls(join(tmpDir, "offline.html"));
    expect(urls).toEqual(
      expect.arrayContaining([
        "/offline.html",
        "/assets/offline-ABC123.js",
        "/assets/styles-XYZ789.css",
      ]),
    );
    expect(urls).toHaveLength(3);
  });
});

describe("génération du précache (bug : le SW précachait 4 fichiers statiques et zéro JS/CSS applicatif)", () => {
  it("précache le shell offline + ses assets réels + le nécessaire PWA — rien d'autre", async () => {
    tmpDir = await makeFixturePublicDir();
    const shellUrls = await shellAssetUrls(join(tmpDir, "offline.html"));
    const swDest = join(tmpDir, "sw.js");

    const { count, warnings } = await generateSW(
      buildSwOptions({ publicDir: tmpDir, swDest, shellUrls, now: 1 }),
    );

    expect(warnings).toEqual([]);
    expect(count).toBe(7);

    const sw = await readFile(swDest, "utf8");
    for (const url of [
      "/offline.html",
      "/assets/offline-ABC123.js",
      "/assets/styles-XYZ789.css",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/apple-touch-icon.png",
    ]) {
      expect(sw).toContain(url);
    }
  });
});

describe("navigations : réseau d'abord, shell offline seulement en secours", () => {
  // Régression du 27/10/2026 : `navigateFallback` servait offline.html depuis le précache pour
  // TOUTE navigation, même en ligne — l'app réelle n'était plus jamais chargée, les modules
  // devenaient inaccessibles dès que sw.js a enfin été publié.
  it("n'utilise jamais navigateFallback (NavigationRoute qui court-circuite le réseau)", async () => {
    tmpDir = await makeFixturePublicDir();
    const shellUrls = await shellAssetUrls(join(tmpDir, "offline.html"));
    const options = buildSwOptions({ publicDir: tmpDir, swDest: "", shellUrls, now: 1 });
    expect(options.navigateFallback).toBeUndefined();
    const swDest = join(tmpDir, "sw.js");
    await generateSW({ ...options, swDest });
    const sw = await readFile(swDest, "utf8");
    expect(sw).not.toContain("createHandlerBoundToURL");
    expect(sw).toContain("NetworkOnly");
    expect(sw).toContain("PrecacheFallbackPlugin");
    expect(sw).toContain('fallbackURL:"/offline.html"');
  });

  it("la règle de navigation couvre les routes internes mais jamais /_serverFn ni /api", () => {
    const options = buildSwOptions({
      publicDir: "/unused",
      swDest: "/unused/sw.js",
      shellUrls: ["/offline.html"],
      now: 1,
    });
    const [nav] = options.runtimeCaching;
    expect(nav.handler).toBe("NetworkOnly");
    expect(nav.options.precacheFallback.fallbackURL).toBe("/offline.html");
    const match = (mode, path) =>
      nav.urlPattern({ request: { mode }, url: new URL(path, "https://x.test") });
    for (const route of ["/", "/nutrition", "/fitness", "/recipes"]) {
      expect(match("navigate", route)).toBe(true);
    }
    expect(match("navigate", "/_serverFn/getUser")).toBe(false);
    expect(match("navigate", "/api/anything")).toBe(false);
    expect(match("cors", "/nutrition")).toBe(false);
  });
});

describe("runtime caching préservé (comportement online inchangé)", () => {
  it("conserve NetworkFirst pour Supabase et CacheFirst pour les assets statiques", async () => {
    tmpDir = await makeFixturePublicDir();
    const shellUrls = await shellAssetUrls(join(tmpDir, "offline.html"));
    const swDest = join(tmpDir, "sw.js");
    await generateSW(buildSwOptions({ publicDir: tmpDir, swDest, shellUrls, now: 1 }));

    const sw = await readFile(swDest, "utf8");
    expect(sw).toContain("supabase-api");
    expect(sw).toContain("NetworkFirst");
    expect(sw).toContain("static-assets");
    expect(sw).toContain("CacheFirst");
  });
});
