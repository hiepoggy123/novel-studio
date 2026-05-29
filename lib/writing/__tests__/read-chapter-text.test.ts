import { describe, it, expect } from "vitest";
import { concatActiveScenes, buildContentHash } from "@/lib/writing/read-chapter-text";

describe("buildContentHash", () => {
  it("returns a non-empty string for any input", () => {
    expect(buildContentHash("hello")).toBeTruthy();
  });

  it("returns same hash for same input", () => {
    expect(buildContentHash("abc")).toBe(buildContentHash("abc"));
  });

  it("returns different hashes for different inputs", () => {
    expect(buildContentHash("abc")).not.toBe(buildContentHash("xyz"));
  });

  it("handles empty string", () => {
    expect(typeof buildContentHash("")).toBe("string");
  });
});

describe("concatActiveScenes", () => {
  it("concatenates scenes by order with double newline", () => {
    const scenes = [
      { id: "s2", content: "second", order: 2 },
      { id: "s1", content: "first", order: 1 },
    ];
    const { text } = concatActiveScenes(scenes);
    expect(text).toBe("first\n\nsecond");
  });

  it("returns sceneIds in order", () => {
    const scenes = [
      { id: "s3", content: "c", order: 3 },
      { id: "s1", content: "a", order: 1 },
      { id: "s2", content: "b", order: 2 },
    ];
    const { sceneIds } = concatActiveScenes(scenes);
    expect(sceneIds).toEqual(["s1", "s2", "s3"]);
  });

  it("single scene returns its content directly", () => {
    const scenes = [{ id: "s1", content: "only", order: 1 }];
    const { text } = concatActiveScenes(scenes);
    expect(text).toBe("only");
  });

  it("contentHash differs after content change", () => {
    const scenes = [{ id: "s1", content: "original", order: 1 }];
    const { contentHash: h1 } = concatActiveScenes(scenes);
    const { contentHash: h2 } = concatActiveScenes([{ id: "s1", content: "edited", order: 1 }]);
    expect(h1).not.toBe(h2);
  });

  it("contentHash reflects concatenation order", () => {
    const a = [
      { id: "s1", content: "A", order: 1 },
      { id: "s2", content: "B", order: 2 },
    ];
    const b = [
      { id: "s1", content: "B", order: 1 },
      { id: "s2", content: "A", order: 2 },
    ];
    const { contentHash: h1 } = concatActiveScenes(a);
    const { contentHash: h2 } = concatActiveScenes(b);
    expect(h1).not.toBe(h2);
  });
});
