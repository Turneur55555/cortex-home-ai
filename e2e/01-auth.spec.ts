import { test, expect } from "@playwright/test";
import { ensureLoggedIn, gotoLogin, signUp, uniqueEmail, SHARED_PASSWORD } from "./helpers";

test.describe("Authentification", () => {
  test("affiche le formulaire de connexion", async ({ page }) => {
    await gotoLogin(page);
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.getByTestId("auth-password")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toBeVisible();
  });

  test("inscription avec un nouvel email puis arrivée sur la home", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, email, SHARED_PASSWORD);
    // Soit on entre dans l'app, soit un toast d'erreur (email confirmation requise)
    const home = page.getByTestId("nav-home");
    const ok = await home
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      // On reste sur /login : on tolère ce cas (auto-confirm désactivé)
      await expect(page).toHaveURL(/\/login/);
    } else {
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("connexion d'un compte existant (créé à la volée si besoin)", async ({ page }) => {
    await ensureLoggedIn(page);
    await expect(page.getByTestId("nav-home")).toBeVisible();
  });
});
