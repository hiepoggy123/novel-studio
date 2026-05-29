"use client";

import { useCallback, useState } from "react";
import { db } from "@/lib/db";
import type { WritingAgentRole } from "@/lib/db";
import {
  createWritingSession,
  getOrCreateWritingSettings,
  resetWritingSessionProgress,
  updateChapterPlan,
  updateWritingSession,
} from "@/lib/hooks";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import { runWritingPipeline } from "@/lib/writing";
import type { OutlineAgentOutput, OutlineScene } from "@/lib/writing/types";
import type { PipelineResult } from "@/lib/writing/pipeline/run-pipeline";
import { toast } from "sonner";

interface Controls {
  novelId: string;
  activeSessionId: string | undefined;
  activeSessionChapterPlanId: string | undefined;
  activeSessionStatus: "active" | "paused" | "completed" | "error" | undefined;
  effectivePlanId: string | null;
  nextPlanId: string | null;
  nextPlanOrder: number | null;
  outlineOutput: OutlineAgentOutput | null;
  chapterPlanIds: string[];
  savedPlanCount: number;
  totalPlanCount: number;
  onSelectPlan: (id: string) => void;
  setActivePanel: (panel: "pipeline" | "outline" | "content" | "observe" | "review") => void;
  setStaleWarning: (v: boolean) => void;
}

export function usePipelineControls({
  novelId,
  activeSessionId,
  activeSessionChapterPlanId,
  activeSessionStatus,
  effectivePlanId,
  nextPlanId,
  nextPlanOrder,
  outlineOutput,
  chapterPlanIds,
  savedPlanCount,
  totalPlanCount,
  onSelectPlan,
  setActivePanel,
  setStaleWarning,
}: Controls) {
  const {
    startPipeline,
    pausePipeline,
    clearStreamingContent,
    clearWriterActivityLabel,
    appendStreamingContent,
    setPipelinePreRunRole,
  } = useWritingPipelineStore();

  const [isRewriting, setIsRewriting] = useState(false);
  const [isGeneratingPlans, setIsGeneratingPlans] = useState(false);

  const handleStartPipeline = useCallback(
    async (planId?: string): Promise<PipelineResult | undefined> => {
      setPipelinePreRunRole(null);
      const targetPlanId = planId ?? effectivePlanId ?? nextPlanId;
      if (!targetPlanId) return;

      let sessionId = activeSessionId;
      if (!sessionId) {
        await getOrCreateWritingSettings(novelId);
        sessionId = await createWritingSession({
          novelId,
          chapterPlanId: targetPlanId,
          currentStep: "plan",
          status: "active",
        });
      }

      const controller = startPipeline(sessionId);
      clearStreamingContent();

      const ins = useWritingPipelineStore.getState().stepUserInstructions;
      const roles: WritingAgentRole[] = ["plan", "outline", "writer", "normalize", "observe", "audit", "revise", "commit"];
      const stepUserInstructions: Partial<Record<WritingAgentRole, string>> = {};
      for (const role of roles) {
        const v = ins[role]?.trim();
        if (v) stepUserInstructions[role] = v;
      }

      const result = await runWritingPipeline({
        novelId,
        sessionId,
        abortSignal: controller.signal,
        stepUserInstructions,
        onStepStart: (role) => {
          if (role === "plan") setActivePanel("pipeline");
          if (role === "writer") setActivePanel("content");
        },
        onStepComplete: (role) => {
          if (role === "plan") setActivePanel("pipeline");
          else if (role === "outline") setActivePanel("outline");
          else if (role === "writer") {
            useWritingPipelineStore.getState().clearWriterActivityLabel();
            setActivePanel("review");
          } else if (role === "audit") setActivePanel("review");
        },
        onWriterChunk: (chunk) => appendStreamingContent(chunk),
        onWriterActivity: (label) => {
          useWritingPipelineStore.getState().setWriterActivityLabel(label);
        },
      });

      useWritingPipelineStore.getState().abortController = null;
      useWritingPipelineStore.getState().clearWriterActivityLabel();
      useWritingPipelineStore.setState({ isRunning: false });

      if (result === "awaiting-input") {
        const session = await db.writingSessions.get(sessionId!);
        if (session) {
          const planDone = (await db.writingStepResults.where("[sessionId+role]").equals([sessionId!, "plan"]).first())?.status === "completed";
          if (session.currentStep === "plan") { setActivePanel("pipeline"); setPipelinePreRunRole(planDone ? null : "plan"); }
          else if (session.currentStep === "outline") { setActivePanel("outline"); setPipelinePreRunRole(null); }
          else if (session.currentStep === "audit") { setActivePanel("review"); setPipelinePreRunRole(null); }
          else if (session.currentStep === "writer") { setActivePanel("content"); setPipelinePreRunRole(null); }
          else { setActivePanel("pipeline"); setPipelinePreRunRole(null); }
        }
      } else if (result === "stale-state") {
        setStaleWarning(true);
      } else if (result === "completed") {
        setActivePanel("review");
      }

      return result;
    },
    [novelId, activeSessionId, effectivePlanId, nextPlanId, startPipeline, clearStreamingContent, appendStreamingContent, setActivePanel, setPipelinePreRunRole, setStaleWarning],
  );

  const resetStepsFromOnly = useCallback(async (fromStep: WritingAgentRole, opts?: { clearDirections?: boolean; clearOutline?: boolean }) => {
    if (!activeSessionId || !activeSessionChapterPlanId) return;
    const stepsToDelete: WritingAgentRole[] = ["plan", "outline", "writer", "normalize", "observe", "audit", "revise", "commit"];
    const fromIdx = stepsToDelete.indexOf(fromStep);
    for (const role of stepsToDelete.slice(fromIdx)) {
      const result = await db.writingStepResults.where("[sessionId+role]").equals([activeSessionId, role]).first();
      if (result) await db.writingStepResults.delete(result.id);
    }
    if (opts?.clearDirections || opts?.clearOutline) {
      await db.chapterPlans.update(activeSessionChapterPlanId, {
        ...(opts.clearDirections ? { directions: [] } : {}),
        ...(opts.clearOutline ? { outline: undefined, scenes: [] } : {}),
        status: "writing",
        updatedAt: new Date(),
      });
    }
    await updateWritingSession(activeSessionId, { currentStep: fromStep });
    if (fromStep === "writer") clearStreamingContent();
  }, [activeSessionId, activeSessionChapterPlanId, clearStreamingContent]);

  const handleRerunPlan = useCallback(async () => {
    await resetStepsFromOnly("plan", { clearDirections: true, clearOutline: true });
    clearStreamingContent();
    setPipelinePreRunRole("plan");
    setActivePanel("pipeline");
  }, [resetStepsFromOnly, clearStreamingContent, setPipelinePreRunRole, setActivePanel]);

  const handleRerunOutline = useCallback(async () => {
    await resetStepsFromOnly("outline", { clearOutline: true });
    setPipelinePreRunRole("outline");
    setActivePanel("outline");
  }, [resetStepsFromOnly, setPipelinePreRunRole, setActivePanel]);

  const handleRerunWriter = useCallback(async () => {
    await resetStepsFromOnly("writer");
    setPipelinePreRunRole("writer");
    setActivePanel("content");
  }, [resetStepsFromOnly, setPipelinePreRunRole, setActivePanel]);

  const handleRerunAudit = useCallback(async () => {
    await resetStepsFromOnly("audit");
    setPipelinePreRunRole("audit");
    setActivePanel("review");
  }, [resetStepsFromOnly, setPipelinePreRunRole, setActivePanel]);

  const handleDirectionConfirm = useCallback(async (directions: string[]) => {
    if (!activeSessionId || !activeSessionChapterPlanId) return;
    await updateChapterPlan(activeSessionChapterPlanId, { directions });
    await updateWritingSession(activeSessionId, { currentStep: "outline" });
    setActivePanel("outline");
    setPipelinePreRunRole(null);
    void handleStartPipeline();
  }, [activeSessionId, activeSessionChapterPlanId, setActivePanel, setPipelinePreRunRole, handleStartPipeline]);

  const handleOutlineApprove = useCallback(async (scenes: OutlineScene[]) => {
    if (!activeSessionId || !activeSessionChapterPlanId || !outlineOutput) return;
    await updateChapterPlan(activeSessionChapterPlanId, {
      outline: outlineOutput.synopsis,
      scenes: scenes.map((s) => ({ title: s.title, summary: s.summary, characters: s.characters, location: s.location, mood: s.mood })),
      title: outlineOutput.chapterTitle,
    });
    await updateWritingSession(activeSessionId, { currentStep: "writer" });
    setActivePanel("content");
    setPipelinePreRunRole(null);
  }, [activeSessionId, activeSessionChapterPlanId, outlineOutput, setActivePanel, setPipelinePreRunRole]);

  const selectNextPlan = useCallback(() => {
    if (!effectivePlanId || chapterPlanIds.length === 0) return;
    const currentIdx = chapterPlanIds.indexOf(effectivePlanId);
    const next = chapterPlanIds.find((_, i) => i > currentIdx);
    if (next) { onSelectPlan(next); setActivePanel("pipeline"); }
    else { setActivePanel("pipeline"); }
  }, [chapterPlanIds, effectivePlanId, onSelectPlan, setActivePanel]);

  const handleConfirmRefreshSession = useCallback(async () => {
    if (!activeSessionId) return;
    pausePipeline();
    try {
      await resetWritingSessionProgress(activeSessionId);
      clearStreamingContent();
      clearWriterActivityLabel();
      setActivePanel("pipeline");
      setPipelinePreRunRole(null);
      toast.success("Đã làm mới phiên viết");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể làm mới phiên");
    }
  }, [activeSessionId, pausePipeline, clearStreamingContent, clearWriterActivityLabel, setActivePanel, setPipelinePreRunRole]);

  const handleSaveChapter = useCallback(async () => {
    if (!activeSessionId) return;
    setActivePanel("observe");
    await updateWritingSession(activeSessionId, { currentStep: "commit" });
    const result = await handleStartPipeline();
    if (result === "completed") selectNextPlan();
  }, [activeSessionId, handleStartPipeline, selectNextPlan, setActivePanel]);

  const handleStaleRerun = useCallback(async () => {
    if (!activeSessionId) return;
    await updateWritingSession(activeSessionId, { currentStep: "plan", stateHash: "" });
    setStaleWarning(false);
    void handleStartPipeline();
  }, [activeSessionId, handleStartPipeline, setStaleWarning]);

  const handleStaleContinue = useCallback(async () => {
    if (!activeSessionId) return;
    await updateWritingSession(activeSessionId, { stateHash: "" });
    setStaleWarning(false);
    void handleStartPipeline();
  }, [activeSessionId, handleStartPipeline, setStaleWarning]);

  const handleRewrite = useCallback(async (targetIndices?: number[]) => {
    if (!activeSessionId) return;
    setIsRewriting(true);
    setActivePanel("content");
    clearStreamingContent();
    try {
      const { runRewriteStep } = await import("@/lib/writing/orchestrator");
      const rewriteHint = useWritingPipelineStore.getState().stepUserInstructions.rewrite?.trim();
      const outcome = await runRewriteStep({
        novelId,
        sessionId: activeSessionId,
        onChunk: (chunk) => appendStreamingContent(chunk),
        ...(rewriteHint ? { userInstruction: rewriteHint } : {}),
        ...(targetIndices != null && targetIndices.length > 0 ? { targetIssueIndices: targetIndices } : {}),
      });
      if (outcome === "completed") {
        toast.success("Đã viết lại chương");
        useWritingPipelineStore.getState().requestReviewCompareFocus();
        setActivePanel("review");
      } else {
        toast.error("Viết lại thất bại");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") toast.error(err.message);
    } finally {
      clearStreamingContent();
      setIsRewriting(false);
    }
  }, [activeSessionId, novelId, clearStreamingContent, appendStreamingContent, setActivePanel]);

  const runGenerateMorePlans = useCallback(async (userInstruction?: string) => {
    const pct = totalPlanCount > 0 ? (savedPlanCount / totalPlanCount) * 100 : 0;
    if (pct < 70) {
      toast.warning(`Mới lưu ${savedPlanCount}/${totalPlanCount} chương (${Math.round(pct)}%). Nên lưu ít nhất 70% trước khi tạo thêm.`);
      return;
    }
    setIsGeneratingPlans(true);
    try {
      const { generateFromExisting } = await import("@/lib/writing/auto-generate");
      await generateFromExisting(novelId, { userInstruction: userInstruction?.trim() || undefined });
      toast.success("Đã tạo thêm kế hoạch chương mới");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setIsGeneratingPlans(false);
    }
  }, [novelId, savedPlanCount, totalPlanCount]);

  return {
    isRewriting,
    isGeneratingPlans,
    handleStartPipeline,
    handleRerunPlan,
    handleRerunOutline,
    handleRerunWriter,
    handleRerunAudit,
    handleDirectionConfirm,
    handleOutlineApprove,
    handleSaveChapter,
    handleStaleRerun,
    handleStaleContinue,
    handleRewrite,
    handleConfirmRefreshSession,
    runGenerateMorePlans,
    nextPlanId,
    nextPlanOrder,
    activeSessionStatus,
  };
}
