import { describe, it, expect } from "vitest";
import { buildSignature } from "@/lib/continuity/signature";

describe("buildSignature", () => {
  it("is stable across re-scans for the same logical issue (order-independent)", () => {
    // Same conflict observed again: key parts and chapters in different order
    // must still collapse to one signature so a dismissal survives re-scan.
    const a = buildSignature("fact-conflict", ["Lâm", "mắt"], [9, 3]);
    const b = buildSignature("fact-conflict", ["mắt", "Lâm"], [3, 9]);
    expect(a).toBe(b);
  });

  it("differs when the conflicting chapters differ", () => {
    const a = buildSignature("fact-conflict", ["Lâm", "mắt"], [3, 9]);
    const b = buildSignature("fact-conflict", ["Lâm", "mắt"], [3, 12]);
    expect(a).not.toBe(b);
  });

  it("differs when the subject differs", () => {
    const a = buildSignature("fact-conflict", ["Lâm", "mắt"], [3, 9]);
    const b = buildSignature("fact-conflict", ["Vũ", "mắt"], [3, 9]);
    expect(a).not.toBe(b);
  });

  it("differs by finding type even with identical keys", () => {
    const a = buildSignature("fact-conflict", ["Lâm"], [3]);
    const b = buildSignature("character-state", ["Lâm"], [3]);
    expect(a).not.toBe(b);
  });

  it("normalizes case and whitespace so cosmetic changes do not split findings", () => {
    const a = buildSignature("name-inconsistency", ["  Lâm  "], [1]);
    const b = buildSignature("name-inconsistency", ["lâm"], [1]);
    expect(a).toBe(b);
  });
});
