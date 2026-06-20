import { jsonSchema } from "ai";

export interface CharacterStateConfirm {
  isContradiction: boolean;
  confidence: number;
  reason: string;
  quote: string;
}

export const characterStateConfirmSchema = jsonSchema<CharacterStateConfirm>({
  type: "object",
  properties: {
    isContradiction: {
      type: "boolean",
      description:
        "true CHỈ KHI nhân vật thực sự hành động/xuất hiện sống động mâu thuẫn với trạng thái đã chết/rời đi trước đó",
    },
    confidence: {
      type: "number",
      description: "Độ tin cậy 0..1",
    },
    reason: {
      type: "string",
      description: "Giải thích ngắn gọn bằng tiếng Việt",
    },
    quote: {
      type: "string",
      description: "Câu/đoạn trong chương cho thấy mâu thuẫn (nếu có), trích nguyên văn",
    },
  },
  required: ["isContradiction", "confidence", "reason", "quote"],
});

export const CHARACTER_STATE_SYSTEM_PROMPT = `Bạn là biên tập viên kiểm tra tính nhất quán của nhân vật trong tiểu thuyết.
Nhiệm vụ: xác nhận liệu việc một nhân vật xuất hiện sau khi đã được đánh dấu là chết/rời đi/mất tích có phải là MÂU THUẪN thực sự hay không.

KHÔNG tính là mâu thuẫn nếu:
- Hồi tưởng, hồi ức, giấc mơ về nhân vật.
- Nhắc tới thi thể, mộ phần, di vật, hoặc người khác nói VỀ nhân vật.
- Trùng tên với nhân vật khác (đồng danh).
- Nhân vật hồi sinh/trở lại một cách có chủ đích trong cốt truyện (được giải thích rõ).

CHỈ tính là mâu thuẫn khi nhân vật đó thực sự hành động/nói/xuất hiện sống động như chưa từng chết/rời đi mà không có lời giải thích.
Trả lời chính xác theo schema. Nếu không chắc, đặt isContradiction=false.`;

/** Build the confirm prompt for one suspect. Excerpt is a bounded window of the
 * appearance chapter around the character's name. */
export function buildCharacterStateConfirmPrompt(input: {
  name: string;
  status: string;
  deathChapter: number;
  appearChapter: number;
  excerpt: string;
}): string {
  // Chapter text is untrusted (esp. imported books): neutralize the delimiter
  // so the excerpt cannot close its tag early and inject instructions.
  const safeExcerpt = input.excerpt.replace(/<\/?trích_đoạn>/gi, "");
  return `<nhân_vật>${input.name}</nhân_vật>
<trạng_thái_trước>${input.status} (từ chương ${input.deathChapter})</trạng_thái_trước>
<chương_xuất_hiện>${input.appearChapter}</chương_xuất_hiện>

<trích_đoạn>
${safeExcerpt}
</trích_đoạn>

<yêu_cầu>
Nhân vật "${input.name}" đã được đánh dấu "${input.status}" từ chương ${input.deathChapter}.
Ở chương ${input.appearChapter} tên nhân vật này xuất hiện. Đây có phải mâu thuẫn nhất quán thực sự không?
</yêu_cầu>`;
}
