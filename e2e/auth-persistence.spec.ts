import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Persistance de session", () => {
  test("conserve la session après reload, nouveau contexte et multi-onglets", async ({ page, context, browser }) => {
    await ensureLoggedIn(page);
    await expect(page.getByTestId("nav-home")).toBeVisible();

    const storageState = await context.storageState();
    const authEntries = storageState.origins.flatMap((origin) =>
      origin.localStorage.filter((entry) => entry.name.startsWith("sb-") && entry.name.endsWith("-auth-token")),
    );
    expect(authEntries.length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId("nav-home")).toBeVisible();

    const secondTab = await context.newPage();
    await secondTab.goto("/");
    await expect(secondTab.getByTestId("nav-home")).toBeVisible();
    await secondTab.close();

    const restoredContext = await browser.newContext({ storageState });
    const restoredPage = await restoredContext.newPage();
    await restoredPage.goto("/");
    await expect(restoredPage.getByTestId("nav-home")).toBeVisible();
    await restoredContext.close();
  });
});