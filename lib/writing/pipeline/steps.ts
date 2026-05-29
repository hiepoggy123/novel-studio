import type { WritingAgentRole } from "@/lib/db";
import { db } from "@/lib/db";
import { resolveStep } from "@/lib/ai/resolve-step";
import {
  WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
  isWebGpuInferenceProviderId,
} from "@/lib/ai/api-inference";
import { getDefaultPrompt } from "@/lib/writing/prompts";
import { runPlannerAgent } from "@/lib/writing/agents/planner-agent";
import { runOutlineAgent } from "@/lib/writing/agents/outline-agent";
import { runSmartWriterAgent } from "@/lib/writing/agents/smart-writer-agent";
import { runLengthNormalizer } from "@/lib/writing/agents/length-normalizer";
import { runObserverAgent } from "@/lib/writing/agents/observer-agent";
import { runAuditAgent } from "@/lib/writing/agents/audit-agent";
import { runRewriteAgent } from "@/lib/writing/agents/rewrite-agent";
import { runPolishAgent } from "@/lib/writing/agents/polish-agent";
import { formatChapterIntent } from "@/lib/writing/intent-schema";
import { flattenHookTitles } from "@/lib/writing/state/hook-pressure";
import { StateDeltaSchema } from "@/lib/writing/state/schemas";
import type { StateDelta } from "@/lib/writing/state/schemas";
import { loadStoryState } from "@/lib/writing/state/state-store";
import { commitChapterState } from "@/lib/writing/commit-chapter-state";
import { retrievedContextToAgentOutput } from "@/lib/writing/retrieved-context";
import { buildRetrievedContext } from "@/lib/writing/retrieved-context";
import type { AgentConfig } from "@/lib/writing/types";
import type { PipelineCtx } from "./pipeline-ctx";

export interface StepDescriptor {
  role: WritingAgentRole;
  humanGate: boolean;
  run(ctx: PipelineCtx): Promise<void>;
}

async function getAgentConfig(
  novelId: string,
  role: WritingAgentRole,
  ctx: PipelineCtx,
): Promise<AgentConfig> {
  const chatSettings = await db.chatSettings.get("default");
  const stepModelKey = `${role}Model` as keyof typeof ctx.settings;
  const stepModelConfig = ctx.settings[stepModelKey] as
    | { providerId: string; modelId: string }
    | undefined;

  let model = stepModelConfig ? await resolveStep(stepModelConfig) : undefined;
  if (!model && chatSettings?.providerId && chatSettings?.modelId) {
    model = await resolveStep({
      providerId: chatSettings.providerId,
      modelId: chatSettings.modelId,
    });
  }
  if (!model) {
    throw new Error(
      isWebGpuInferenceProviderId(chatSettings?.providerId)
        ? WEBGPU_BLOCKED_FOR_API_INFERENCE_VI
        : "Không tìm thấy mô hình AI. Vui lòng cấu hình nhà cung cấp AI trong Cài đặt.",
    );
  }

  const stepPromptKey = `${role}Prompt` as keyof typeof ctx.settings;
  const customPrompt = ctx.settings[stepPromptKey] as string | undefined;
  const systemPrompt = customPrompt?.trim() || getDefaultPrompt(role as Parameters<typeof getDefaultPrompt>[0]);
  const globalInstruction = chatSettings?.globalSystemInstruction;
  const userInstruction = ctx.stepUserInstructions?.[role]?.trim();

  return {
    model,
    systemPrompt,
    globalInstruction,
    userInstruction,
    abortSignal: ctx.abortSignal,
  };
}

async function readStepOutput(sessionId: string, role: WritingAgentRole): Promise<string | undefined> {
  const result = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, role])
    .first();
  return result?.output ?? undefined;
}

async function writeStepResult(
  sessionId: string,
  role: WritingAgentRole,
  status: "running" | "completed" | "error",
  output?: string,
  error?: string,
): Promise<string> {
  const existing = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, role])
    .first();
  const now = new Date();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.writingStepResults.update(existing.id, {
      status,
      output: output ?? existing.output,
      error,
      completedAt: status === "completed" || status === "error" ? now : undefined,
    });
  } else {
    await db.writingStepResults.add({
      id,
      sessionId,
      role,
      status,
      output,
      error,
      startedAt: now,
      completedAt: status === "completed" ? now : undefined,
    });
  }
  return id;
}

export const PIPELINE_STEPS: StepDescriptor[] = [
  {
    role: "plan",
    humanGate: true,
    async run(ctx) {
      const config = await getAgentConfig(ctx.novelId, "plan", ctx);
      const chapterPlan = await db.chapterPlans.get(ctx.chapterPlanId);

      const result = await runPlannerAgent(
        {
          novelId: ctx.novelId,
          chapterOrder: ctx.chapterOrder,
          chapterPlan: chapterPlan ?? undefined,
        },
        config,
        config,
      );

      const output = JSON.stringify(result);
      await writeStepResult(ctx.sessionId, "plan", "completed", output);

      await db.chapterPlans.update(ctx.chapterPlanId, {
        intent: result.intent,
        directions: result.recommendedOptionIds.length > 0
          ? result.recommendedOptionIds
              .map((id) => result.directions.find((d) => d.id === id))
              .filter(Boolean)
              .map((d) => `${d!.title}: ${d!.description}`)
          : result.directions.slice(0, 2).map((d) => `${d.title}: ${d.description}`),
        updatedAt: new Date(),
      });
    },
  },

  {
    role: "outline",
    humanGate: false,
    async run(ctx) {
      const config = await getAgentConfig(ctx.novelId, "outline", ctx);
      const chapterPlan = await db.chapterPlans.get(ctx.chapterPlanId);
      if (!chapterPlan) throw new Error("Chapter plan not found");

      const retrieved = await buildRetrievedContext(ctx.novelId, ctx.chapterOrder);
      const contextOutput = retrievedContextToAgentOutput(retrieved, ctx.chapterOrder);

      const directions = chapterPlan.directions.length > 0
        ? chapterPlan.directions
        : ["Tiếp tục cốt truyện theo hướng tự nhiên nhất"];

      const plotArcs = await db.plotArcs.where("novelId").equals(ctx.novelId).toArray();
      const intentBlock = formatChapterIntent(
        chapterPlan.intent,
        flattenHookTitles(plotArcs),
      );

      const chapterLength = ctx.settings.chapterLength ?? 3000;
      const outline = await runOutlineAgent(
        contextOutput,
        directions,
        chapterLength,
        config,
        intentBlock,
      );

      await writeStepResult(ctx.sessionId, "outline", "completed", JSON.stringify(outline));

      await db.chapterPlans.update(ctx.chapterPlanId, {
        outline: outline.synopsis,
        scenes: outline.scenes.map((s) => ({
          title: s.title,
          summary: s.summary,
          characters: s.characters,
          location: s.location,
          mood: s.mood,
          keyEvents: s.keyEvents,
        })),
        title: outline.chapterTitle,
        status: "writing",
        updatedAt: new Date(),
      });
    },
  },

  {
    role: "writer",
    humanGate: false,
    async run(ctx) {
      const config = await getAgentConfig(ctx.novelId, "writer", ctx);
      const chapterLength = ctx.settings.chapterLength ?? 3000;

      const retrieved = await buildRetrievedContext(ctx.novelId, ctx.chapterOrder);
      const contextOutput = retrievedContextToAgentOutput(retrieved, ctx.chapterOrder);

      const outlineJson = await readStepOutput(ctx.sessionId, "outline");
      if (!outlineJson) throw new Error("Outline output not found");
      const outline = JSON.parse(outlineJson) as import("@/lib/writing/types").OutlineAgentOutput;
      if (!Array.isArray(outline.scenes)) {
        throw new Error("Giàn ý thiếu danh sách phân cảnh. Chạy lại bước Giàn ý.");
      }

      const chatSettings = await db.chatSettings.get("default");
      const rawCap = ctx.settings.smartWriterMaxToolSteps;
      const maxToolSteps = rawCap != null
        ? Math.min(20, Math.max(5, rawCap))
        : (chatSettings?.maxToolSteps ?? 15);

      config.systemPrompt = config.systemPrompt.replace("{chapterLength}", String(chapterLength));

      const content = await runSmartWriterAgent(
        {
          novelId: ctx.novelId,
          chapterOrder: ctx.chapterOrder,
          contextOutput,
          outline,
        },
        config,
        chapterLength,
        maxToolSteps,
        ctx.onWriterChunk,
        ctx.onWriterActivity,
      );

      if (ctx.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (!content.trim()) {
        throw new Error("Không tạo được nội dung chương (bản rỗng). Chạy lại bước Viết.");
      }

      const resultId = await writeStepResult(ctx.sessionId, "writer", "completed", content);
      ctx.pendingText = content;
      if (!ctx.bestSoFar || content.length > 0) {
        ctx.bestSoFar = { score: 0, writerStepResultId: resultId, pendingText: content };
      }

      await db.chapterPlans.update(ctx.chapterPlanId, {
        status: "written",
        updatedAt: new Date(),
      });
    },
  },

  {
    role: "normalize",
    humanGate: false,
    async run(ctx) {
      if (!ctx.pendingText) {
        const w = await readStepOutput(ctx.sessionId, "writer");
        if (w) ctx.pendingText = w;
      }
      if (!ctx.pendingText) throw new Error("Writer output not found for normalize");

      const config = await getAgentConfig(ctx.novelId, "normalize", ctx);
      const chapterLength = ctx.settings.chapterLength ?? 3000;

      const normalized = await runLengthNormalizer(
        { content: ctx.pendingText, chapterLength },
        config,
      );

      ctx.pendingText = normalized;
      await writeStepResult(ctx.sessionId, "normalize", "completed", normalized);
    },
  },

  {
    role: "observe",
    humanGate: false,
    async run(ctx) {
      if (!ctx.pendingText) {
        const w = await readStepOutput(ctx.sessionId, "writer");
        if (w) ctx.pendingText = w;
      }
      if (!ctx.pendingText) throw new Error("Writer output not found for observe");

      const outlineJson = await readStepOutput(ctx.sessionId, "outline");
      const chapterOutline = outlineJson
        ? JSON.stringify(JSON.parse(outlineJson))
        : undefined;

      const config = await getAgentConfig(ctx.novelId, "observe", ctx);
      const delta = await runObserverAgent(
        {
          chapterOrder: ctx.chapterOrder,
          chapterText: ctx.pendingText,
          snapshot: ctx.snapshot,
          chapterOutline,
        },
        config,
      );

      await writeStepResult(ctx.sessionId, "observe", "completed", JSON.stringify(delta));
    },
  },

  {
    role: "audit",
    humanGate: true,
    async run(ctx) {
      if (!ctx.pendingText) {
        const w = await readStepOutput(ctx.sessionId, "writer");
        if (w) ctx.pendingText = w;
      }
      if (!ctx.pendingText) throw new Error("Writer output not found for audit");

      const config = await getAgentConfig(ctx.novelId, "audit", ctx);
      const plotArcs = await db.plotArcs.where("novelId").equals(ctx.novelId).toArray();

      const audit = await runAuditAgent(
        {
          chapterOrder: ctx.chapterOrder,
          chapterText: ctx.pendingText,
          snapshot: ctx.snapshot,
          plotArcs,
          committedSnapshot: ctx.snapshot,
        },
        config,
      );

      await writeStepResult(ctx.sessionId, "audit", "completed", JSON.stringify(audit));

      await db.chapterPlans.update(ctx.chapterPlanId, {
        status: "reviewed",
        updatedAt: new Date(),
      });

      if (ctx.bestSoFar === null || audit.overallScore > ctx.bestSoFar.score) {
        ctx.bestSoFar = {
          score: audit.overallScore,
          writerStepResultId: ctx.bestSoFar?.writerStepResultId ?? "",
          pendingText: ctx.pendingText,
        };
      }
    },
  },

  {
    role: "revise",
    humanGate: false,
    async run(ctx) {
      if (!ctx.pendingText) {
        const w = await readStepOutput(ctx.sessionId, "writer");
        if (w) ctx.pendingText = w;
      }
      if (!ctx.pendingText) throw new Error("Writer output not found for revise");

      const auditJson = await readStepOutput(ctx.sessionId, "audit");
      if (!auditJson) throw new Error("Audit output not found");
      const audit = JSON.parse(auditJson) as import("@/lib/writing/types").ReviewAgentOutput;

      const config = await getAgentConfig(ctx.novelId, "revise", ctx);
      const revised = await runRewriteAgent(ctx.pendingText, audit, config, ctx.onWriterChunk);

      if (!revised.trim()) throw new Error("Revise produced empty output");

      ctx.pendingText = revised;
      if (ctx.bestSoFar) {
        ctx.bestSoFar = { ...ctx.bestSoFar, pendingText: revised };
      }
      await writeStepResult(ctx.sessionId, "revise", "completed", revised);
    },
  },

  {
    role: "commit",
    humanGate: false,
    async run(ctx) {
      let text = ctx.bestSoFar?.pendingText ?? ctx.pendingText;
      if (!text?.trim()) {
        text =
          (await readStepOutput(ctx.sessionId, "revise")) ||
          (await readStepOutput(ctx.sessionId, "normalize")) ||
          (await readStepOutput(ctx.sessionId, "writer")) ||
          "";
      }
      if (!text?.trim()) throw new Error("No content to commit");

      const outlineJson = await readStepOutput(ctx.sessionId, "outline");
      if (!outlineJson) throw new Error("Outline not found for commit");
      const outline = JSON.parse(outlineJson) as import("@/lib/writing/types").OutlineAgentOutput;

      if (ctx.settings.enablePolish) {
        const polishConfig = await getAgentConfig(ctx.novelId, "commit" as WritingAgentRole, ctx);
        const polishChatSettings = await db.chatSettings.get("default");
        const polishRoleKey = "polishModel" as keyof typeof ctx.settings;
        const polishModelCfg = ctx.settings[polishRoleKey] as
          | { providerId: string; modelId: string }
          | undefined;
        const { resolveStep: rs } = await import("@/lib/ai/resolve-step");
        const polishModel = polishModelCfg
          ? await rs(polishModelCfg)
          : polishConfig.model;
        const polishPromptKey = "polishPrompt" as keyof typeof ctx.settings;
        const polishSysPrompt = (ctx.settings[polishPromptKey] as string | undefined)?.trim() || getDefaultPrompt("polish");
        const polishCfg: AgentConfig = {
          model: polishModel!,
          systemPrompt: polishSysPrompt,
          globalInstruction: polishChatSettings?.globalSystemInstruction,
          abortSignal: ctx.abortSignal,
        };
        const polished = await runPolishAgent(text, polishCfg, ctx.onWriterChunk);
        ctx.pendingText = polished;
        if (ctx.bestSoFar) ctx.bestSoFar = { ...ctx.bestSoFar, pendingText: polished };
      } else {
        ctx.pendingText = text;
      }

      const observeConfig = await getAgentConfig(ctx.novelId, "observe", ctx);

      const chapterPlan = await db.chapterPlans.get(ctx.chapterPlanId);
      if (!chapterPlan) throw new Error("Chapter plan not found");

      // Reuse the observe-step delta instead of re-observing when it already
      // reflects the text being committed: no polish (which would alter text),
      // and the observe ran no earlier than the latest revise.
      let precomputedDelta: StateDelta | undefined;
      if (!ctx.settings.enablePolish) {
        const [obs, rev] = await Promise.all([
          db.writingStepResults.where("[sessionId+role]").equals([ctx.sessionId, "observe"]).first(),
          db.writingStepResults.where("[sessionId+role]").equals([ctx.sessionId, "revise"]).first(),
        ]);
        const observeFresh =
          obs?.status === "completed" &&
          !!obs.output &&
          (!rev ||
            rev.status !== "completed" ||
            (obs.completedAt?.getTime() ?? 0) >= (rev.completedAt?.getTime() ?? 0));
        if (observeFresh) {
          try {
            const parsed = StateDeltaSchema.safeParse(JSON.parse(obs!.output!));
            if (parsed.success && parsed.data.chapter === ctx.chapterOrder) {
              precomputedDelta = parsed.data;
            }
          } catch {
            // fall back to re-observe
          }
        }
      }

      const result = await commitChapterState({
        novelId: ctx.novelId,
        sessionId: ctx.sessionId,
        chapterOrder: ctx.chapterOrder,
        observeConfig,
        chapterSaveData: {
          novelId: ctx.novelId,
          chapterPlan: { chapterId: chapterPlan.chapterId, chapterOrder: ctx.chapterOrder },
          outline,
          content: ctx.pendingText,
        },
        chapterPlanId: ctx.chapterPlanId,
        ...(precomputedDelta ? { precomputedDelta } : {}),
      });

      if (!result.ok) {
        throw new Error(`Commit failed: ${result.error}`);
      }

      ctx.snapshot = result.snapshot;

      const refreshedState = await loadStoryState(ctx.novelId);
      if (refreshedState) ctx.snapshot = refreshedState;

      await writeStepResult(ctx.sessionId, "commit", "completed", result.sceneId);

      await db.writingSessions.update(ctx.sessionId, {
        status: "completed",
        updatedAt: new Date(),
      });
    },
  },
];

export const STEP_INDEX = new Map(PIPELINE_STEPS.map((s, i) => [s.role, i]));

export function getStepAfter(role: WritingAgentRole): WritingAgentRole | null {
  const idx = STEP_INDEX.get(role);
  if (idx === undefined) return null;
  return PIPELINE_STEPS[idx + 1]?.role ?? null;
}

export async function clearStepResult(sessionId: string, role: WritingAgentRole): Promise<void> {
  const existing = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, role])
    .first();
  if (existing) await db.writingStepResults.delete(existing.id);
}
