import { countWords } from "@/lib/utils";

const CJK_RANGE = /[一-鿿㐀-䶿가-힯぀-ゟ゠-ヿ]/g;

export function countLength(text: string): number {
  const cjkCount = text.match(CJK_RANGE)?.length ?? 0;
  if (cjkCount === 0) return countWords(text);
  return cjkCount;
}
