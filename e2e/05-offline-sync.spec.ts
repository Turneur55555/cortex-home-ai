import { test, expect, type Page } from "@playwright/test";
import { installSupabaseStub, STUB_EMAIL, STUB_PASSWORD } from "./supabase-stub";

/**
 * SCÉNARIO OFFLINE DE BOUT EN BOUT (audit MIN-05).
 *
 * Couvre le parcours réel du chantier offline, dans un vrai navigateur :
 *   1. application authentifiée ;
 *   2. passage hors ligne ;
 *   3. création d'un enregistrement syncable (un complément) ;
 *   4. vérification qu'AUCUNE écriture ne part pendant la coupure et que
 *      l'opération est bien en file (`syncQueue`, IndexedDB) ;
 *   5. retour réseau ;
 *   6. vérification que la synchronisation part toute seule et pousse
 *      l'upsert attendu, puis que la file se vide.
 *
 * Le backend Supabase est SIMULÉ (`./supabase-stub`) : ce test ne crée
 * aucune donnée réelle et ne touche jamais la base de production — c'est ce
 * qui le rend exécutable en CI, contrairement aux autres specs de ce dossier
 * (voir e2e/README.md). En contrepartie il ne valide rien côté serveur.
 */

const SUPPLEMENT_NAME = "Créatine (E2E offline)";

/** Lit la file de synchronisation persistée par le moteur offline. */
async function readSyncQueue(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<{ table: string; opType: string; status: string }[]>((resolve, reject) => {
        const request = indexedDB.open("cortex-offline");
        request.onerror = () => reject(new Error("cortex-offline introuvable"));
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("syncQueue")) return resolve([]);
          const all = db.transaction("syncQueue", "readonly").objectStore("syncQueue").getAll();
          all.onerror = () => reject(new Error("lecture syncQueue impossible"));
          all.onsuccess = () =>
            resolve(
              (all.result as { table: string; opType: string; status: string }[]).map((op) => ({
                table: op.table,
                opType: op.opType,
                status: op.status,
              })),
            );
        };
      }),
  );
}

test.describe("Synchronisation offline", () => {
  test("une création faite hors ligne est mise en file puis poussée au retour réseau", async ({
    page,
    context,
    baseURL,
  }) => {
    const stub = await installSupabaseStub(context, baseURL!);

    // ── 1. Application authentifiée (vrai formulaire, vrai client Supabase) ─
    await page.goto("/login");
    await page.getByTestId("auth-tab-login").click();
    await page.getByTestId("auth-email").fill(STUB_EMAIL);
    await page.getByTestId("auth-password").fill(STUB_PASSWORD);
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("nav-home")).toBeVisible();

    await page.goto("/supplements");
    const addButton = page.getByRole("button", { name: "Ajouter" });
    await expect(addButton).toBeVisible();

    const writesBefore = stub.writesTo("supplements").length;

    // ── 2. Passage hors ligne ────────────────────────────────────────────
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

    // ── 3. Création d'un enregistrement syncable ─────────────────────────
    await addButton.click();
    await page.getByPlaceholder("Ex : Créatine").fill(SUPPLEMENT_NAME);
    // Le bouton de soumission du formulaire porte le même libellé que celui
    // qui ouvre la feuille : on cible celui DANS le formulaire.
    await page.locator("form").getByRole("button", { name: "Ajouter" }).click();

    // ── 4. Rien ne part, l'opération est en file ─────────────────────────
    await expect
      .poll(async () => (await readSyncQueue(page)).filter((op) => op.table === "supplements"))
      .toEqual([{ table: "supplements", opType: "create", status: "pending" }]);
    expect(stub.writesTo("supplements")).toHaveLength(writesBefore);

    // ── 5. Retour réseau (événement `online` réel du navigateur) ─────────
    await context.setOffline(false);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);

    // ── 6. La synchronisation part seule et pousse l'upsert attendu ──────
    await expect
      .poll(() => stub.writesTo("supplements").length, { timeout: 30_000 })
      .toBeGreaterThan(writesBefore);

    const pushed = stub.writesTo("supplements").at(-1)!;
    expect(pushed.method).toBe("POST");
    // Upsert par id client : c'est ce qui rend un retry idempotent.
    expect(pushed.path).toContain("on_conflict=id");
    expect(pushed.body.name).toBe(SUPPLEMENT_NAME);
    expect(pushed.body.id).toEqual(expect.any(String));

    // La file se vide une fois l'opération confirmée.
    await expect
      .poll(
        async () => (await readSyncQueue(page)).filter((op) => op.table === "supplements").length,
        { timeout: 30_000 },
      )
      .toBe(0);

    // Aucune requête sortante imprévue : la production n'a jamais été jointe.
    expect(stub.blocked).toEqual([]);
  });
});
