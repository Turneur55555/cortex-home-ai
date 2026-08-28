import { describe, expect, it } from "vitest";
import { createPendingIdResolver } from "./pendingOptimisticId";

/**
 * Régression du bug "tmp-*" (audit offline module Séance, 28/08/2026) :
 * `useUpdateExerciseSet`/`useDeleteExerciseSet` (use-fitness.ts) ignoraient
 * silencieusement toute action utilisateur sur une série créée offline dont
 * l'id optimiste (`tmp-*`) n'avait pas encore été remplacé par l'id réel
 * dans le cache React Query — perte de données sans aucune erreur visible.
 * `createPendingIdResolver` corrige ça en faisant ATTENDRE la résolution de
 * la création au lieu d'abandonner l'opération.
 */
describe("createPendingIdResolver — corrige le bug tmp-*", () => {
  it("un id qui ne porte pas le préfixe ressort inchangé, immédiatement", async () => {
    const resolver = createPendingIdResolver();
    await expect(resolver.resolve("real-id-123")).resolves.toBe("real-id-123");
  });

  it("un tmp-id enregistré attend settle(ok:true) avant de résoudre vers l'id réel", async () => {
    const resolver = createPendingIdResolver();
    resolver.register("tmp-abc");

    let resolved: string | null = null;
    const p = resolver.resolve("tmp-abc").then((id) => {
      resolved = id;
    });
    // Toujours en attente tant que settle() n'a pas été appelé.
    expect(resolved).toBeNull();

    resolver.settle("tmp-abc", { ok: true, id: "real-uuid-1" });
    await p;
    expect(resolved).toBe("real-uuid-1");
  });

  it("simule le scénario réel : modification IMMÉDIATE d'une série tout juste ajoutée offline — jamais ignorée", async () => {
    const resolver = createPendingIdResolver();

    // 1. onMutate d'un ADD : id optimiste assigné, enregistré aussitôt.
    const tmpId = "tmp-1";
    resolver.register(tmpId);

    // 2. L'utilisateur tape "modifier" sur cette série AVANT que le create()
    //    local (asynchrone) n'ait fini de résoudre — exactement la fenêtre de
    //    course du bug prod.
    const updateResolved = resolver.resolve(tmpId);

    // 3. Le create() local finit par résoudre (écriture IndexedDB) et
    //    settle() la promesse avec l'id réel généré par le repository.
    resolver.settle(tmpId, { ok: true, id: "real-set-id" });

    // 4. L'update, qui semblait bloqué, reçoit bien l'id réel — jamais de
    //    no-op silencieux, jamais de donnée utilisateur perdue.
    await expect(updateResolved).resolves.toBe("real-set-id");
  });

  it("propage l'échec de la création : un update/delete en attente échoue explicitement plutôt que de rester bloqué", async () => {
    const resolver = createPendingIdResolver();
    resolver.register("tmp-fail");
    const pending = resolver.resolve("tmp-fail");
    resolver.settle("tmp-fail", { ok: false, error: new Error("réseau indisponible") });
    await expect(pending).rejects.toThrow("réseau indisponible");
  });

  it("un tmp-id déjà résolu et retiré ne bloque pas un second appel — ressort inchangé", async () => {
    const resolver = createPendingIdResolver();
    resolver.register("tmp-once");
    resolver.settle("tmp-once", { ok: true, id: "real-1" });

    // Deuxième résolution du même tmp-id après coup (ex. deux updates
    // rapides successifs) : l'entrée a été nettoyée, mais on ne bloque
    // jamais indéfiniment sur une entrée qui n'existe plus.
    await expect(resolver.resolve("tmp-once")).resolves.toBe("tmp-once");
  });

  it("préserve l'ordre : le create() est TOUJOURS enfilé dans la sync queue avant qu'update()/delete() ne s'exécute", async () => {
    const resolver = createPendingIdResolver();
    const callOrder: string[] = [];

    resolver.register("tmp-order");
    const updatePromise = resolver.resolve("tmp-order").then(() => {
      callOrder.push("update");
    });

    // Le "create" simulé enfile son opération AVANT de settle() — reproduit
    // exerciseSetsRepo.create() (écrit + enqueueOperation) suivi de
    // setIdResolver.settle() dans use-fitness.ts.
    callOrder.push("create-enqueued");
    resolver.settle("tmp-order", { ok: true, id: "real-2" });

    await updatePromise;
    expect(callOrder).toEqual(["create-enqueued", "update"]);
  });
});
