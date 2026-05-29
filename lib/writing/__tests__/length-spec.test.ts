import { describe, it, expect } from "vitest";
import { buildLengthSpec, isOutsideHardRange, chooseMode } from "../length-spec";

describe("buildLengthSpec", () => {
  it("derives correct ranges from chapterLength", () => {
    const spec = buildLengthSpec(1000);
    expect(spec.target).toBe(1000);
    expect(spec.softMin).toBe(850);
    expect(spec.softMax).toBe(1150);
    expect(spec.hardMin).toBe(700);
    expect(spec.hardMax).toBe(1400);
  });

  it("rounds fractional values", () => {
    const spec = buildLengthSpec(333);
    expect(Number.isInteger(spec.softMin)).toBe(true);
    expect(Number.isInteger(spec.hardMax)).toBe(true);
  });
});

describe("isOutsideHardRange", () => {
  const spec = buildLengthSpec(1000);

  it("returns false when inside hard range", () => {
    expect(isOutsideHardRange(1000, spec)).toBe(false);
    expect(isOutsideHardRange(700, spec)).toBe(false);
    expect(isOutsideHardRange(1400, spec)).toBe(false);
  });

  it("returns true when below hardMin", () => {
    expect(isOutsideHardRange(699, spec)).toBe(true);
    expect(isOutsideHardRange(0, spec)).toBe(true);
  });

  it("returns true when above hardMax", () => {
    expect(isOutsideHardRange(1401, spec)).toBe(true);
  });
});

describe("chooseMode", () => {
  const spec = buildLengthSpec(1000);

  it("returns none when inside hard range", () => {
    expect(chooseMode(1000, spec)).toBe("none");
    expect(chooseMode(700, spec)).toBe("none");
    expect(chooseMode(1400, spec)).toBe("none");
  });

  it("returns expand when below hardMin", () => {
    expect(chooseMode(699, spec)).toBe("expand");
    expect(chooseMode(100, spec)).toBe("expand");
  });

  it("returns compress when above hardMax", () => {
    expect(chooseMode(1401, spec)).toBe("compress");
    expect(chooseMode(5000, spec)).toBe("compress");
  });
});
