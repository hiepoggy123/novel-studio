import { describe, it, expect } from "vitest";
import { findSuspects } from "@/lib/continuity/detectors/character-state";
import type { ScanLedger, LedgerCharPatch } from "@/lib/continuity/schemas";

function makeLedger(
  charPatches: LedgerCharPatch[],
  nameIndex: Record<number, string[]>,
): ScanLedger {
  const charNameIndexByChapter = new Map<number, Set<string>>();
  const chapterIdByOrder = new Map<number, string>();
  let max = 0;
  for (const [order, names] of Object.entries(nameIndex)) {
    const n = Number(order);
    charNameIndexByChapter.set(n, new Set(names));
    chapterIdByOrder.set(n, `c${n}`);
    if (n > max) max = n;
  }
  return {
    facts: [],
    charPatches,
    conflictFirstSeen: new Map(),
    conflictLastSeen: new Map(),
    resolvedConflicts: new Set(),
    charNameIndexByChapter,
    chapterIdByOrder,
    maxChapterOrder: max,
  };
}

describe("findSuspects", () => {
  it("flags a dead character whose name appears in a later chapter", () => {
    const ledger = makeLedger(
      [{ name: "Lâm", status: "chết", chapterOrder: 10 }],
      { 10: ["Lâm"], 12: ["Lâm"] },
    );
    const suspects = findSuspects(ledger);
    expect(suspects).toHaveLength(1);
    expect(suspects[0]).toMatchObject({ name: "Lâm", deathChapter: 10, appearChapter: 12 });
  });

  it("does NOT flag when the name never reappears after death", () => {
    const ledger = makeLedger(
      [{ name: "Lâm", status: "chết", chapterOrder: 10 }],
      { 10: ["Lâm"], 12: ["Vũ"] },
    );
    expect(findSuspects(ledger)).toHaveLength(0);
  });

  it("does NOT flag appearances at or before the death chapter", () => {
    const ledger = makeLedger(
      [{ name: "Lâm", status: "chết", chapterOrder: 10 }],
      { 8: ["Lâm"], 10: ["Lâm"] },
    );
    expect(findSuspects(ledger)).toHaveLength(0);
  });

  it("ignores non-terminal status changes", () => {
    const ledger = makeLedger(
      [{ name: "Lâm", status: "bị thương", chapterOrder: 10 }],
      { 12: ["Lâm"] },
    );
    expect(findSuspects(ledger)).toHaveLength(0);
  });

  it("does NOT treat negated terminal phrases as death (e.g. 'không chết', 'suýt chết')", () => {
    expect(
      findSuspects(
        makeLedger([{ name: "Lâm", status: "không chết", chapterOrder: 5 }], { 9: ["Lâm"] }),
      ),
    ).toHaveLength(0);
    expect(
      findSuspects(
        makeLedger([{ name: "Vũ", status: "suýt chết, bị thương nặng", chapterOrder: 5 }], { 9: ["Vũ"] }),
      ),
    ).toHaveLength(0);
  });

  it("uses the earliest terminal chapter as the death chapter", () => {
    const ledger = makeLedger(
      [
        { name: "Lâm", status: "mất tích", chapterOrder: 6 },
        { name: "Lâm", status: "chết", chapterOrder: 14 },
      ],
      { 9: ["Lâm"] },
    );
    const suspects = findSuspects(ledger);
    expect(suspects).toHaveLength(1);
    expect(suspects[0].deathChapter).toBe(6);
  });

  it("produces one suspect per (name, appearChapter)", () => {
    const ledger = makeLedger(
      [{ name: "Lâm", status: "chết", chapterOrder: 5 }],
      { 7: ["Lâm"], 9: ["Lâm"], 11: ["Lâm"] },
    );
    expect(findSuspects(ledger)).toHaveLength(3);
  });
});
