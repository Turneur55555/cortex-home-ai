import { describe, expect, it } from "vitest";
import { runSequentialBatch } from "./sequentialBatch";

describe("runSequentialBatch", () => {
  it("traite une pièce à la fois et continue après un échec", async () => {
    const order: string[] = [];
    let running = 0;
    const result = await runSequentialBatch(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      async ({ id }) => {
        running += 1;
        expect(running).toBe(1);
        order.push(id);
        await Promise.resolve();
        running -= 1;
        if (id === "b") throw new Error("détourage impossible");
      },
    );
    expect(order).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ total: 3, done: 2, failed: ["b"], currentId: null });
  });

  it("s'arrête proprement quand on le demande", async () => {
    let calls = 0;
    const result = await runSequentialBatch(
      [{ id: "a" }, { id: "b" }],
      async () => {
        calls += 1;
      },
      () => {},
      () => calls >= 1,
    );
    expect(calls).toBe(1);
    expect(result.done).toBe(1);
  });
});
