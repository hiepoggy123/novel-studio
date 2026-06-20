import { describe, it, expect } from "vitest";
import { buildAliasMap, normalizeSubject } from "@/lib/continuity/subject-normalize";

describe("buildAliasMap / normalizeSubject", () => {
  it("maps both Chinese and Vietnamese surface forms to the canonical Vietnamese name", () => {
    const map = buildAliasMap([{ chinese: "林", vietnamese: "Lâm", scope: "global" }]);
    // A fact written with the Chinese token and one written with the VI name
    // must resolve to the same subject so they can be compared.
    expect(normalizeSubject("林", map)).toBe("lâm");
    expect(normalizeSubject("Lâm", map)).toBe("lâm");
  });

  it("falls back to trimmed-lowercased subject when no alias exists", () => {
    expect(normalizeSubject("  Vũ Phong  ")).toBe("vũ phong");
  });

  it("ignores entries with empty canonical name", () => {
    const map = buildAliasMap([{ chinese: "林", vietnamese: "  ", scope: "global" }]);
    expect(map.size).toBe(0);
  });
});
