import { describe, it, expect } from "vitest";
import { buildScanLedger, type LedgerChapterInput } from "@/lib/continuity/scan-ledger";
import type { StateDelta } from "@/lib/writing/state/schemas";

function makeDelta(chapter: number, overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    chapter,
    factOps: [],
    hookOps: [],
    characterStatePatches: [],
    chapterSummary: "",
    knownTruthsAdded: [],
    ...overrides,
  };
}

function chapter(
  chapterOrder: number,
  text: string,
  delta: StateDelta,
): LedgerChapterInput {
  return { chapterOrder, chapterId: `c${chapterOrder}`, text, delta };
}

describe("buildScanLedger", () => {
  it("records each observed fact with its source chapter (so conflicts are detectable later)", () => {
    // Lâm's eyes are blue in ch3, black in ch9 — both adds must survive with
    // their source chapters; the ledger does not compact them away.
    const ledger = buildScanLedger([
      chapter(
        3,
        "...",
        makeDelta(3, {
          factOps: [{ op: "add", subject: "Lâm", predicate: "màu mắt", object: "xanh" }],
        }),
      ),
      chapter(
        9,
        "...",
        makeDelta(9, {
          factOps: [{ op: "add", subject: "Lâm", predicate: "màu mắt", object: "đen" }],
        }),
      ),
    ]);

    const eyeFacts = ledger.facts.filter(
      (f) => f.subject === "Lâm" && f.predicate === "màu mắt",
    );
    expect(eyeFacts).toHaveLength(2);
    expect(eyeFacts.map((f) => f.chapterOrder).sort((a, b) => a - b)).toEqual([3, 9]);
    expect(new Set(eyeFacts.map((f) => f.object))).toEqual(new Set(["xanh", "đen"]));
  });

  it("ignores remove fact ops (only adds enter the ledger)", () => {
    const ledger = buildScanLedger([
      chapter(
        1,
        "...",
        makeDelta(1, {
          factOps: [{ op: "remove", subject: "Lâm", predicate: "màu mắt", object: "xanh" }],
        }),
      ),
    ]);
    expect(ledger.facts).toHaveLength(0);
  });

  it("tracks conflict open / advance / resolve from hook ops", () => {
    const ledger = buildScanLedger([
      chapter(
        2,
        "...",
        makeDelta(2, {
          hookOps: [{ op: "add", plotArcId: "arc1", title: "Mối thù họ Lâm" }],
        }),
      ),
      chapter(
        7,
        "...",
        makeDelta(7, {
          hookOps: [{ op: "advance", plotArcId: "arc1", title: "Mối thù họ Lâm" }],
        }),
      ),
      chapter(
        2,
        "...",
        makeDelta(2, {
          hookOps: [{ op: "add", plotArcId: "arc2", title: "Bí mật thân thế" }],
        }),
      ),
      chapter(
        5,
        "...",
        makeDelta(5, {
          hookOps: [{ op: "resolve", plotArcId: "arc2", title: "Bí mật thân thế" }],
        }),
      ),
    ]);

    expect(ledger.conflictFirstSeen.get("arc1|mối thù họ lâm")).toBe(2);
    expect(ledger.conflictLastSeen.get("arc1|mối thù họ lâm")).toBe(7);
    expect(ledger.resolvedConflicts.has("arc1|mối thù họ lâm")).toBe(false);
    expect(ledger.resolvedConflicts.has("arc2|bí mật thân thế")).toBe(true);
  });

  it("does not conflate two arcs that share a conflict title", () => {
    // Same title 'Báo thù' under different arcs must stay distinct conflicts,
    // each with its own first-seen chapter.
    const ledger = buildScanLedger([
      chapter(3, "...", makeDelta(3, { hookOps: [{ op: "add", plotArcId: "arcA", title: "Báo thù" }] })),
      chapter(8, "...", makeDelta(8, { hookOps: [{ op: "add", plotArcId: "arcB", title: "Báo thù" }] })),
    ]);
    expect(ledger.conflictFirstSeen.get("arcA|báo thù")).toBe(3);
    expect(ledger.conflictFirstSeen.get("arcB|báo thù")).toBe(8);
  });

  it("is independent of input chapter order (first/last-seen stay correct)", () => {
    const ledger = buildScanLedger([
      chapter(7, "...", makeDelta(7, { hookOps: [{ op: "advance", plotArcId: "arc1", title: "T" }] })),
      chapter(2, "...", makeDelta(2, { hookOps: [{ op: "add", plotArcId: "arc1", title: "T" }] })),
    ]);
    expect(ledger.conflictFirstSeen.get("arc1|t")).toBe(2);
    expect(ledger.conflictLastSeen.get("arc1|t")).toBe(7);
  });

  it("indexes character-name presence in chapter text (hit and miss)", () => {
    const ledger = buildScanLedger([
      chapter(
        4,
        "Hôm nay Lâm chết.",
        makeDelta(4, {
          characterStatePatches: [{ name: "Lâm", status: "chết" }],
        }),
      ),
      chapter(6, "Một ngày bình thường, không ai nhắc đến.", makeDelta(6)),
      chapter(8, "Lâm bất ngờ xuất hiện trở lại.", makeDelta(8)),
    ]);

    expect(ledger.charNameIndexByChapter.get(4)?.has("Lâm")).toBe(true);
    expect(ledger.charNameIndexByChapter.get(6)?.has("Lâm")).toBe(false);
    expect(ledger.charNameIndexByChapter.get(8)?.has("Lâm")).toBe(true);
  });

  it("computes maxChapterOrder and chapter id mapping", () => {
    const ledger = buildScanLedger([
      chapter(3, "a", makeDelta(3)),
      chapter(11, "b", makeDelta(11)),
    ]);
    expect(ledger.maxChapterOrder).toBe(11);
    expect(ledger.chapterIdByOrder.get(11)).toBe("c11");
  });
});
