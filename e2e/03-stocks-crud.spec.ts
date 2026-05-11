import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("CRUD Stocks", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
    await page.getByTestId("nav-stocks").click();
    await expect(page).toHaveURL(/\/stocks/);
  });

  test("ajoute puis supprime un item alimentation", async ({ page }) => {
    const itemName = `E2E Yaourt ${Date.now()}`;

    // Open add sheet
    await page.getByTestId("stocks-add-fab").click();
    await expect(page.getByTestId("stocks-add-form")).toBeVisible();

    // Fill name + expiration (+30 jours)
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    const expIso = exp.toISOString().slice(0, 10);

    await page.getByTestId("stocks-field-name").fill(itemName);
    await page.getByTestId("stocks-field-expiration").fill(expIso);

    await page.getByTestId("stocks-submit-add").click();

    // L'item apparaît dans la liste
    const row = page.locator(`[data-testid="stocks-item"][data-item-name="${itemName}"]`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Suppression
    await row.getByTestId("stocks-item-delete").click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  });
});
