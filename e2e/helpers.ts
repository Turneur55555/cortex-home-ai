import { expect, type Page } from "@playwright/test";

/**
 * Identifiants d'un compte de test partagé entre les specs.
 * Surcharge possible via les variables d'env E2E_EMAIL / E2E_PASSWORD.
 * Sinon on génère un email unique par run (utilisé pour le test signup).
 */
export const SHARED_EMAIL =
  process.env.E2E_EMAIL ?? `e2e+${Date.now()}@icortex-test.local`;
export const SHARED_PASSWORD = process.env.E2E_PASSWORD ?? "Test1234!Strong";

export function uniqueEmail(prefix = "signup") {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@icortex-test.local`;
}

export async function gotoLogin(page: Page) {
  await page.goto("/login");
  await expect(page.getByTestId("auth-tab-login")).toBeVisible();
}

export async function signUp(page: Page, email: string, password: string) {
  await gotoLogin(page);
  await page.getByTestId("auth-tab-signup").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
}

export async function signIn(page: Page, email: string, password: string) {
  await gotoLogin(page);
  await page.getByTestId("auth-tab-login").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
}

/**
 * Connexion avec création automatique du compte si l'identifiant n'existe pas encore.
 * Attend la home (bottom nav visible).
 */
export async function ensureLoggedIn(
  page: Page,
  email = SHARED_EMAIL,
  password = SHARED_PASSWORD,
) {
  await signIn(page, email, password);
  // Si la connexion échoue, on tente une inscription
  const homeNav = page.getByTestId("nav-home");
  try {
    await homeNav.waitFor({ state: "visible", timeout: 5000 });
    return;
  } catch {
    await signUp(page, email, password);
    await homeNav.waitFor({ state: "visible", timeout: 15_000 });
  }
}
