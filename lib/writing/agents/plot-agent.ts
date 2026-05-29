import {
  WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
  isWebGpuInferenceProviderId,
} from "@/lib/ai/api-inference";
import { createNovelReadTools } from "@/lib/ai/novel-read-tools";
import { resolveStep } from "@/lib/ai/resolve-step";
import { generateStructured } from "@/lib/ai/structured";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { db, type ChatSettings, type WritingSettings } from "@/lib/db";
import { createPlotArc, updatePlotArc } from "@/lib/hooks/use-plot-arcs";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import {
  PlotProposalSchema,
  plotProposalOutputSchema,
  type PlotProposal,
  type ProposedPoint,
} from "@/lib/writing/plot-proposal-schema";
import { DEFAULT_PLOT_PROMPT } from "@/lib/writing/prompts";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";

const DEFAULT_PLOT_MAX_TOOL_STEPS = 6;

export interface PlotAgentInput {
  novelId: string;
  idea: string;
  targetArcId?: string;
  userInstruction?: string;
  abortSignal?: AbortSignal;
}

async function resolvePlotModel(
  settings: WritingSettings | undefined,
  chatSettings: ChatSettings | undefined,
): Promise<LanguageModel> {
  if (settings?.plotModel) {
    const model = await resolveStep(settings.plotModel);
    if (model) return model;
  }
  const globalSettings = await db.writingSettings.get("global-default");
  if (globalSettings?.plotModel) {
    const model = await resolveStep(globalSettings.plotModel);
    if (model) return model;
  }
  if (chatSettings?.providerId && chatSettings?.modelId) {
    const model = await resolveStep({
      providerId: chatSettings.providerId,
      modelId: chatSettings.modelId,
    });
    if (model) return model;
    if (isWebGpuInferenceProviderId(chatSettings.providerId)) {
      throw new Error(WEBGPU_BLOCKED_FOR_API_INFERENCE_VI);
    }
  }
  throw new Error("Không tìm thấy mô hình AI. Vui lòng cấu hình trong Cài đặt.");
}

async function buildExistingArcsSummary(
  novelId: string,
  targetArcId?: string,
): Promise<string> {
  const arcs = await db.plotArcs
    .where("novelId")
    .equals(novelId)
    .sortBy("createdAt");
  if (arcs.length === 0) return "Chưa có tuyến truyện nào.";
  return arcs
    .map((a) => {
      const marker = a.id === targetArcId ? " ← targetArcId" : "";
      const points = a.plotPoints
        .map((p) => `    - ${p.title} (${p.status})`)
        .join("\n");
      return `[${a.id}]${marker} ${a.title} (${a.type}, ${a.status}): ${a.description}${points ? `\n${points}` : ""}`;
    })
    .join("\n");
}

/**
 * Tool-enabled plot-creation agent. Explores the novel via read tools + a static
 * summary of existing arcs (for dedup), then proposes new arcs / added points.
 * Captures the proposal via a sink tool — performs NO DB writes. Falls back to
 * generateStructured if the model returns text instead of calling the sink tool.
 */
export async function runPlotAgent(input: PlotAgentInput): Promise<PlotProposal> {
  const { novelId, idea, targetArcId, userInstruction, abortSignal } = input;

  const [settings, chatSettings, existingArcs] = await Promise.all([
    db.writingSettings.get(novelId),
    db.chatSettings.get("default"),
    buildExistingArcsSummary(novelId, targetArcId),
  ]);

  const model = await resolvePlotModel(settings, chatSettings);
  const systemPrompt = withGlobalInstruction(
    settings?.plotPrompt || DEFAULT_PLOT_PROMPT,
    chatSettings?.globalSystemInstruction,
  );
  const maxSteps =
    settings?.smartWriterMaxToolSteps ?? DEFAULT_PLOT_MAX_TOOL_STEPS;

  const basePrompt = `<user_idea>
${idea}
</user_idea>

<existing_arcs>
${existingArcs}
</existing_arcs>

${targetArcId ? `<focus>Người dùng muốn ưu tiên thêm điểm vào tuyến targetArcId = ${targetArcId}.</focus>\n\n` : ""}<request>Phân tích tiểu thuyết bằng công cụ truy vấn, sau đó gọi submitPlotProposal một lần với đề xuất tuyến/điểm cốt truyện.</request>`;

  let captured: PlotProposal | null = null;

  const tools = {
    ...createNovelReadTools(novelId),
    submitPlotProposal: tool({
      description:
        "Gửi đề xuất tuyến truyện / điểm cốt truyện cuối cùng. Gọi đúng một lần khi đã đủ thông tin.",
      inputSchema: PlotProposalSchema,
      execute: async (proposal) => {
        captured = proposal;
        return "Đã nhận đề xuất.";
      },
    }),
  };

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: appendUserInstructionToPrompt(basePrompt, userInstruction),
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
  });

  if (captured) return PlotProposalSchema.parse(captured);

  if (result.text.trim()) {
    const { object } = await generateStructured<PlotProposal>({
      model,
      schema: plotProposalOutputSchema,
      system: systemPrompt,
      prompt: `Chuyển nội dung sau thành đề xuất tuyến/điểm cốt truyện hợp lệ:\n\n${result.text}`,
      abortSignal,
    });
    return PlotProposalSchema.parse(object);
  }

  throw new Error("Tác nhân cốt truyện không tạo được đề xuất.");
}

export interface ApplyPlotProposalResult {
  arcsCreated: number;
  pointsAdded: number;
  skipped: string[];
}

function toPlotPoint(p: ProposedPoint) {
  return {
    id: crypto.randomUUID(),
    title: p.title,
    description: p.description,
    chapterOrder: p.chapterOrder,
    expectedPayoff: p.expectedPayoff,
    coreHook: p.coreHook,
    status: "planned" as const,
  };
}

/**
 * Persist an accepted proposal: new-arc items create arcs, add-points items
 * append points to the existing arc (validated against current arcs).
 */
export async function applyPlotProposal(
  novelId: string,
  proposal: PlotProposal,
): Promise<ApplyPlotProposalResult> {
  const currentArcs = await db.plotArcs
    .where("novelId")
    .equals(novelId)
    .toArray();
  const arcById = new Map(currentArcs.map((a) => [a.id, a]));

  let arcsCreated = 0;
  let pointsAdded = 0;
  const skipped: string[] = [];

  for (const item of proposal.items) {
    if (item.kind === "new-arc") {
      await createPlotArc({
        novelId,
        title: item.title,
        description: item.description,
        type: item.type,
        plotPoints: item.plotPoints.map(toPlotPoint),
        status: "active",
      });
      arcsCreated += 1;
    } else {
      const arc = arcById.get(item.targetArcId);
      if (!arc) {
        skipped.push(item.targetArcId);
        continue;
      }
      const newPoints = item.plotPoints.map(toPlotPoint);
      const merged = [...arc.plotPoints, ...newPoints];
      await updatePlotArc(arc.id, { plotPoints: merged });
      arcById.set(arc.id, { ...arc, plotPoints: merged });
      pointsAdded += newPoints.length;
    }
  }

  return { arcsCreated, pointsAdded, skipped };
}
