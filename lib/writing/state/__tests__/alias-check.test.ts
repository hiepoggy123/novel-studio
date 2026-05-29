import { describe, it, expect } from "vitest";

describe("vitest alias resolution", () => {
  it("resolves @/ to project root", async () => {
    const mod = await import("@/lib/writing/state/schemas");
    expect(mod).toBeDefined();
  });
});
