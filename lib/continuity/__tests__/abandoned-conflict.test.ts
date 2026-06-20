import { describe, it, expect } from "vitest";
import { detectAbandonedConflicts } from "@/lib/continuity/detectors/abandoned-conflict";
import type { ScanLedger, DetectorCtx } from "@/lib/continuity/schemas";

function makeLedger(overrides: Partial<ScanLedger> = {}): ScanLedger {
  return {
    facts: [],
    charPatches: [],
    conflictFirstSeen: new Map(),
    conflictLastSeen: new Map(),
    resolvedConflicts: new Set(),
    charNameIndexByChapter: new Map(),
    chapterIdByOrder: new Map(),
    maxChapterOrder: 0,
    ...overrides,
  };
}

const ctx: DetectorCtx = { novelId: "n1", staleGap: 25 };

describe("detectAbandonedConflicts", () => {
  it("flags an open conflict idle for >= staleGap chapters", () => {
    const ledger = makeLedger({
      conflictFirstSeen: new Map([["arc1|mối thù", 2]]),
      conflictLastSeen: new Map([["arc1|mối thù", 5]]),
      maxChapterOrder: 40,
    });
    const findings = detectAbandonedConflicts(ledger, ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("abandoned-conflict");
    expect(findings[0].severity).toBe("low");
  });

  it("does NOT flag a resolved conflict", () => {
    const ledger = makeLedger({
      conflictFirstSeen: new Map([["arc1|mối thù", 2]]),
      conflictLastSeen: new Map([["arc1|mối thù", 5]]),
      resolvedConflicts: new Set(["arc1|mối thù"]),
      maxChapterOrder: 40,
    });
    expect(detectAbandonedConflicts(ledger, ctx)).toHaveLength(0);
  });

  it("flags at exactly staleGap chapters of silence (boundary)", () => {
    const ledger = makeLedger({
      conflictFirstSeen: new Map([["arc1|x", 1]]),
      conflictLastSeen: new Map([["arc1|x", 15]]),
      maxChapterOrder: 40, // gap = 25 = staleGap
    });
    expect(detectAbandonedConflicts(ledger, ctx)).toHaveLength(1);
  });

  it("does NOT flag a conflict still active within staleGap", () => {
    const ledger = makeLedger({
      conflictFirstSeen: new Map([["arc1|mối thù", 2]]),
      conflictLastSeen: new Map([["arc1|mối thù", 38]]),
      maxChapterOrder: 40,
    });
    expect(detectAbandonedConflicts(ledger, ctx)).toHaveLength(0);
  });

  it("flags a stale PlotPoint via lastAdvancedChapter", () => {
    const ledger = makeLedger({ maxChapterOrder: 60 });
    const findings = detectAbandonedConflicts(ledger, {
      ...ctx,
      plotPoints: [{ title: "Bí mật thân thế", status: "in-progress", lastAdvancedChapter: 10 }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("Bí mật thân thế");
  });

  it("ignores resolved PlotPoints and those without lastAdvancedChapter", () => {
    const ledger = makeLedger({ maxChapterOrder: 60 });
    const findings = detectAbandonedConflicts(ledger, {
      ...ctx,
      plotPoints: [
        { title: "A", status: "resolved", lastAdvancedChapter: 10 },
        { title: "B", status: "in-progress" },
      ],
    });
    expect(findings).toHaveLength(0);
  });
});
