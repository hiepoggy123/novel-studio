import type { WritingAgentRole, WritingSettings } from "@/lib/db";
import { db } from "@/lib/db";
import { loadStoryState } from "@/lib/writing/state/state-store";
import { bootstrapStoryState } from "@/lib/writing/state/bootstrap";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import { resyncChapterState } from "@/lib/writing/resync-chapter-state";
import { shouldRevise } from "@/lib/writing/revise-loop";
import type { ReviewAgentOutput } from "@/lib/writing/types";
import type { PipelineCtx } from "./pipeline-ctx";
import {
  PIPELINE_STEPS,
  STEP_INDEX,
  getStepAfter,
  clearStepResult,
} from "./steps";

export type PipelineResult =
  | "awaiting-input"
  | "completed"
  | "error"
  | "stale-state";

export interface RunPipelineOptions {
  novelId: string;
  sessionId: string;
  abortSignal?: AbortSignal;
  onStepStart?: (role: WritingAgentRole) => void;
  onStepComplete?: (role: WritingAgentRole) => void;
  onWriterChunk?: (text: string) => void;
  onWriterActivity?: (label: string) => void;
  stepUserInstructions?: Partial<Record<WritingAgentRole, string>>;
  handsFree?: boolean;
}

function outlineOutputHasScenes(output: string | undefined): boolean {
  if (!output) return false;
  try {
    const parsed = JSON.parse(output) as { scenes?: unknown };
    return Array.isArray(parsed.scenes) && parsed.scenes.length > 0;
  } catch {
    return false;
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "ResponseAborted" || err.name === "TimeoutError") {
      return true;
    }
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause !== undefined) return isAbortError(cause);
  }
  return false;
}

function computeStateHash(lastAppliedChapter: number, snapshotUpdatedAt: Date): string {
  const payload = JSON.stringify({ lastAppliedChapter, snapshotUpdatedAt: snapshotUpdatedAt.toISOString() });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const chr = payload.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

async function ensureBootstrap(
  novelId: string,
): Promise<{ snapshot: import("@/lib/writing/state/schemas").StoryStateSnapshot; warning?: string }> {
  const existing = await loadStoryState(novelId);
  if (existing) return { snapshot: existing };

  const [chapters, characters, plotArcs] = await Promise.all([
    db.chapters.where("novelId").equals(novelId).sortBy("order"),
    db.characters.where("novelId").equals(novelId).toArray(),
    db.plotArcs.where("novelId").equals(novelId).toArray(),
  ]);

  const novel = await db.novels.get(novelId);

  const snapshot = bootstrapStoryState({
    chapters: chapters.map((c) => ({
      id: c.id,
      order: c.order,
      summary: c.summary,
      characterIds: c.characterIds,
    })),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
    })),
    plotArcs: plotArcs.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      status: a.status,
      plotPoints: a.plotPoints,
    })),
    characterArcs: [],
    analysisStatus: novel?.analysisStatus,
    worldFacts: novel?.worldOverview,
  });

  await db.storyStates.put({ id: novelId, ...snapshot });

  const warning = snapshot.incomplete
    ? `Trạng thái bootstrap chưa hoàn tất: ${(snapshot.warnings ?? []).join("; ")}`
    : undefined;

  return { snapshot, warning };
}

async function lazySyncEditedChapters(
  novelId: string,
  upToOrder: number,
  sessionId: string,
  snapshot: import("@/lib/writing/state/schemas").StoryStateSnapshot,
  agentConfig: import("@/lib/writing/types").AgentConfig,
): Promise<import("@/lib/writing/state/schemas").StoryStateSnapshot> {
  const chapters = await db.chapters
    .where("novelId")
    .equals(novelId)
    .toArray();

  const relevantChapters = chapters.filter(
    (c) => c.order < upToOrder && snapshot.chapterHashes[String(c.order)] !== undefined,
  );

  let current = snapshot;
  for (const chapter of relevantChapters) {
    const activeScenes = await db.scenes
      .where("[chapterId+isActive]")
      .equals([chapter.id, 1])
      .toArray();

    if (activeScenes.length === 0) continue;

    const { contentHash } = concatActiveScenes(
      activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
    );

    const storedHash = current.chapterHashes[String(chapter.order)];
    if (storedHash === contentHash) continue;

    const chapterPlan = await db.chapterPlans
      .where("[novelId+chapterOrder]")
      .equals([novelId, chapter.order])
      .first();

    if (!chapterPlan) continue;

    const result = await resyncChapterState({
      novelId,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      sessionId,
      config: agentConfig,
      chapterPlanId: chapterPlan.id,
      outline: {
        chapterTitle: chapterPlan.title ?? "",
        synopsis: chapterPlan.outline ?? "",
        scenes: chapterPlan.scenes,
        totalWordCountTarget: 3000,
      },
    });

    if (result.action === "resynced") {
      current = result.snapshot;
    }
  }

  return current;
}

async function getObserveConfig(
  novelId: string,
  settings: WritingSettings,
  abortSignal?: AbortSignal,
): Promise<import("@/lib/writing/types").AgentConfig> {
  const { db: database } = await import("@/lib/db");
  const { resolveStep } = await import("@/lib/ai/resolve-step");
  const {
    WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
    isWebGpuInferenceProviderId,
  } = await import("@/lib/ai/api-inference");
  const { getDefaultPrompt } = await import("@/lib/writing/prompts");

  const chatSettings = await database.chatSettings.get("default");
  const modelCfg = settings.observeModel;
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
  return {
    model,
    systemPrompt: settings.observePrompt?.trim() || getDefaultPrompt("observe"),
    globalInstruction: chatSettings?.globalSystemInstruction,
    abortSignal,
  };
}

async function rehydrateBestSoFar(
  sessionId: string,
): Promise<import("./pipeline-ctx").BestSoFar | null> {
  const [observeResult, writerResult, normalizeResult, reviseResult] =
    await Promise.all([
      db.writingStepResults.where("[sessionId+role]").equals([sessionId, "observe"]).first(),
      db.writingStepResults.where("[sessionId+role]").equals([sessionId, "writer"]).first(),
      db.writingStepResults.where("[sessionId+role]").equals([sessionId, "normalize"]).first(),
      db.writingStepResults.where("[sessionId+role]").equals([sessionId, "revise"]).first(),
    ]);

  if (observeResult?.status !== "completed" || !writerResult?.output) return null;

  let score = 0;
  if (observeResult.output) {
    try {
      const parsed = JSON.parse(observeResult.output) as { score?: number };
      score = typeof parsed.score === "number" ? parsed.score : 0;
    } catch {
      score = 0;
    }
  }

  const latestText =
    reviseResult?.status === "completed" && reviseResult.output?.trim()
      ? reviseResult.output
      : normalizeResult?.status === "completed" && normalizeResult.output?.trim()
        ? normalizeResult.output
        : writerResult.output;

  return {
    score,
    writerStepResultId: writerResult.id,
    pendingText: latestText,
  };
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const {
    novelId,
    sessionId,
    abortSignal,
    onStepStart,
    onStepComplete,
    onWriterChunk,
    onWriterActivity,
    stepUserInstructions,
    handsFree: handsFreeOption,
  } = options;

  const session = await db.writingSessions.get(sessionId);
  if (!session) throw new Error("Writing session not found");

  const chapterPlan = await db.chapterPlans.get(session.chapterPlanId);
  if (!chapterPlan) throw new Error("Chapter plan not found");

  const settings = await db.writingSettings.get(novelId) ?? {
    id: novelId,
    chapterLength: 3000,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WritingSettings;

  const handsFree = handsFreeOption ?? Boolean(settings.noAskingMode);

  const { snapshot: rawSnapshot, warning: bootstrapWarning } = await ensureBootstrap(novelId);

  const currentStateHash = computeStateHash(rawSnapshot.lastAppliedChapter, rawSnapshot.updatedAt);
  if (session.stateHash && session.stateHash !== currentStateHash && session.currentStep !== "plan") {
    return "stale-state";
  }

  const observeConfig = await getObserveConfig(novelId, settings, abortSignal);
  const snapshot = await lazySyncEditedChapters(
    novelId,
    chapterPlan.chapterOrder,
    sessionId,
    rawSnapshot,
    observeConfig,
  );

  const newStateHash = computeStateHash(snapshot.lastAppliedChapter, snapshot.updatedAt);
  await db.writingSessions.update(sessionId, {
    status: "active",
    stateHash: newStateHash,
    updatedAt: new Date(),
  });

  await db.chapterPlans.update(session.chapterPlanId, {
    status: "writing",
    updatedAt: new Date(),
  });

  const bestSoFar = await rehydrateBestSoFar(sessionId);

  const ctx: PipelineCtx = {
    novelId,
    sessionId,
    chapterPlanId: session.chapterPlanId,
    chapterOrder: chapterPlan.chapterOrder,
    settings,
    snapshot,
    bestSoFar,
    pendingText: "",
    bootstrapWarning,
    retryCount: 0,
    handsFree,
    abortSignal,
    onStepStart,
    onStepComplete,
    onWriterChunk,
    onWriterActivity,
    stepUserInstructions,
  };

  let currentRole = session.currentStep;

  const outlineIdx = STEP_INDEX.get("outline") ?? 1;
  if ((STEP_INDEX.get(currentRole) ?? 0) > outlineIdx) {
    const outlineRes = await db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, "outline"])
      .first();
    if (!outlineRes || !outlineOutputHasScenes(outlineRes.output)) {
      if (outlineRes) await db.writingStepResults.delete(outlineRes.id);
      currentRole = "outline";
      await db.writingSessions.update(sessionId, { currentStep: "outline", updatedAt: new Date() });
    }
  }

  while (true) {
    const stepDef = PIPELINE_STEPS[STEP_INDEX.get(currentRole) ?? -1];
    if (!stepDef) break;

    const existing = await db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, currentRole])
      .first();

    if (existing?.status === "completed") {
      if (currentRole === "writer" && !existing.output?.trim()) {
        await db.writingStepResults.delete(existing.id);
      } else if (currentRole === "outline" && !outlineOutputHasScenes(existing.output)) {
        await db.writingStepResults.delete(existing.id);
      } else if (currentRole === "plan" && !handsFree && stepDef.humanGate) {
        return "awaiting-input";
      } else if (currentRole === "audit" && !handsFree && stepDef.humanGate) {
        return "awaiting-input";
      } else {
        if (currentRole === "writer" && existing.output) {
          ctx.pendingText = existing.output;
        }
        if (currentRole === "normalize" && existing.output) {
          ctx.pendingText = existing.output;
        }
        if (currentRole === "revise" && existing.output) {
          ctx.pendingText = existing.output;
        }
        const next = getStepAfter(currentRole);
        if (!next) break;
        currentRole = next;
        await db.writingSessions.update(sessionId, { currentStep: currentRole, updatedAt: new Date() });
        continue;
      }
    }

    if (existing?.status === "error") {
      await db.writingStepResults.delete(existing.id);
    }

    if (existing?.status === "running") {
      await db.writingStepResults.delete(existing.id);
    }

    try {
      onStepStart?.(currentRole);

      await db.writingStepResults
        .where("[sessionId+role]")
        .equals([sessionId, currentRole])
        .first()
        .then(async (r) => {
          if (!r) {
            await db.writingStepResults.add({
              id: crypto.randomUUID(),
              sessionId,
              role: currentRole,
              status: "running",
              startedAt: new Date(),
            });
          } else {
            await db.writingStepResults.update(r.id, { status: "running" });
          }
        });

      await stepDef.run(ctx);

      onStepComplete?.(currentRole);

      if (currentRole === "audit" && handsFree) {
        const auditJson = await db.writingStepResults
          .where("[sessionId+role]")
          .equals([sessionId, "audit"])
          .first();
        if (auditJson?.output) {
          const audit = JSON.parse(auditJson.output) as ReviewAgentOutput;
          const doRevise = shouldRevise(audit, ctx.bestSoFar?.score ?? 0, settings, ctx.retryCount);

          if (doRevise) {
            ctx.retryCount++;
            await clearStepResult(sessionId, "revise");
            await clearStepResult(sessionId, "observe");
            await clearStepResult(sessionId, "audit");

            currentRole = "revise";
            await db.writingSessions.update(sessionId, { currentStep: "revise", updatedAt: new Date() });
            continue;
          }
        }
      }

      if (!handsFree && stepDef.humanGate) {
        return "awaiting-input";
      }

      const next = getStepAfter(currentRole);
      if (!next) break;
      currentRole = next;
      await db.writingSessions.update(sessionId, { currentStep: currentRole, updatedAt: new Date() });
    } catch (err) {
      if (abortSignal?.aborted || isAbortError(err)) {
        const stuck = await db.writingStepResults
          .where("[sessionId+role]")
          .equals([sessionId, currentRole])
          .first();
        if (stuck?.status === "running") {
          await db.writingStepResults.delete(stuck.id);
        }
        await db.writingSessions.update(sessionId, { status: "paused", updatedAt: new Date() });
        return "awaiting-input";
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      const stuck = await db.writingStepResults
        .where("[sessionId+role]")
        .equals([sessionId, currentRole])
        .first();
      if (stuck) {
        await db.writingStepResults.update(stuck.id, {
          status: "error",
          error: errorMsg,
          completedAt: new Date(),
        });
      }
      await db.writingSessions.update(sessionId, { status: "error", updatedAt: new Date() });
      return "error";
    }
  }

  await db.writingSessions.update(sessionId, { status: "completed", updatedAt: new Date() });
  return "completed";
}

export async function repairSessionIfWriterOutputEmpty(sessionId: string): Promise<void> {
  const writerRes = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, "writer"])
    .first();
  if (!writerRes || writerRes.status !== "completed" || !!writerRes.output?.trim()) return;

  await db.writingStepResults.delete(writerRes.id);
  const sess = await db.writingSessions.get(sessionId);
  if (!sess) return;

  const isLateStep = (["normalize", "observe", "audit", "revise", "commit"] as WritingAgentRole[])
    .includes(sess.currentStep);

  await db.writingSessions.update(sessionId, {
    currentStep: isLateStep ? "writer" : sess.currentStep,
    status: "active",
    updatedAt: new Date(),
  });
}
