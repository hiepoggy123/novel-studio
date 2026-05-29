"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PipelineStepConfig } from "@/components/writing/pipeline-step-config";
import { ReviewPanel } from "@/components/writing/review-panel";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import { useStepResult } from "@/lib/hooks";
import { AuditView } from "./audit-view";

interface ReviewTabPanelProps {
  novelId: string;
  sessionId: string | undefined;
  writerOutputDone: boolean;
  reviewOutputDone: boolean;
  isRewriting: boolean;
  scrollClass: string;
  onStartPipeline: () => void;
  onRerunAudit: () => void;
  onRewrite: (targetIndices?: number[]) => void;
  onSaveChapter: () => void;
}

export function ReviewTabPanel({
  novelId,
  sessionId,
  writerOutputDone,
  reviewOutputDone,
  isRewriting,
  scrollClass,
  onStartPipeline,
  onRerunAudit,
  onRewrite,
  onSaveChapter,
}: ReviewTabPanelProps) {
  const { isRunning, pipelinePreRunRole } = useWritingPipelineStore();
  const reviseResult = useStepResult(sessionId, "revise");
  const hasRewrite = reviseResult?.status === "completed";

  if (pipelinePreRunRole === "audit") {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <PipelineStepConfig
            novelId={novelId}
            role="audit"
            instructionKey="audit"
            title="Tạo lại đánh giá"
            description="Chỉnh cấu hình rồi chạy lại bước đánh giá."
            runLabel="Chạy AI"
            onRun={onStartPipeline}
            disabled={isRunning}
          />
        </div>
      </ScrollArea>
    );
  }

  if (writerOutputDone && !reviewOutputDone && !isRunning && sessionId) {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <PipelineStepConfig
            novelId={novelId}
            role="audit"
            instructionKey="audit"
            title="Đánh giá chương"
            description="Cấu hình model và yêu cầu trước khi AI đánh giá bản nháp."
            runLabel="Chạy pipeline (tiếp tục)"
            onRun={onStartPipeline}
            disabled={isRunning || !sessionId}
          />
        </div>
      </ScrollArea>
    );
  }

  if (reviewOutputDone && hasRewrite) {
    return (
      <div className={`${scrollClass} flex flex-col overflow-hidden`}>
        <ReviewPanel
          sessionId={sessionId}
          onRewriteAction={onRewrite}
          onSaveAction={onSaveChapter}
          onRegenerateReviewAction={
            sessionId && !isRunning ? onRerunAudit : undefined
          }
          isRewriting={isRewriting}
        />
      </div>
    );
  }

  if (reviewOutputDone) {
    return (
      <div className={`${scrollClass} flex flex-col overflow-hidden`}>
        <AuditView
          sessionId={sessionId}
          onTargetedRevise={(indices) => onRewrite(indices.length > 0 ? indices : undefined)}
          isRevising={isRewriting}
        />
        <div className="border-t px-3 py-3 shrink-0 flex gap-2">
          <button
            onClick={onSaveChapter}
            disabled={isRunning || isRewriting}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Lưu chương
          </button>
          <button
            onClick={onRerunAudit}
            disabled={isRunning || isRewriting}
            className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Đánh giá lại"
          >
            Đánh giá lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={scrollClass}>
      <div className="p-4">
        <ReviewPanel
          sessionId={sessionId}
          onRewriteAction={onRewrite}
          onSaveAction={onSaveChapter}
          onRegenerateReviewAction={
            sessionId && !isRunning ? onRerunAudit : undefined
          }
          isRewriting={isRewriting}
        />
      </div>
    </ScrollArea>
  );
}
