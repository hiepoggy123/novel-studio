import { describe, it, expect } from "vitest";
import {
  mergeMarkerBlock,
  extractMarkerBlock,
  stripMarkerBlock,
  buildWorldSyncBlock,
  buildCharacterSyncBlock,
  selectCharacterFacts,
  AUTO_SYNC_START,
  AUTO_SYNC_END,
} from "@/lib/writing/state/entity-sync";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

const baseSnapshot: StoryStateSnapshot = {
  lastAppliedChapter: 3,
  characterStates: [
    { name: "Lý Vô Kiếm", currentState: "bị thương nặng", location: "Hắc Phong Cốc", status: "trốn chạy" },
    { name: "Trần Đại", currentState: "" },
  ],
  worldFacts: "Thế giới kiếm hiệp, tu luyện chân khí.",
  openConflicts: ["Phe chính tà tranh đoạt bí kíp"],
  knownTruths: ["Bí kíp giấu trong Tàng Kinh Các"],
  knownFacts: [
    { subject: "Lý Vô Kiếm", predicate: "sở hữu", object: "kiếm Thanh Vân", sourceChapter: 2 },
    { subject: "lý vô kiếm", predicate: "biết", object: "bí mật sư phụ", sourceChapter: 3 },
    { subject: "Trần Đại", predicate: "phản bội", object: "môn phái", sourceChapter: 1 },
  ],
  chapterHashes: {},
  bootstrapComplete: true,
  updatedAt: new Date(),
};

describe("mergeMarkerBlock", () => {
  it("appends a wrapped block when none exists", () => {
    const result = mergeMarkerBlock(undefined, "nội dung mới");
    expect(result).toBe(`${AUTO_SYNC_START}\nnội dung mới\n${AUTO_SYNC_END}`);
  });

  it("preserves user prose before the block when appending", () => {
    const result = mergeMarkerBlock("Văn của user", "auto nội dung");
    expect(result.startsWith("Văn của user")).toBe(true);
    expect(result).toContain(AUTO_SYNC_START);
    expect(result).toContain("auto nội dung");
  });

  it("replaces only the marker block, leaving user prose intact", () => {
    const existing = `Đầu của user\n\n${AUTO_SYNC_START}\ncũ\n${AUTO_SYNC_END}\n\nCuối của user`;
    const result = mergeMarkerBlock(existing, "mới");
    expect(result).toContain("Đầu của user");
    expect(result).toContain("Cuối của user");
    expect(result).toContain("mới");
    expect(result).not.toContain("cũ");
  });

  it("removes the marker block when the new block is empty", () => {
    const existing = `User text\n\n${AUTO_SYNC_START}\ncũ\n${AUTO_SYNC_END}`;
    const result = mergeMarkerBlock(existing, "   ");
    expect(result).toBe("User text");
    expect(result).not.toContain(AUTO_SYNC_START);
  });

  it("is idempotent when re-syncing identical content", () => {
    const once = mergeMarkerBlock("user prose", "auto");
    const twice = mergeMarkerBlock(once, "auto");
    expect(twice).toBe(once);
  });

  it("does not append anything when existing is empty and block is empty", () => {
    expect(mergeMarkerBlock(undefined, "")).toBe("");
    expect(mergeMarkerBlock("", "  ")).toBe("");
  });
});

describe("extractMarkerBlock / stripMarkerBlock", () => {
  it("extractMarkerBlock returns the inner content of the block", () => {
    const text = `Văn user\n\n${AUTO_SYNC_START}\ndòng auto\n${AUTO_SYNC_END}`;
    expect(extractMarkerBlock(text)).toBe("dòng auto");
  });

  it("extractMarkerBlock returns empty when no block present", () => {
    expect(extractMarkerBlock("chỉ văn user")).toBe("");
    expect(extractMarkerBlock(undefined)).toBe("");
  });

  it("stripMarkerBlock removes the block, keeping user prose", () => {
    const text = `Đầu\n\n${AUTO_SYNC_START}\nauto\n${AUTO_SYNC_END}\n\nCuối`;
    const stripped = stripMarkerBlock(text);
    expect(stripped).toContain("Đầu");
    expect(stripped).toContain("Cuối");
    expect(stripped).not.toContain(AUTO_SYNC_START);
    expect(stripped).not.toContain("auto");
  });

  it("re-applying an AI rewrite preserves the existing sync block", () => {
    const current = `Hành trình cũ\n\n${AUTO_SYNC_START}\ntrạng thái pipeline\n${AUTO_SYNC_END}`;
    const block = extractMarkerBlock(current);
    const aiHuman = stripMarkerBlock("Hành trình mới do AI viết");
    const merged = mergeMarkerBlock(aiHuman, block);
    expect(merged).toContain("Hành trình mới do AI viết");
    expect(merged).not.toContain("Hành trình cũ");
    expect(merged).toContain("trạng thái pipeline");
    expect(merged).toContain(AUTO_SYNC_START);
  });
});

describe("buildWorldSyncBlock", () => {
  it("includes world facts, truths, and conflicts", () => {
    const block = buildWorldSyncBlock(baseSnapshot);
    expect(block).toContain("kiếm hiệp");
    expect(block).toContain("Bí kíp giấu trong Tàng Kinh Các");
    expect(block).toContain("Phe chính tà tranh đoạt bí kíp");
  });

  it("returns empty string when snapshot has no world content", () => {
    const empty = { ...baseSnapshot, worldFacts: "", knownTruths: [], openConflicts: [] };
    expect(buildWorldSyncBlock(empty)).toBe("");
  });
});

describe("selectCharacterFacts", () => {
  it("matches facts by subject case-insensitively", () => {
    const facts = selectCharacterFacts(baseSnapshot, "Lý Vô Kiếm");
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.object)).toContain("kiếm Thanh Vân");
    expect(facts.map((f) => f.object)).toContain("bí mật sư phụ");
  });
});

describe("buildCharacterSyncBlock", () => {
  it("includes state fields and related facts", () => {
    const state = baseSnapshot.characterStates[0];
    const block = buildCharacterSyncBlock(state, selectCharacterFacts(baseSnapshot, state.name));
    expect(block).toContain("bị thương nặng");
    expect(block).toContain("Hắc Phong Cốc");
    expect(block).toContain("trốn chạy");
    expect(block).toContain("kiếm Thanh Vân");
    expect(block).toContain("(ch.2)");
  });

  it("returns empty string for a character with no state and no facts", () => {
    const block = buildCharacterSyncBlock(
      { name: "Vô Danh", currentState: "" },
      [],
    );
    expect(block).toBe("");
  });
});
