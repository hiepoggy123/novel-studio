import { describe, it, expect } from "vitest";
import { StateDeltaSchema } from "@/lib/writing/state/schemas";
import { observerOutputSchema } from "@/lib/writing/observer-schema";

const validDelta = {
  chapter: 1,
  factOps: [{ op: "add", subject: "Lý", predicate: "sở hữu", object: "kiếm báu" }],
  hookOps: [],
  characterStatePatches: [{ name: "Lý", currentState: "bị thương nhẹ", location: "rừng" }],
  chapterSummary: "Lý gặp kẻ thù trong rừng và bị thương.",
  knownTruthsAdded: ["Lý không phải người thường"],
};

describe("observer jsonSchema structure", () => {
  it("has all required fields declared", () => {
    const schema = observerOutputSchema.jsonSchema as Record<string, unknown>;
    const required = schema.required as string[];
    expect(required).toContain("chapter");
    expect(required).toContain("factOps");
    expect(required).toContain("hookOps");
    expect(required).toContain("characterStatePatches");
    expect(required).toContain("chapterSummary");
    expect(required).toContain("knownTruthsAdded");
  });

  it("mirrors StateDeltaSchema required fields", () => {
    const jsonSchemaRequired = (observerOutputSchema.jsonSchema as Record<string, unknown>)
      .required as string[];
    const validResult = StateDeltaSchema.safeParse(validDelta);
    expect(validResult.success).toBe(true);
    if (validResult.success) {
      for (const field of jsonSchemaRequired) {
        expect(field in validResult.data).toBe(true);
      }
    }
  });
});

describe("StateDeltaSchema validates observer output shape", () => {
  it("accepts a well-formed delta", () => {
    const result = StateDeltaSchema.safeParse(validDelta);
    expect(result.success).toBe(true);
  });

  it("rejects missing chapter field", () => {
    const { chapter: _, ...noChapter } = validDelta;
    const result = StateDeltaSchema.safeParse(noChapter);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive chapter", () => {
    const result = StateDeltaSchema.safeParse({ ...validDelta, chapter: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid factOp op enum", () => {
    const bad = {
      ...validDelta,
      factOps: [{ op: "upsert", subject: "X", predicate: "Y", object: "Z" }],
    };
    const result = StateDeltaSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid hookOp op enum", () => {
    const bad = {
      ...validDelta,
      hookOps: [{ op: "delete", plotArcId: "arc-1" }],
    };
    const result = StateDeltaSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts hookOp with only required fields", () => {
    const result = StateDeltaSchema.safeParse({
      ...validDelta,
      hookOps: [{ op: "advance", plotArcId: "arc-1", plotPointId: "pp-1" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts characterStatePatch with only name", () => {
    const result = StateDeltaSchema.safeParse({
      ...validDelta,
      characterStatePatches: [{ name: "Trần" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing chapterSummary", () => {
    const { chapterSummary: _, ...noSummary } = validDelta;
    const result = StateDeltaSchema.safeParse(noSummary);
    expect(result.success).toBe(false);
  });
});
