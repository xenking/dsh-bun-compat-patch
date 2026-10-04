import { describe, expect, it } from "bun:test";
import { PersistentKernel } from "../src/kernel.ts";

describe("persistent code kernel", () => {
  it("executes TypeScript and maintains scope across runs", async () => {
    const kernel = new PersistentKernel();

    const res1 = await kernel.run("const x: number = 40; console.log('computed x'); return x + 2;");
    expect(res1.error).toBeUndefined();
    expect(res1.value).toBe(42);
    expect(res1.logs).toEqual(["computed x"]);

    // Set variable in kernel scope
    kernel.set("dataset", [1, 2, 3, 4, 5]);

    // Access in subsequent turn
    const res2 = await kernel.run("return dataset.reduce((a, b) => a + b, 0);");
    expect(res2.value).toBe(15);
  });

  it("handles runtime errors gracefully without crashing", async () => {
    const kernel = new PersistentKernel();
    const res = await kernel.run("throw new Error('boom');");
    expect(res.error).toBe("boom");
    expect(res.value).toBeUndefined();
  });
});
