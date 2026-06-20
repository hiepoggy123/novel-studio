import { describe, it, expect } from "vitest";
import { detectFactConflicts } from "@/lib/continuity/detectors/fact-conflict";
import { buildAliasMap } from "@/lib/continuity/subject-normalize";
import type { LedgerFact, ScanLedger, DetectorCtx } from "@/lib/continuity/schemas";

function ledgerOf(facts: LedgerFact[]): ScanLedger {
  const chapterIdByOrder = new Map<number, string>();
  let max = 0;
  for (const f of facts) {
    chapterIdByOrder.set(f.chapterOrder, `c${f.chapterOrder}`);
    if (f.chapterOrder > max) max = f.chapterOrder;
  }
  return {
    facts,
    charPatches: [],
    conflictFirstSeen: new Map(),
    conflictLastSeen: new Map(),
    resolvedConflicts: new Set(),
    charNameIndexByChapter: new Map(),
    chapterIdByOrder,
    maxChapterOrder: max,
  };
}

const ctx: DetectorCtx = { novelId: "n1", staleGap: 25 };

describe("detectFactConflicts", () => {
  it("flags a subject+predicate with two distinct objects across chapters", () => {
    const ledger = ledgerOf([
      { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
      { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 9 },
    ]);
    const findings = detectFactConflicts(ledger, ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("fact-conflict");
    expect(findings[0].confidence).toBe(1);
    expect(findings[0].evidence.map((e) => e.chapterOrder).sort((a, b) => a - b)).toEqual([3, 9]);
  });

  it("does NOT flag when the object is consistent (no false positive)", () => {
    const ledger = ledgerOf([
      { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
      { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 9 },
    ]);
    expect(detectFactConflicts(ledger, ctx)).toHaveLength(0);
  });

  it("raises severity to high for a stable predicate", () => {
    const ledger = ledgerOf([
      { subject: "Lâm", predicate: "giới tính", object: "nam", chapterOrder: 1 },
      { subject: "Lâm", predicate: "giới tính", object: "nữ", chapterOrder: 6 },
    ]);
    const findings = detectFactConflicts(ledger, { ...ctx, stablePredicates: ["giới tính"] });
    expect(findings[0].severity).toBe("high");
  });

  it("groups via alias so the same entity under two names still conflicts", () => {
    // '林' and 'Lâm' are the same character; facts under each must collide.
    const aliasMap = buildAliasMap([{ chinese: "林", vietnamese: "Lâm", scope: "global" }]);
    const ledger = ledgerOf([
      { subject: "林", predicate: "màu mắt", object: "xanh", chapterOrder: 2 },
      { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 8 },
    ]);
    const findings = detectFactConflicts(ledger, { ...ctx, aliasMap });
    expect(findings).toHaveLength(1);
  });

  it("is stable: re-detecting the same conflict yields the same signature", () => {
    const a = detectFactConflicts(
      ledgerOf([
        { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
        { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 9 },
      ]),
      ctx,
    )[0].signature;
    const b = detectFactConflicts(
      ledgerOf([
        { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 9 },
        { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
      ]),
      ctx,
    )[0].signature;
    expect(a).toBe(b);
  });

  it("keeps a stable signature when a NEW conflicting object appears later (dismiss must persist)", () => {
    // A user dismisses the eye-color conflict; a later scan finds a third color.
    // The signature must NOT change, or the dismiss is silently undone.
    const before = detectFactConflicts(
      ledgerOf([
        { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
        { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 9 },
      ]),
      ctx,
    )[0].signature;
    const after = detectFactConflicts(
      ledgerOf([
        { subject: "Lâm", predicate: "màu mắt", object: "xanh", chapterOrder: 3 },
        { subject: "Lâm", predicate: "màu mắt", object: "đen", chapterOrder: 9 },
        { subject: "Lâm", predicate: "màu mắt", object: "nâu", chapterOrder: 14 },
      ]),
      ctx,
    )[0].signature;
    expect(after).toBe(before);
  });
});
