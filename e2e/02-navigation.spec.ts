import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Navigation principale", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("navigue entre les 5 modules via la bottom nav", async ({ page }) => {
    await page.getByTestId("nav-seances").click();
    await expect(page).toHaveURL(/\/seances/);

    await page.getByTestId("nav-corps").click();
    await expect(page).toHaveURL(/\/corps/);

    await page.getByTestId("nav-nutrition").click();
    await expect(page).toHaveURL(/\/nutrition/);

    await page.getByTestId("nav-profil").click();
    await expect(page).toHaveURL(/\/profil/);

    await page.getByTestId("nav-home").click();
    await expect(page).toHaveURL(/\/$/);
  });
});
