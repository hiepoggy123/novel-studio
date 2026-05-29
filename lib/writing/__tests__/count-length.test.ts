import { describe, it, expect } from "vitest";
import { countLength } from "../count-length";

describe("countLength", () => {
  it("uses whitespace word count for Vietnamese text", () => {
    const vi = "Anh ta bước vào căn phòng tối tăm";
    expect(countLength(vi)).toBe(8);
  });

  it("uses CJK char count for Chinese text", () => {
    const zh = "他走进了黑暗的房间";
    expect(countLength(zh)).toBe(9);
  });

  it("uses CJK char count when CJK chars are present", () => {
    const mixed = "第一章 Chương một";
    const cjkCount = mixed.match(/[一-鿿㐀-䶿가-힯぀-ゟ゠-ヿ]/g)?.length ?? 0;
    expect(countLength(mixed)).toBe(cjkCount);
    expect(cjkCount).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(countLength("")).toBe(0);
  });

  it("handles single Vietnamese word", () => {
    expect(countLength("truyện")).toBe(1);
  });

  it("handles single CJK character", () => {
    expect(countLength("龙")).toBe(1);
  });

  it("handles Korean hangul", () => {
    const ko = "안녕하세요";
    expect(countLength(ko)).toBe(5);
  });

  it("handles Japanese kana", () => {
    const ja = "こんにちは";
    expect(countLength(ja)).toBe(5);
  });
});
