import { describe, it, expect } from "vitest";
import { detectNameInconsistencies } from "@/lib/continuity/detectors/name-consistency";
import type { ScanLedger, DetectorCtx } from "@/lib/continuity/schemas";

const emptyLedger: ScanLedger = {
  facts: [],
  charPatches: [],
  conflictFirstSeen: new Map(),
  conflictLastSeen: new Map(),
  resolvedConflicts: new Set(),
  charNameIndexByChapter: new Map(),
  chapterIdByOrder: new Map(),
  maxChapterOrder: 0,
};

const base: DetectorCtx = { novelId: "n1", staleGap: 25 };

describe("detectNameInconsistencies", () => {
  it("flags one Chinese token mapped to two Vietnamese names in the same scope", () => {
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [
        { chinese: "林", vietnamese: "Lâm", scope: "global" },
        { chinese: "林", vietnamese: "Lin", scope: "global" },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("name-inconsistency");
    expect(findings[0].confidence).toBe(1);
  });

  it("does NOT flag a single consistent mapping", () => {
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [{ chinese: "林", vietnamese: "Lâm", scope: "n1" }],
    });
    expect(findings).toHaveLength(0);
  });

  it("flags an approved detected reading that disagrees with the dictionary", () => {
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [{ chinese: "王", vietnamese: "Vương", scope: "n1" }],
      nameFrequencies: [
        { chinese: "王", reading: "Vuong", chapters: ["c1"], status: "approved" },
      ],
    });
    expect(findings).toHaveLength(1);
  });

  it("ignores non-approved frequencies and matching readings", () => {
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [{ chinese: "王", vietnamese: "Vương", scope: "n1" }],
      nameFrequencies: [
        { chinese: "王", reading: "Vuong", chapters: [], status: "pending" },
        { chinese: "王", reading: "Vương", chapters: [], status: "approved" },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag when a novel-scoped mapping overrides a different global one", () => {
    // Global says 林 -> Lâm, but this novel deliberately uses 林 -> Lâm Phong.
    // Novel scope wins; this is an intentional override, not a conflict.
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [
        { chinese: "林", vietnamese: "Lâm", scope: "global" },
        { chinese: "林", vietnamese: "Lâm Phong", scope: "n1" },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it("flags inconsistency that exists WITHIN the novel scope", () => {
    const findings = detectNameInconsistencies(emptyLedger, {
      ...base,
      nameEntries: [
        { chinese: "林", vietnamese: "Lâm", scope: "n1" },
        { chinese: "林", vietnamese: "Lâm Phong", scope: "n1" },
      ],
    });
    expect(findings).toHaveLength(1);
  });

  it("returns nothing when no QT data is supplied (works with empty ctx)", () => {
    expect(detectNameInconsistencies(emptyLedger, base)).toHaveLength(0);
  });
});
