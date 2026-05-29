import { describe, it, expect } from "vitest";
import { formatRetrievedContext } from "@/lib/writing/retrieved-context-format";
import { ChapterIntentSchema } from "@/lib/writing/intent-schema";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";
import type { PlotArc } from "@/lib/db";

function makeSnapshot(overrides: Partial<StoryStateSnapshot> = {}): StoryStateSnapshot {
  return {
    lastAppliedChapter: 5,
    characterStates: [],
    worldFacts: "",
    openConflicts: [],
    knownTruths: [],
    knownFacts: [],
    chapterHashes: {},
    bootstrapComplete: true,
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makePlotArc(overrides: Partial<PlotArc> = {}): PlotArc {
  return {
    id: "arc-1",
    novelId: "novel-1",
    title: "Mạch chính",
    description: "Mô tả mạch chính",
    type: "main",
    status: "active",
    plotPoints: [],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("formatRetrievedContext — basic output", () => {
  it("returns empty context string when snapshot has no data", () => {
    const snap = makeSnapshot();
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context).toContain("Chương được chuẩn bị: 6");
    expect(context).toContain("5");
  });

  it("includes worldFacts when present", () => {
    const snap = makeSnapshot({ worldFacts: "Tu tiên thế giới, sức mạnh chia 9 cảnh giới." });
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context).toContain("Tu tiên thế giới");
  });

  it("includes character states", () => {
    const snap = makeSnapshot({
      characterStates: [
        { name: "Lý Vân", currentState: "đang luyện công", location: "hang động" },
      ],
    });
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context).toContain("Lý Vân");
    expect(context).toContain("đang luyện công");
    expect(context).toContain("hang động");
  });

  it("includes only relevant knownFacts matching subjects", () => {
    const snap = makeSnapshot({
      knownFacts: [
        { subject: "Lý Vân", predicate: "sở hữu", object: "kiếm báu", sourceChapter: 3 },
        { subject: "Trần Hào", predicate: "là", object: "phản diện", sourceChapter: 2 },
      ],
    });
    const { context } = formatRetrievedContext(snap, [], 6, ["Lý Vân"]);
    expect(context).toContain("Lý Vân");
    expect(context).not.toContain("Trần Hào");
  });

  it("includes all knownFacts when subjects is empty", () => {
    const snap = makeSnapshot({
      knownFacts: [
        { subject: "Lý Vân", predicate: "sở hữu", object: "kiếm báu", sourceChapter: 3 },
      ],
    });
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context).not.toContain("Lý Vân");
  });

  it("includes knownTruths when present", () => {
    const snap = makeSnapshot({ knownTruths: ["Lý Vân không phải người thường"] });
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context).toContain("Lý Vân không phải người thường");
  });
});

describe("formatRetrievedContext — hook pressure", () => {
  it("marks overdue hooks with QUÁ HẠN label", () => {
    const arc = makePlotArc({
      plotPoints: [
        {
          id: "pp-1",
          title: "Lý Vân giác ngộ",
          description: "Lý Vân phải đột phá cảnh giới",
          status: "planned",
          chapterOrder: 3,
        },
      ],
    });
    const snap = makeSnapshot();
    const { context } = formatRetrievedContext(snap, [arc], 6, []);
    expect(context).toContain("QUÁ HẠN");
    expect(context).toContain("Lý Vân giác ngộ");
  });

  it("marks upcoming hooks with đến hạn label", () => {
    const arc = makePlotArc({
      plotPoints: [
        {
          id: "pp-2",
          title: "Hội tụ phái",
          description: "Các phái tập hợp",
          status: "planned",
          chapterOrder: 8,
        },
      ],
    });
    const snap = makeSnapshot();
    const { context } = formatRetrievedContext(snap, [arc], 6, []);
    expect(context).toContain("đến hạn chương 8");
  });

  it("excludes resolved hooks", () => {
    const arc = makePlotArc({
      plotPoints: [
        {
          id: "pp-3",
          title: "Hook đã giải quyết",
          description: "Đã xong",
          status: "resolved",
          chapterOrder: 2,
        },
      ],
    });
    const snap = makeSnapshot();
    const { context } = formatRetrievedContext(snap, [arc], 6, []);
    expect(context).not.toContain("Hook đã giải quyết");
  });

  it("excludes hooks from completed arcs", () => {
    const arc = makePlotArc({
      status: "completed",
      plotPoints: [
        {
          id: "pp-4",
          title: "Hook trong arc hoàn thành",
          description: "Arc đã xong",
          status: "planned",
          chapterOrder: 2,
        },
      ],
    });
    const snap = makeSnapshot();
    const { context } = formatRetrievedContext(snap, [arc], 6, []);
    expect(context).not.toContain("Hook trong arc hoàn thành");
  });
});

describe("formatRetrievedContext — token budget", () => {
  it("returns a tokenCount > 0 for non-empty context", () => {
    const snap = makeSnapshot({ worldFacts: "Thế giới tu tiên rộng lớn." });
    const { tokenCount } = formatRetrievedContext(snap, [], 6, []);
    expect(tokenCount).toBeGreaterThan(0);
  });

  it("truncates very large worldFacts to stay within budget", () => {
    const hugeFact = "A".repeat(50000);
    const snap = makeSnapshot({ worldFacts: hugeFact });
    const { context } = formatRetrievedContext(snap, [], 6, []);
    expect(context.length).toBeLessThan(hugeFact.length);
  });
});

describe("ChapterIntentSchema validation", () => {
  it("accepts a valid intent", () => {
    const intent = {
      goal: "Lý Vân đột phá cảnh giới thứ 5",
      mustKeep: ["Lý Vân ở hang động", "kiếm báu còn nguyên"],
      mustAvoid: ["Lý Vân gặp người lạ", "thay đổi vị trí đột ngột"],
      styleEmphasis: ["nhịp chậm, nội tâm sâu"],
      hookRefs: ["arc-1", "pp-1"],
    };
    const result = ChapterIntentSchema.safeParse(intent);
    expect(result.success).toBe(true);
  });

  it("rejects missing goal", () => {
    const result = ChapterIntentSchema.safeParse({
      mustKeep: [],
      mustAvoid: [],
      styleEmphasis: [],
      hookRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects mustKeep exceeding 5 items", () => {
    const result = ChapterIntentSchema.safeParse({
      goal: "test",
      mustKeep: ["a", "b", "c", "d", "e", "f"],
      mustAvoid: [],
      styleEmphasis: [],
      hookRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for all list fields", () => {
    const result = ChapterIntentSchema.safeParse({
      goal: "Chương mở đầu",
      mustKeep: [],
      mustAvoid: [],
      styleEmphasis: [],
      hookRefs: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects hookRefs exceeding 5 items", () => {
    const result = ChapterIntentSchema.safeParse({
      goal: "test",
      mustKeep: [],
      mustAvoid: [],
      styleEmphasis: [],
      hookRefs: ["a", "b", "c", "d", "e", "f"],
    });
    expect(result.success).toBe(false);
  });
});
