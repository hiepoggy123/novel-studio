import { generateStructured } from "@/lib/ai/structured";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { observerOutputSchema } from "@/lib/writing/observer-schema";
import type { AgentConfig } from "@/lib/writing/types";
import type { StateDelta } from "@/lib/writing/state/schemas";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

export interface ObserverAgentInput {
  chapterOrder: number;
  chapterText: string;
  snapshot: StoryStateSnapshot;
  chapterOutline?: string;
}

export async function runObserverAgent(
  input: ObserverAgentInput,
  config: AgentConfig,
): Promise<StateDelta> {
  const snapshotSummary = buildSnapshotSummary(input.snapshot);

  const prompt = `<chapter_number>${input.chapterOrder}</chapter_number>

<prior_state>
${snapshotSummary}
</prior_state>

${input.chapterOutline ? `<chapter_outline>\n${input.chapterOutline}\n</chapter_outline>\n\n` : ""}<chapter_text>
${input.chapterText}
</chapter_text>

<request>
Phân tích chương trên và tạo StateDelta chính xác:
- factOps: các sự thật thế giới mới được thiết lập hoặc bị huỷ bỏ trong chương này
- hookOps: các mốc cốt truyện được tiến triển, giải quyết, trì hoãn, hoặc thêm mới
- characterStatePatches: cập nhật trạng thái/vị trí/tình huống nhân vật sau chương này
- chapterSummary: tóm tắt 2-4 câu bằng tiếng Việt
- knownTruthsAdded: sự thật bất biến mới được tiết lộ (nếu có)

Chỉ ghi nhận những thay đổi thực sự xảy ra trong chương. Không suy diễn.
</request>`;

  const { object } = await generateStructured<StateDelta>({
    model: config.model,
    schema: observerOutputSchema,
    system: withGlobalInstruction(
      config.systemPrompt,
      config.globalInstruction,
    ),
    prompt,
    abortSignal: config.abortSignal,
  });

  return { ...object, chapter: input.chapterOrder };
}

function buildSnapshotSummary(snapshot: StoryStateSnapshot): string {
  const parts: string[] = [];

  parts.push(`Chương đã áp dụng gần nhất: ${snapshot.lastAppliedChapter}`);

  if (snapshot.characterStates.length > 0) {
    const chars = snapshot.characterStates
      .map((c) => `  - ${c.name}: ${c.currentState}${c.location ? ` (tại ${c.location})` : ""}`)
      .join("\n");
    parts.push(`Trạng thái nhân vật:\n${chars}`);
  }

  if (snapshot.worldFacts) {
    parts.push(`Bối cảnh thế giới: ${snapshot.worldFacts}`);
  }

  if (snapshot.openConflicts.length > 0) {
    parts.push(`Xung đột đang diễn ra:\n${snapshot.openConflicts.map((c) => `  - ${c}`).join("\n")}`);
  }

  if (snapshot.knownTruths.length > 0) {
    parts.push(`Sự thật bất biến:\n${snapshot.knownTruths.map((t) => `  - ${t}`).join("\n")}`);
  }

  return parts.join("\n\n");
}
