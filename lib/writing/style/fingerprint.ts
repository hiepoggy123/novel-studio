const DIALOGUE_MARKER_RE = /[""]([^""]+)[""]/g;
const SENTENCE_END_RE = /[.!?。！？…]+/g;
const POV_FIRST_RE = /\b(tôi|ta|mình)\b/gi;
const POV_THIRD_RE = /\b(hắn|y|nàng|chàng|cô|anh|cậu|lão|ông|bà)\b/gi;

export interface StyleMetrics {
  avgSentenceLengthChars: number;
  paragraphLengthVariance: number;
  dialogueDensity: number;
  firstPersonFreq: number;
  thirdPersonFreq: number;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

export function computeStyleMetrics(scenes: { content: string }[]): StyleMetrics {
  const fullText = scenes.map((s) => s.content).join("\n\n");

  if (fullText.trim().length === 0) {
    return {
      avgSentenceLengthChars: 0,
      paragraphLengthVariance: 0,
      dialogueDensity: 0,
      firstPersonFreq: 0,
      thirdPersonFreq: 0,
    };
  }

  const paragraphs = splitParagraphs(fullText);
  const sentences = splitSentences(fullText);

  const avgSentenceLengthChars =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
      : 0;

  const paraLengths = paragraphs.map((p) => p.length);
  const paragraphLengthVariance = variance(paraLengths);

  const dialogueMatches = [...fullText.matchAll(DIALOGUE_MARKER_RE)];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m[0].length, 0);
  const dialogueDensity = fullText.length > 0 ? dialogueChars / fullText.length : 0;

  const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;
  const firstPersonCount = (fullText.match(POV_FIRST_RE) ?? []).length;
  const thirdPersonCount = (fullText.match(POV_THIRD_RE) ?? []).length;

  const firstPersonFreq = wordCount > 0 ? firstPersonCount / wordCount : 0;
  const thirdPersonFreq = wordCount > 0 ? thirdPersonCount / wordCount : 0;

  return {
    avgSentenceLengthChars: Math.round(avgSentenceLengthChars * 10) / 10,
    paragraphLengthVariance: Math.round(paragraphLengthVariance),
    dialogueDensity: Math.round(dialogueDensity * 1000) / 1000,
    firstPersonFreq: Math.round(firstPersonFreq * 1000) / 1000,
    thirdPersonFreq: Math.round(thirdPersonFreq * 1000) / 1000,
  };
}

export function formatFingerprint(metrics: StyleMetrics): string {
  const povLabel =
    metrics.firstPersonFreq > metrics.thirdPersonFreq * 1.5
      ? "ngôi thứ nhất"
      : metrics.thirdPersonFreq > metrics.firstPersonFreq * 1.5
        ? "ngôi thứ ba"
        : "hỗn hợp";

  const dialogueLevel =
    metrics.dialogueDensity > 0.3
      ? "nhiều thoại"
      : metrics.dialogueDensity > 0.15
        ? "thoại vừa phải"
        : "ít thoại";

  const sentenceStyle =
    metrics.avgSentenceLengthChars > 80
      ? "câu dài"
      : metrics.avgSentenceLengthChars > 40
        ? "câu trung bình"
        : "câu ngắn";

  const paraVariance =
    metrics.paragraphLengthVariance > 5000
      ? "đoạn văn biến thiên nhiều"
      : metrics.paragraphLengthVariance > 1000
        ? "đoạn văn biến thiên vừa"
        : "đoạn văn đều nhau";

  return `[Phong cách: ${povLabel}, ${sentenceStyle} (~${metrics.avgSentenceLengthChars} ký tự/câu), ${dialogueLevel} (${(metrics.dialogueDensity * 100).toFixed(1)}%), ${paraVariance}]`;
}
