export interface LengthSpec {
  target: number;
  softMin: number;
  softMax: number;
  hardMin: number;
  hardMax: number;
}

export type LengthMode = "expand" | "compress" | "none";

export function buildLengthSpec(chapterLength: number): LengthSpec {
  return {
    target: chapterLength,
    softMin: Math.round(chapterLength * 0.85),
    softMax: Math.round(chapterLength * 1.15),
    hardMin: Math.round(chapterLength * 0.7),
    hardMax: Math.round(chapterLength * 1.4),
  };
}

export function isOutsideHardRange(length: number, spec: LengthSpec): boolean {
  return length < spec.hardMin || length > spec.hardMax;
}

export function chooseMode(length: number, spec: LengthSpec): LengthMode {
  if (length < spec.hardMin) return "expand";
  if (length > spec.hardMax) return "compress";
  return "none";
}
