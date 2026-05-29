import { describe, it, expect } from "vitest";
import { concatActiveScenes, buildContentHash } from "@/lib/writing/read-chapter-text";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

function makeSnapshot(chapterHashes: Record<string, string> = {}): StoryStateSnapshot {
  return {
    lastAppliedChapter: 0,
    characterStates: [],
    worldFacts: "",
    openConflicts: [],
    knownTruths: [],
    knownFacts: [],
    chapterHashes,
    bootstrapComplete: false,
    updatedAt: new Date("2024-01-01"),
  };
}

function shouldResync(
  snapshot: StoryStateSnapshot,
  chapterOrder: number,
  currentScenes: Array<{ id: string; content: string; order: number }>,
): boolean {
  const storedHash = snapshot.chapterHashes[String(chapterOrder)];
  if (!storedHash) return true;
  const { contentHash } = concatActiveScenes(currentScenes);
  return storedHash !== contentHash;
}

describe("resync hash-diff decision", () => {
  it("no stored hash → should resync", () => {
    const snap = makeSnapshot({});
    const scenes = [{ id: "s1", content: "text", order: 1 }];
    expect(shouldResync(snap, 1, scenes)).toBe(true);
  });

  it("hash matches → skip resync", () => {
    const scenes = [{ id: "s1", content: "unchanged", order: 1 }];
    const { contentHash } = concatActiveScenes(scenes);
    const snap = makeSnapshot({ "1": contentHash });
    expect(shouldResync(snap, 1, scenes)).toBe(false);
  });

  it("hash differs after user edit → should resync", () => {
    const original = [{ id: "s1", content: "original prose", order: 1 }];
    const { contentHash } = concatActiveScenes(original);
    const snap = makeSnapshot({ "1": contentHash });

    const edited = [{ id: "s1", content: "edited by user", order: 1 }];
    expect(shouldResync(snap, 1, edited)).toBe(true);
  });

  it("hash for different chapter does not affect current chapter check", () => {
    const scenes = [{ id: "s1", content: "ch2 text", order: 1 }];
    const { contentHash } = concatActiveScenes(scenes);
    const snap = makeSnapshot({ "2": contentHash });
    expect(shouldResync(snap, 1, scenes)).toBe(true);
  });

  it("multi-scene chapter: hash covers all scenes concatenated", () => {
    const scenes = [
      { id: "s1", content: "scene one", order: 1 },
      { id: "s2", content: "scene two", order: 2 },
    ];
    const { contentHash } = concatActiveScenes(scenes);
    const snap = makeSnapshot({ "3": contentHash });
    expect(shouldResync(snap, 3, scenes)).toBe(false);

    const editedSecond = [
      { id: "s1", content: "scene one", order: 1 },
      { id: "s2", content: "scene two EDITED", order: 2 },
    ];
    expect(shouldResync(snap, 3, editedSecond)).toBe(true);
  });

  it("reordered scenes produce different hash even with same content", () => {
    const original = [
      { id: "s1", content: "A", order: 1 },
      { id: "s2", content: "B", order: 2 },
    ];
    const reordered = [
      { id: "s1", content: "A", order: 2 },
      { id: "s2", content: "B", order: 1 },
    ];
    const { contentHash: h1 } = concatActiveScenes(original);
    const { contentHash: h2 } = concatActiveScenes(reordered);
    expect(h1).not.toBe(h2);
  });

  it("buildContentHash is deterministic across calls", () => {
    const text = "Lý Vô Kiếm bước vào rừng tối.";
    expect(buildContentHash(text)).toBe(buildContentHash(text));
  });
});
