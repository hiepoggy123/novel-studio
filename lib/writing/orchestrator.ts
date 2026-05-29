export {
  runPipeline as runWritingPipeline,
  repairSessionIfWriterOutputEmpty,
  type RunPipelineOptions as WritingPipelineOptions,
  type PipelineResult,
} from "./pipeline/run-pipeline";

export type { RewriteOptions } from "./types";

export async function runRewriteStep(
  options: import("./types").RewriteOptions,
): Promise<"completed" | "error"> {
  const { db } = await import("@/lib/db");
  const { resolveStep } = await import("@/lib/ai/resolve-step");
  const {
    WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
    isWebGpuInferenceProviderId,
  } = await import("@/lib/ai/api-inference");
  const { getDefaultPrompt } = await import("@/lib/writing/prompts");
  const { runRewriteAgent } = await import("./agents/rewrite-agent");

  const { novelId, sessionId, abortSignal, onChunk, userInstruction, targetIssueIndices } = options;

  const writerOutput = await (async () => {
    const r = await db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, "writer"])
      .first();
    return r?.output ?? undefined;
  })();

  const auditJson = await (async () => {
    const r = await db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, "audit"])
      .first();
    return r?.output ?? undefined;
  })();

  if (!writerOutput || !auditJson) {
    throw new Error("Writer and audit outputs required for rewrite");
  }

  const review = JSON.parse(auditJson) as import("./types").ReviewAgentOutput;

  const existing = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, "revise"])
    .first();
  if (existing) await db.writingStepResults.delete(existing.id);

  const now = new Date();
  const resultId = crypto.randomUUID();
  await db.writingStepResults.add({
    id: resultId,
    sessionId,
    role: "revise",
    status: "running",
    startedAt: now,
  });

  try {
    const settings = await db.writingSettings.get(novelId);
    const chatSettings = await db.chatSettings.get("default");
    const modelCfg = settings?.reviseModel;
    let model = modelCfg ? await resolveStep(modelCfg) : undefined;
    if (!model && chatSettings?.providerId && chatSettings?.modelId) {
      model = await resolveStep({ providerId: chatSettings.providerId, modelId: chatSettings.modelId });
    }
    if (!model) {
      throw new Error(
        isWebGpuInferenceProviderId(chatSettings?.providerId)
          ? WEBGPU_BLOCKED_FOR_API_INFERENCE_VI
          : "Không tìm thấy mô hình AI.",
      );
    }

    const systemPrompt = settings?.revisePrompt?.trim() || getDefaultPrompt("revise");
    const config: import("./types").AgentConfig = {
      model,
      systemPrompt,
      globalInstruction: chatSettings?.globalSystemInstruction,
      userInstruction: userInstruction?.trim(),
      abortSignal,
    };

    const rewritten = await runRewriteAgent(
      writerOutput,
      review,
      config,
      onChunk,
      targetIssueIndices != null ? { targetIssueIndices } : undefined,
    );

    await db.writingStepResults.update(resultId, {
      status: "completed",
      output: rewritten,
      completedAt: new Date(),
    });
    return "completed";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      await db.writingStepResults.update(resultId, { status: "error", error: "Aborted" });
      return "error";
    }
    const msg = err instanceof Error ? err.message : String(err);
    await db.writingStepResults.update(resultId, { status: "error", error: msg, completedAt: new Date() });
    return "error";
  }
}
