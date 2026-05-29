import { generateStructured } from "@/lib/ai/structured";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import { buildRetrievedContext } from "@/lib/writing/retrieved-context";
import { selectOpenHooks, classifyOverdue } from "@/lib/writing/state/hook-pressure";
import { db } from "@/lib/db";
import { chapterIntentOutputSchema } from "@/lib/writing/intent-schema";
import { directionOutputSchema } from "@/lib/writing/schemas";
import type { ChapterIntent } from "@/lib/writing/intent-schema";
import type { AgentConfig, DirectionAgentOutput } from "@/lib/writing/types";
import type { ChapterPlan } from "@/lib/db";

export interface PlannerAgentInput {
  novelId: string;
  chapterOrder: number;
  chapterPlan?: ChapterPlan;
  subjects?: string[];
}

export interface PlannerAgentOutput {
  intent: ChapterIntent;
  directions: DirectionAgentOutput["options"];
  recommendedOptionIds: string[];
}

async function buildPlannerPrompt(
  input: PlannerAgentInput,
): Promise<string> {
  const [ctx, plotArcs] = await Promise.all([
    buildRetrievedContext(input.novelId, input.chapterOrder, input.subjects ?? []),
    db.plotArcs.where("novelId").equals(input.novelId).toArray(),
  ]);

  const openHooks = selectOpenHooks(plotArcs);
  const overdueHooks = openHooks.filter(
    (p) => classifyOverdue(p, input.chapterOrder) === "overdue",
  );

  const overdueBlock =
    overdueHooks.length > 0
      ? `<overdue_hooks priority="cao — phải xử lý trong chương này">\n${overdueHooks.map((h) => `- ${h.title}: ${h.description}`).join("\n")}\n</overdue_hooks>\n\n`
      : "";

  const chapterPlanBlock = input.chapterPlan
    ? `<chapter_plan>\n${input.chapterPlan.title ? `Tiêu đề: ${input.chapterPlan.title}\n` : ""}${input.chapterPlan.directions?.length > 0 ? `Hướng đi cũ: ${input.chapterPlan.directions.join("; ")}` : ""}\n</chapter_plan>\n\n`
    : "";

  return `${overdueBlock}${chapterPlanBlock}<retrieved_context note="trạng thái đã xác nhận từ snapshot">\n${ctx.context || "(chưa có snapshot)"}\n</retrieved_context>

<request>
Chương ${input.chapterOrder}: Dựa trên bối cảnh đã xác nhận và hook đang mở, hãy:
1. Xác định ý định chương (intent): mục tiêu, ràng buộc, phong cách, hook cần xử lý.
2. Đề xuất 3–5 hướng đi đa dạng, nhất quán với snapshot.
Trả về JSON hợp lệ với hai trường: intent và directions.
</request>`;
}

export async function runPlannerAgent(
  input: PlannerAgentInput,
  intentConfig: AgentConfig,
  directionConfig: AgentConfig,
): Promise<PlannerAgentOutput> {
  const prompt = await buildPlannerPrompt(input);

  const [intentResult, directionResult] = await Promise.all([
    generateStructured<ChapterIntent>({
      model: intentConfig.model,
      schema: chapterIntentOutputSchema,
      system: withGlobalInstruction(
        intentConfig.systemPrompt,
        intentConfig.globalInstruction,
      ),
      prompt: appendUserInstructionToPrompt(prompt, intentConfig.userInstruction),
      abortSignal: intentConfig.abortSignal,
    }),
    generateStructured<DirectionAgentOutput>({
      model: directionConfig.model,
      schema: directionOutputSchema,
      system: withGlobalInstruction(
        directionConfig.systemPrompt,
        directionConfig.globalInstruction,
      ),
      prompt: appendUserInstructionToPrompt(prompt, directionConfig.userInstruction),
      abortSignal: directionConfig.abortSignal,
    }),
  ]);

  return {
    intent: intentResult.object,
    directions: directionResult.object.options,
    recommendedOptionIds: directionResult.object.recommendedOptionIds ?? [],
  };
}
