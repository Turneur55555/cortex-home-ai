import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Navigation principale", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("navigue entre les modules via la bottom nav", async ({ page }) => {
    await page.getByTestId("nav-stocks").click();
    await expect(page).toHaveURL(/\/stocks/);

    await page.getByTestId("nav-fitness").click();
    await expect(page).toHaveURL(/\/fitness/);

    await page.getByTestId("nav-documents").click();
    await expect(page).toHaveURL(/\/documents/);

    await page.getByTestId("nav-profil").click();
    await expect(page).toHaveURL(/\/profil/);

    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(/\/$/);
  });
});
