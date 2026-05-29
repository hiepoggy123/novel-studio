import { jsonSchema } from "ai";
import { z } from "zod";

export interface ChapterIntent {
  goal: string;
  mustKeep: string[];
  mustAvoid: string[];
  styleEmphasis: string[];
  hookRefs: string[];
}

export const chapterIntentOutputSchema = jsonSchema<ChapterIntent>({
  type: "object",
  properties: {
    goal: {
      type: "string",
      description: "Mục tiêu chính của chương (1-2 câu súc tích)",
    },
    mustKeep: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Tối đa 5 yếu tố bắt buộc giữ nguyên (nhân vật, sự kiện, trạng thái)",
    },
    mustAvoid: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Tối đa 5 điều cấm trong chương này (mâu thuẫn, lặp lại, lỗi logic)",
    },
    styleEmphasis: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Tối đa 5 yêu cầu về phong cách hoặc nhịp điệu chương",
    },
    hookRefs: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Tối đa 5 id của PlotArc hoặc PlotPoint cần xử lý trong chương",
    },
  },
  required: ["goal", "mustKeep", "mustAvoid", "styleEmphasis", "hookRefs"],
  additionalProperties: false,
});

export const ChapterIntentSchema = z.object({
  goal: z.string().min(1),
  mustKeep: z.array(z.string()).max(5),
  mustAvoid: z.array(z.string()).max(5),
  styleEmphasis: z.array(z.string()).max(5),
  hookRefs: z.array(z.string()).max(5),
});

export function formatChapterIntent(
  intent: ChapterIntent | undefined | null,
  hooks: { id: string; title: string }[] = [],
): string {
  if (!intent) return "";
  const titleById = new Map(hooks.map((h) => [h.id, h.title]));
  const hookTitles = intent.hookRefs
    .map((id) => titleById.get(id))
    .filter((t): t is string => Boolean(t));
  const lines = [
    intent.goal ? `Mục tiêu: ${intent.goal}` : "",
    intent.mustKeep.length ? `Bắt buộc giữ: ${intent.mustKeep.join("; ")}` : "",
    intent.mustAvoid.length ? `Cấm: ${intent.mustAvoid.join("; ")}` : "",
    intent.styleEmphasis.length
      ? `Phong cách: ${intent.styleEmphasis.join("; ")}`
      : "",
    hookTitles.length ? `Hook cần xử lý: ${hookTitles.join("; ")}` : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `<chapter_intent constraint="bắt buộc tuân thủ">\n${lines.join("\n")}\n</chapter_intent>`;
}
