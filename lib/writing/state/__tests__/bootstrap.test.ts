import { describe, it, expect } from "vitest";
import { bootstrapStoryState } from "@/lib/writing/state/bootstrap";
import type { BootstrapInput } from "@/lib/writing/state/bootstrap";

const fullInput: BootstrapInput = {
  chapters: [
    { id: "ch-1", order: 1, summary: "Chương đầu", characterIds: [] },
    { id: "ch-2", order: 2, summary: "Chương hai", characterIds: ["c-1"] },
  ],
  characters: [
    { id: "c-1", name: "Lý Vô Kiếm", role: "main", characterArc: "Trở thành anh hùng" },
    { id: "c-2", name: "Trần Đại", role: "support" },
  ],
  plotArcs: [
    {
      id: "arc-1",
      title: "Arc chính",
      type: "main",
      status: "active",
      plotPoints: [
        { id: "pp-1", title: "Gặp địch", status: "planned", chapterOrder: 3 },
      ],
    },
  ],
  characterArcs: [
    {
      characterId: "c-1",
      trajectory: "Từ yếu đuối đến mạnh mẽ",
      developments: [
        { chapterOrder: 1, description: "Bắt đầu hành trình" },
      ],
    },
  ],
  analysisStatus: "completed",
  worldFacts: "Thế giới kiếm hiệp",
};

const emptyInput: BootstrapInput = {
  chapters: [],
  characters: [],
  plotArcs: [],
  characterArcs: [],
  analysisStatus: undefined,
  worldFacts: undefined,
};

describe("bootstrapStoryState", () => {
  it("returns a valid snapshot shape for full input", () => {
    const snap = bootstrapStoryState(fullInput);
    expect(snap.lastAppliedChapter).toBe(2);
    expect(Array.isArray(snap.knownFacts)).toBe(true);
    expect(Array.isArray(snap.characterStates)).toBe(true);
    expect(Array.isArray(snap.knownTruths)).toBe(true);
    expect(Array.isArray(snap.openConflicts)).toBe(true);
    expect(typeof snap.worldFacts).toBe("string");
    expect(typeof snap.bootstrapComplete).toBe("boolean");
    expect(snap.updatedAt).toBeInstanceOf(Date);
  });

  it("maps characterArc trajectory to knownFacts for known characters", () => {
    const snap = bootstrapStoryState(fullInput);
    const arcFact = snap.knownFacts.find(
      (f) => f.subject === "Lý Vô Kiếm" && f.predicate === "hành trình",
    );
    expect(arcFact).toBeDefined();
    expect(arcFact?.object).toContain("yếu đuối");
  });

  it("maps character developments to knownFacts", () => {
    const snap = bootstrapStoryState(fullInput);
    const devFact = snap.knownFacts.find(
      (f) => f.subject === "Lý Vô Kiếm" && f.predicate === "phát triển ch.1",
    );
    expect(devFact).toBeDefined();
  });

  it("sets worldFacts from input", () => {
    const snap = bootstrapStoryState(fullInput);
    expect(snap.worldFacts).toContain("kiếm hiệp");
  });

  it("uses lastAppliedChapter 0 when there are no existing chapters", () => {
    const snap = bootstrapStoryState(emptyInput);
    expect(snap.lastAppliedChapter).toBe(0);
  });

  it("returns incomplete:true for empty/absent analysis (never throws)", () => {
    let snap: ReturnType<typeof bootstrapStoryState> | undefined;
    expect(() => {
      snap = bootstrapStoryState(emptyInput);
    }).not.toThrow();
    expect(snap?.incomplete).toBe(true);
  });

  it("returns warnings array for empty input", () => {
    const snap = bootstrapStoryState(emptyInput);
    expect(Array.isArray(snap.warnings)).toBe(true);
    expect(snap.warnings!.length).toBeGreaterThan(0);
  });

  it("sets bootstrapComplete:true so pipeline gate opens immediately after bootstrap", () => {
    const snap = bootstrapStoryState(emptyInput);
    expect(snap.bootstrapComplete).toBe(true);
  });

  it("returns chapterHashes as empty record on bootstrap", () => {
    const snap = bootstrapStoryState(fullInput);
    expect(snap.chapterHashes).toEqual({});
  });

  it("does not throw on partial input (missing optional fields)", () => {
    const partial: BootstrapInput = {
      chapters: [{ id: "ch-1", order: 1 }],
      characters: [{ id: "c-1", name: "X", role: "main" }],
      plotArcs: [],
      characterArcs: [],
    };
    expect(() => bootstrapStoryState(partial)).not.toThrow();
  });
});
