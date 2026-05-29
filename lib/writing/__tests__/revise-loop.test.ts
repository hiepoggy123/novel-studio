import { describe, it, expect } from "vitest";
import { shouldRevise, REVISE_EPSILON } from "../revise-loop";
import type { ReviewAgentOutput } from "../types";

const settings = { minScoreToAutoAccept: 7, maxAutoRetries: 2 };

function makeAudit(score: number, hasCritical = false): ReviewAgentOutput {
  return {
    overallScore: score,
    summary: "test",
    issues: hasCritical
      ? [{ type: "character", severity: "critical", description: "x", location: "p1", suggestion: "fix" }]
      : [],
  };
}

describe("shouldRevise — retries exhausted", () => {
  it("returns false when retryCount >= maxAutoRetries", () => {
    expect(shouldRevise(makeAudit(5), 5, settings, 2)).toBe(false);
    expect(shouldRevise(makeAudit(5, true), 5, settings, 3)).toBe(false);
  });
});

describe("shouldRevise — score above threshold, no critical", () => {
  it("returns false when score meets threshold and no critical issues", () => {
    expect(shouldRevise(makeAudit(7), 6, settings, 0)).toBe(false);
    expect(shouldRevise(makeAudit(9), 8, settings, 1)).toBe(false);
  });
});

describe("shouldRevise — first attempt (retryCount === 0)", () => {
  it("returns true when score below threshold on first attempt", () => {
    expect(shouldRevise(makeAudit(6), 6, settings, 0)).toBe(true);
  });

  it("returns true when critical issue on first attempt regardless of score", () => {
    expect(shouldRevise(makeAudit(8, true), 8, settings, 0)).toBe(true);
  });

  it("does not require epsilon improvement on first attempt", () => {
    expect(shouldRevise(makeAudit(5), 5, settings, 0)).toBe(true);
  });
});

describe("shouldRevise — subsequent attempts (retryCount > 0) epsilon guard", () => {
  it("returns true when current score exceeds bestScore + epsilon", () => {
    const audit = makeAudit(5.9);
    expect(shouldRevise(audit, 5, settings, 1)).toBe(true);
  });

  it("returns false when current score does not exceed bestScore + epsilon", () => {
    const audit = makeAudit(5.4);
    expect(shouldRevise(audit, 5, settings, 1)).toBe(false);
  });

  it("returns false when score equals bestScore + epsilon exactly", () => {
    const audit = makeAudit(5 + REVISE_EPSILON);
    expect(shouldRevise(audit, 5, settings, 1)).toBe(false);
  });

  it("applies epsilon guard even with critical issue on retry", () => {
    const audit = makeAudit(5, true);
    expect(shouldRevise(audit, 5, settings, 1)).toBe(false);
  });

  it("returns true with critical and sufficient improvement on retry", () => {
    const audit = makeAudit(6, true);
    expect(shouldRevise(audit, 5, settings, 1)).toBe(true);
  });
});

describe("shouldRevise — default settings fallback", () => {
  it("uses default threshold 7 and maxRetries 2 when settings are undefined", () => {
    const noSettings = { minScoreToAutoAccept: undefined, maxAutoRetries: undefined };
    expect(shouldRevise(makeAudit(6), 6, noSettings, 0)).toBe(true);
    expect(shouldRevise(makeAudit(6), 6, noSettings, 2)).toBe(false);
  });
});
