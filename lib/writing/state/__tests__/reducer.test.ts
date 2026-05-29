import { describe, it, expect } from "vitest";
import { applyStateDelta } from "@/lib/writing/state/reducer";
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

function makeDelta(overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    chapter: 1,
    factOps: [],
    hookOps: [],
    characterStatePatches: [],
    chapterSummary: "summary",
    knownTruthsAdded: [],
    ...overrides,
  };
}

describe("applyStateDelta", () => {
  it("rejects delta.chapter equal to lastAppliedChapter (duplicate)", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 3 });
    const delta = makeDelta({ chapter: 3 });
    expect(() => applyStateDelta(snap, delta)).toThrow();
  });

  it("rejects delta.chapter less than lastAppliedChapter (backward)", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 5 });
    const delta = makeDelta({ chapter: 4 });
    expect(() => applyStateDelta(snap, delta)).toThrow();
  });

  it("advances lastAppliedChapter on valid delta", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 2 });
    const delta = makeDelta({ chapter: 3 });
    const result = applyStateDelta(snap, delta);
    expect(result.lastAppliedChapter).toBe(3);
  });

  it("adds a new known fact", () => {
    const snap = makeSnapshot();
    const delta = makeDelta({
      chapter: 1,
      factOps: [{ op: "add", subject: "Lý", predicate: "biết", object: "bí mật" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.knownFacts).toHaveLength(1);
    expect(result.knownFacts[0]).toMatchObject({ subject: "Lý", predicate: "biết", object: "bí mật", sourceChapter: 1 });
  });

  it("dedupes fact add by subject+predicate — second add overwrites", () => {
    const snap = makeSnapshot({
      knownFacts: [{ subject: "Lý", predicate: "biết", object: "cũ", sourceChapter: 0 }],
    });
    const delta = makeDelta({
      chapter: 1,
      factOps: [{ op: "add", subject: "Lý", predicate: "biết", object: "mới" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.knownFacts).toHaveLength(1);
    expect(result.knownFacts[0].object).toBe("mới");
  });

  it("removes a matching known fact", () => {
    const snap = makeSnapshot({
      knownFacts: [{ subject: "Lý", predicate: "sở hữu", object: "kiếm", sourceChapter: 0 }],
    });
    const delta = makeDelta({
      chapter: 1,
      factOps: [{ op: "remove", subject: "Lý", predicate: "sở hữu", object: "kiếm" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.knownFacts).toHaveLength(0);
  });

  it("remove on non-existent fact is a no-op", () => {
    const snap = makeSnapshot({
      knownFacts: [{ subject: "Lý", predicate: "sở hữu", object: "kiếm", sourceChapter: 0 }],
    });
    const delta = makeDelta({
      chapter: 1,
      factOps: [{ op: "remove", subject: "X", predicate: "Y", object: "Z" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.knownFacts).toHaveLength(1);
  });

  it("patches existing character state", () => {
    const snap = makeSnapshot({
      characterStates: [{ name: "Lý", currentState: "khỏe", location: "kinh đô" }],
    });
    const delta = makeDelta({
      chapter: 1,
      characterStatePatches: [{ name: "Lý", currentState: "bị thương", location: "rừng" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.characterStates).toHaveLength(1);
    expect(result.characterStates[0]).toMatchObject({ name: "Lý", currentState: "bị thương", location: "rừng" });
  });

  it("inserts new character state when not previously tracked", () => {
    const snap = makeSnapshot();
    const delta = makeDelta({
      chapter: 1,
      characterStatePatches: [{ name: "Trần", currentState: "xuất hiện" }],
    });
    const result = applyStateDelta(snap, delta);
    expect(result.characterStates).toHaveLength(1);
    expect(result.characterStates[0].name).toBe("Trần");
  });

  it("appends knownTruths without duplication", () => {
    const snap = makeSnapshot({ knownTruths: ["sự thật A"] });
    const delta = makeDelta({ chapter: 1, knownTruthsAdded: ["sự thật B", "sự thật A"] });
    const result = applyStateDelta(snap, delta);
    expect(result.knownTruths).toEqual(["sự thật A", "sự thật B"]);
  });

  it("returns a new snapshot object (immutable)", () => {
    const snap = makeSnapshot();
    const delta = makeDelta({ chapter: 1 });
    const result = applyStateDelta(snap, delta);
    expect(result).not.toBe(snap);
  });

  it("does not mutate the input snapshot", () => {
    const snap = makeSnapshot({
      knownFacts: [{ subject: "Lý", predicate: "biết", object: "bí mật", sourceChapter: 0 }],
      characterStates: [{ name: "Lý", currentState: "khỏe" }],
      knownTruths: ["sự thật A"],
    });
    const delta = makeDelta({
      chapter: 1,
      factOps: [{ op: "add", subject: "Trần", predicate: "sở hữu", object: "kiếm" }],
      characterStatePatches: [{ name: "Lý", currentState: "bị thương" }],
      knownTruthsAdded: ["sự thật B"],
    });
    applyStateDelta(snap, delta);
    expect(snap.knownFacts).toHaveLength(1);
    expect(snap.characterStates[0].currentState).toBe("khỏe");
    expect(snap.knownTruths).toEqual(["sự thật A"]);
    expect(snap.lastAppliedChapter).toBe(0);
  });

  it("same input produces deep-equal output (pure function)", () => {
    const snap = makeSnapshot({ lastAppliedChapter: 2 });
    const delta = makeDelta({
      chapter: 3,
      factOps: [{ op: "add", subject: "X", predicate: "Y", object: "Z" }],
      knownTruthsAdded: ["truth"],
    });
    const result1 = applyStateDelta(snap, delta);
    const result2 = applyStateDelta(snap, delta);
    expect(result1).toEqual(result2);
  });

  it("does not modify updatedAt (store layer is responsible for stamping)", () => {
    const fixedDate = new Date("2024-06-01");
    const snap = makeSnapshot({ updatedAt: fixedDate });
    const delta = makeDelta({ chapter: 1 });
    const result = applyStateDelta(snap, delta);
    expect(result.updatedAt).toBe(fixedDate);
  });
});
