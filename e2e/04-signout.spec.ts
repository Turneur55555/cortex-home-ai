import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Déconnexion", () => {
  test("déconnecte l'utilisateur et redirige vers /login", async ({ page }) => {
    await ensureLoggedIn(page);

    await page.getByTestId("nav-profil").click();
    await expect(page).toHaveURL(/\/profil/);

    await page.getByTestId("signout-btn").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByTestId("auth-submit")).toBeVisible();
  });
});
