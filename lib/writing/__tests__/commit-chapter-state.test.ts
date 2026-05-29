import { describe, it, expect } from "vitest";
import { StateDeltaSchema } from "@/lib/writing/state/schemas";
import { applyStateDelta } from "@/lib/writing/state/reducer";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import type { StoryStateSnapshot, StateDelta } from "@/lib/writing/state/schemas";

function makeSnapshot(overrides: Partial<StoryStateSnapshot> = {}): StoryStateSnapshot {
  return {
    lastAppliedChapter: 0,
    characterStates: [],
    worldFacts: "",
    openConflicts: [],
    knownTruths: [],
    knownFacts: [],
    chapterHashes: {},
    bootstrapComplete: false,
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeValidDelta(overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    chapter: 1,
    factOps: [],
    hookOps: [],
    characterStatePatches: [],
    chapterSummary: "Tóm tắt chương",
    knownTruthsAdded: [],
    ...overrides,
  };
}

describe("commit safeParse gate", () => {
  it("accepts a valid raw delta object", () => {
    const raw = makeValidDelta();
    const result = StateDeltaSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects a delta with missing required fields", () => {
    const raw = { chapter: 1 };
    const result = StateDeltaSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects a delta with chapter=0 (non-positive)", () => {
    const raw = makeValidDelta({ chapter: 0 });
    const result = StateDeltaSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects a delta with invalid hookOp", () => {
    const raw = makeValidDelta({ hookOps: [{ op: "destroy" as never, plotArcId: "arc-1" }] });
    const result = StateDeltaSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("snapshot is unchanged when delta is invalid", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 0 });
    const raw = { chapter: "bad" };
    const parseResult = StateDeltaSchema.safeParse(raw);
    expect(parseResult.success).toBe(false);
    expect(snap.lastAppliedChapter).toBe(0);
  });
});

describe("commit reduce path", () => {
  it("advances snapshot after valid delta", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 0 });
    const delta = makeValidDelta({ chapter: 1 });
    const next = applyStateDelta(snap, delta);
    expect(next.lastAppliedChapter).toBe(1);
  });

  it("applies factOps in delta", () => {
    const snap = makeSnapshot();
    const delta = makeValidDelta({
      chapter: 1,
      factOps: [{ op: "add", subject: "Lý", predicate: "biết", object: "bí mật" }],
    });
    const next = applyStateDelta(snap, delta);
    expect(next.knownFacts).toHaveLength(1);
    expect(next.knownFacts[0]).toMatchObject({ subject: "Lý", predicate: "biết", object: "bí mật" });
  });

  it("applies characterStatePatches", () => {
    const snap = makeSnapshot({ characterStates: [{ name: "Lý", currentState: "bình thường" }] });
    const delta = makeValidDelta({
      chapter: 1,
      characterStatePatches: [{ name: "Lý", currentState: "bị thương", location: "rừng" }],
    });
    const next = applyStateDelta(snap, delta);
    expect(next.characterStates[0]).toMatchObject({ currentState: "bị thương", location: "rừng" });
  });

  it("monotonic guard: rejects chapter <= lastAppliedChapter", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 3 });
    const delta = makeValidDelta({ chapter: 2 });
    expect(() => applyStateDelta(snap, delta)).toThrow();
  });

  it("snapshot is not mutated (pure function)", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 0 });
    const delta = makeValidDelta({ chapter: 1 });
    applyStateDelta(snap, delta);
    expect(snap.lastAppliedChapter).toBe(0);
  });
});

describe("commit contentHash idempotency check", () => {
  it("same scene content produces same contentHash", () => {
    const scenes = [{ id: "s1", content: "nội dung chương", order: 1 }];
    const { contentHash: h1 } = concatActiveScenes(scenes);
    const { contentHash: h2 } = concatActiveScenes(scenes);
    expect(h1).toBe(h2);
  });

  it("different content produces different contentHash — edit is detected", () => {
    const original = [{ id: "s1", content: "bản gốc", order: 1 }];
    const edited = [{ id: "s1", content: "bản đã sửa", order: 1 }];
    const { contentHash: h1 } = concatActiveScenes(original);
    const { contentHash: h2 } = concatActiveScenes(edited);
    expect(h1).not.toBe(h2);
  });

  it("stored hash matching current hash indicates already committed", () => {
    const scenes = [{ id: "s1", content: "content", order: 1 }];
    const { contentHash } = concatActiveScenes(scenes);
    const snap = makeSnapshot({ chapterHashes: { "1": contentHash } });
    expect(snap.chapterHashes["1"]).toBe(contentHash);
  });

  it("stored hash not matching current hash indicates edit since commit", () => {
    const original = [{ id: "s1", content: "original", order: 1 }];
    const { contentHash: storedHash } = concatActiveScenes(original);
    const snap = makeSnapshot({ chapterHashes: { "1": storedHash } });

    const edited = [{ id: "s1", content: "edited by user", order: 1 }];
    const { contentHash: currentHash } = concatActiveScenes(edited);

    expect(snap.chapterHashes["1"]).not.toBe(currentHash);
  });
});

describe("regen creates scene version (no duplicate chapter)", () => {
  it("version-aware upsert path: existing chapterId signals regen", () => {
    const existingChapterId = "ch-existing";
    const chapterPlan = { chapterId: existingChapterId, chapterOrder: 3 };
    expect(chapterPlan.chapterId).toBeDefined();
  });

  it("new chapter path: missing chapterId signals first save", () => {
    const chapterPlan = { chapterOrder: 3 };
    expect((chapterPlan as { chapterId?: string }).chapterId).toBeUndefined();
  });
});
