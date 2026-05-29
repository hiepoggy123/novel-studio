import { describe, it, expect } from "vitest";
import {
  selectAppearanceChapters,
  APPEARANCE_CHAPTER_CAP,
} from "@/lib/writing/character-ai";
import { mapCandidateToRow } from "@/lib/writing/auto-generate";
import {
  characterAIObjectSchema,
  characterListSchema,
} from "@/lib/writing/character-ai-schema";
import type { Chapter } from "@/lib/db";

function makeChapter(order: number, characterIds?: string[]): Chapter {
  return {
    id: `ch-${order}`,
    novelId: "n-1",
    title: `Chương ${order}`,
    order,
    characterIds,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("selectAppearanceChapters", () => {
  it("returns only chapters linked to the character, sorted ascending", () => {
    const chapters = [
      makeChapter(1, ["c-1"]),
      makeChapter(2, ["c-2"]),
      makeChapter(3, ["c-1"]),
    ];
    const { chapters: sel, partial } = selectAppearanceChapters(chapters, "c-1");
    expect(sel.map((c) => c.order)).toEqual([1, 3]);
    expect(partial).toBe(false);
  });

  it("caps at 15 and keeps the most recent, marking partial", () => {
    const chapters = Array.from({ length: 20 }, (_, i) =>
      makeChapter(i + 1, ["c-1"]),
    );
    const { chapters: sel, partial } = selectAppearanceChapters(chapters, "c-1");
    expect(sel).toHaveLength(APPEARANCE_CHAPTER_CAP);
    expect(sel[0].order).toBe(6);
    expect(sel[sel.length - 1].order).toBe(20);
    expect(partial).toBe(true);
  });

  it("falls back to all chapters and sets partial when no characterIds match", () => {
    const chapters = [makeChapter(1), makeChapter(2)];
    const { chapters: sel, partial } = selectAppearanceChapters(chapters, "c-1");
    expect(sel.map((c) => c.order)).toEqual([1, 2]);
    expect(partial).toBe(true);
  });

  it("fallback also respects the cap and stays partial", () => {
    const chapters = Array.from({ length: 18 }, (_, i) => makeChapter(i + 1));
    const { chapters: sel, partial } = selectAppearanceChapters(chapters, "missing");
    expect(sel).toHaveLength(APPEARANCE_CHAPTER_CAP);
    expect(partial).toBe(true);
  });
});

describe("mapCandidateToRow", () => {
  it("maps every rich field and defaults role/description to empty string", () => {
    const now = new Date(123);
    const row = mapCandidateToRow(
      "n-1",
      {
        name: "Lý Vô Kiếm",
        appearance: "cao gầy",
        motivations: "trả thù",
      },
      now,
    );
    expect(row.novelId).toBe("n-1");
    expect(row.name).toBe("Lý Vô Kiếm");
    expect(row.role).toBe("");
    expect(row.description).toBe("");
    expect(row.appearance).toBe("cao gầy");
    expect(row.motivations).toBe("trả thù");
    expect(row.notes).toBe("");
    expect(row.createdAt).toBe(now);
    expect(row.updatedAt).toBe(now);
    expect(typeof row.id).toBe("string");
  });

  it("gives each row a distinct id", () => {
    const now = new Date(0);
    const a = mapCandidateToRow("n-1", { name: "A" }, now);
    const b = mapCandidateToRow("n-1", { name: "B" }, now);
    expect(a.id).not.toBe(b.id);
  });
});

describe("character AI schemas", () => {
  it("object schema requires only name", () => {
    const schema = characterAIObjectSchema.jsonSchema as {
      required: string[];
    };
    expect(schema.required).toEqual(["name"]);
  });

  it("list schema wraps characters array requiring name per item", () => {
    const schema = characterListSchema.jsonSchema as {
      required: string[];
      properties: {
        characters: { items: { required: string[] } };
      };
    };
    expect(schema.required).toEqual(["characters"]);
    expect(schema.properties.characters.items.required).toEqual(["name"]);
  });
});
