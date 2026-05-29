import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import { buildLengthSpec, chooseMode } from "@/lib/writing/length-spec";
import { countLength } from "@/lib/writing/count-length";
import { streamText } from "ai";
import type { AgentConfig } from "@/lib/writing/types";

export interface LengthNormalizerInput {
  content: string;
  chapterLength: number;
}

export async function runLengthNormalizer(
  input: LengthNormalizerInput,
  config: AgentConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  const spec = buildLengthSpec(input.chapterLength);
  const currentLength = countLength(input.content);
  const mode = chooseMode(currentLength, spec);

  if (mode === "none") return input.content;

  const prompt = buildPrompt(input.content, mode, spec, currentLength);

  const result = streamText({
    model: config.model,
    system: withGlobalInstruction(config.systemPrompt, config.globalInstruction),
    prompt: appendUserInstructionToPrompt(prompt, config.userInstruction),
    temperature: 0.3,
    abortSignal: config.abortSignal,
  });

  let accumulated = "";
  for await (const chunk of result.textStream) {
    accumulated += chunk;
    onChunk?.(chunk);
  }

  if (accumulated.trim().length === 0) return input.content;

  const outputLength = countLength(accumulated);
  if (mode === "expand" && outputLength < spec.hardMin) {
    return input.content;
  }

  return accumulated;
}

function buildPrompt(
  content: string,
  mode: "expand" | "compress",
  spec: ReturnType<typeof buildLengthSpec>,
  currentLength: number,
): string {
  if (mode === "expand") {
    return `<task>
Chương hiện tại có ${currentLength} từ/ký tự — dưới ngưỡng tối thiểu ${spec.hardMin}.
Mở rộng chương lên ít nhất ${spec.hardMin} từ/ký tự (mục tiêu: ${spec.target}).
Thêm chi tiết, mô tả, nội tâm nhân vật phù hợp — không thêm sự kiện mới làm thay đổi cốt truyện.
KHÔNG dùng markdown. Chỉ văn xuôi thuần túy.
</task>

<original_chapter>
${content}
</original_chapter>`;
  }

  return `<task>
Chương hiện tại có ${currentLength} từ/ký tự — vượt ngưỡng tối đa ${spec.hardMax}.
Rút gọn chương xuống tối đa ${spec.hardMax} từ/ký tự (mục tiêu: ${spec.target}).
Giữ nguyên tất cả sự kiện và nhân vật chính — chỉ cắt bớt mô tả thừa và đoạn lặp.
KHÔNG dùng markdown. Chỉ văn xuôi thuần túy.
</task>

<original_chapter>
${content}
</original_chapter>`;
}
