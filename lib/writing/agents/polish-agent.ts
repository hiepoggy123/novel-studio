import { streamText } from "ai";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import { ALL_FATIGUE_TERMS } from "@/lib/writing/style/fatigue-list.vi";
import type { AgentConfig } from "../types";

function detectFlaggedTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return ALL_FATIGUE_TERMS.filter((term) => lower.includes(term.toLowerCase()));
}

export async function runPolishAgent(
  chapterText: string,
  config: AgentConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  const flagged = detectFlaggedTerms(chapterText);

  if (flagged.length === 0) return chapterText;

  const flaggedList = flagged.map((t) => `- "${t}"`).join("\n");

  const basePrompt = `<chapter_to_polish>
${chapterText}
</chapter_to_polish>

<flagged_phrases note="các cụm từ AI-sounding hoặc sáo rỗng cần thay thế">
${flaggedList}
</flagged_phrases>

<requirements>
  <req>Chỉ thay thế hoặc viết lại các câu chứa flagged_phrases. Giữ nguyên toàn bộ phần còn lại.</req>
  <req>Thay thế bằng ngôn ngữ tự nhiên, cụ thể, phù hợp ngữ cảnh — không thêm cụm từ sáo rỗng mới.</req>
  <req>Giữ nguyên cốt truyện, nhân vật, sự kiện, góc nhìn và giọng văn tổng thể.</req>
  <req>KHÔNG dùng markdown. Chỉ văn xuôi thuần túy.</req>
  <req>Viết bằng Tiếng Việt.</req>
</requirements>`;

  const result = streamText({
    model: config.model,
    system: withGlobalInstruction(config.systemPrompt, config.globalInstruction),
    prompt: appendUserInstructionToPrompt(basePrompt, config.userInstruction),
    abortSignal: config.abortSignal,
  });

  let accumulated = "";
  for await (const chunk of result.textStream) {
    accumulated += chunk;
    onChunk?.(chunk);
  }

  if (config.abortSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return accumulated || chapterText;
}
