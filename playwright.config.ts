import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 8080);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Environnements où Chromium est déjà installé hors du cache Playwright
// (images CI, conteneurs de dev) : permet de pointer le binaire existant
// plutôt que d'en télécharger un second. Non renseignée → Playwright utilise
// son cache habituel.
const CHROMIUM_EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 414, height: 896 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 414, height: 896 },
        ...(CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: CHROMIUM_EXECUTABLE } } : {}),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // `npm run dev` (et non `bun run dev`) : toute la CI installe les
        // dépendances avec `npm ci` et Node est le runtime documenté
        // (package.json → engines). En local, `bun run dev` reste
        // utilisable — `reuseExistingServer` réutilise un serveur déjà lancé.
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
