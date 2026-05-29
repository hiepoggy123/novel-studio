import { describe, it, expect } from "vitest";
import { formatChapterIntent } from "@/lib/writing/intent-schema";
import type { ChapterIntent } from "@/lib/writing/intent-schema";

function makeIntent(overrides: Partial<ChapterIntent> = {}): ChapterIntent {
  return {
    goal: "",
    mustKeep: [],
    mustAvoid: [],
    styleEmphasis: [],
    hookRefs: [],
    ...overrides,
  };
}

describe("formatChapterIntent", () => {
  it("returns empty string for null/undefined intent", () => {
    expect(formatChapterIntent(null)).toBe("");
    expect(formatChapterIntent(undefined)).toBe("");
  });

  it("returns empty string when every field is empty", () => {
    expect(formatChapterIntent(makeIntent())).toBe("");
  });

  it("emits only the non-empty fields, in fixed order", () => {
    const block = formatChapterIntent(
      makeIntent({ goal: "Lý Vân đột phá", mustAvoid: ["lặp lại"] }),
    );
    expect(block).toContain("Mục tiêu: Lý Vân đột phá");
    expect(block).toContain("Cấm: lặp lại");
    expect(block).not.toContain("Bắt buộc giữ");
    expect(block).not.toContain("Phong cách");
    expect(block.startsWith("<chapter_intent")).toBe(true);
    expect(block.trimEnd().endsWith("</chapter_intent>")).toBe(true);
  });

  it("resolves matching hookRefs to titles and drops unmatched ids", () => {
    const block = formatChapterIntent(
      makeIntent({ goal: "g", hookRefs: ["pp-1", "arc-9"] }),
      [
        { id: "pp-1", title: "Bí mật thân thế" },
        { id: "pp-2", title: "Khác" },
      ],
    );
    expect(block).toContain("Hook cần xử lý: Bí mật thân thế");
    expect(block).not.toContain("arc-9");
  });

  it("omits the hook line entirely when no id resolves (drops phantom ids)", () => {
    const block = formatChapterIntent(
      makeIntent({ goal: "g", hookRefs: ["unknown-id"] }),
      [],
    );
    expect(block).not.toContain("Hook cần xử lý");
    expect(block).not.toContain("unknown-id");
    expect(block).toContain("Mục tiêu: g");
  });
});
