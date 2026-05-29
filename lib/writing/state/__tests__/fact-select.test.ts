import { describe, it, expect } from "vitest";
import { selectRelevantFacts } from "@/lib/writing/state/fact-select";
import type { KnownFact } from "@/lib/writing/state/schemas";

const facts: KnownFact[] = [
  { subject: "Lý", predicate: "biết", object: "bí mật A", sourceChapter: 1 },
  { subject: "Trần", predicate: "sở hữu", object: "kiếm", sourceChapter: 2 },
  { subject: "Lý", predicate: "ở tại", object: "kinh đô", sourceChapter: 3 },
  { subject: "Vương", predicate: "là", object: "kẻ phản", sourceChapter: 4 },
];

describe("selectRelevantFacts", () => {
  it("returns only facts whose subject matches one of the requested subjects", () => {
    const result = selectRelevantFacts(facts, ["Lý"]);
    expect(result).toHaveLength(2);
    expect(result.every((f) => f.subject === "Lý")).toBe(true);
  });

  it("returns facts for multiple subjects", () => {
    const result = selectRelevantFacts(facts, ["Lý", "Trần"]);
    expect(result).toHaveLength(3);
    const subjects = new Set(result.map((f) => f.subject));
    expect(subjects.has("Lý")).toBe(true);
    expect(subjects.has("Trần")).toBe(true);
  });

  it("returns empty array when no subject matches", () => {
    const result = selectRelevantFacts(facts, ["Khổng"]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty subjects list", () => {
    const result = selectRelevantFacts(facts, []);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty facts list", () => {
    const result = selectRelevantFacts([], ["Lý"]);
    expect(result).toHaveLength(0);
  });

  it("does not mutate the input facts array", () => {
    const copy = [...facts];
    selectRelevantFacts(facts, ["Lý"]);
    expect(facts).toEqual(copy);
  });
});
