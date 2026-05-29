"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PipelineStepConfig } from "@/components/writing/pipeline-step-config";
import { ChapterPreview } from "@/components/writing/chapter-preview";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import type { WritingAgentRole } from "@/lib/db";

interface ContentTabPanelProps {
  novelId: string;
  sessionId: string | undefined;
  currentStep: WritingAgentRole | undefined;
  sessionStatus: "active" | "paused" | "completed" | "error" | undefined;
  outlineStepComplete: boolean;
  writerOutputDone: boolean;
  isRewriting: boolean;
  scrollClass: string;
  onStartPipeline: () => void;
  onRerunWriter: () => void;
}

export function ContentTabPanel({
  novelId,
  sessionId,
  currentStep,
  sessionStatus,
  outlineStepComplete,
  writerOutputDone,
  isRewriting,
  scrollClass,
  onStartPipeline,
  onRerunWriter,
}: ContentTabPanelProps) {
  const { isRunning, pipelinePreRunRole } = useWritingPipelineStore();

  const sessionNeedsResume =
    sessionStatus === "paused" || sessionStatus === "error";

  const showWriterSetup =
    !writerOutputDone &&
    !isRunning &&
    sessionId &&
    outlineStepComplete &&
    currentStep !== "plan" &&
    currentStep !== "outline" &&
    (currentStep === "writer" ||
      currentStep === "audit" ||
      sessionStatus === "error");

  if (pipelinePreRunRole === "writer") {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <PipelineStepConfig
            novelId={novelId}
            role="writer"
            instructionKey="writer"
            title="Tạo lại nội dung"
            description="Chỉnh cấu hình rồi chạy lại bước viết chương."
            runLabel="Chạy AI"
            onRun={onStartPipeline}
            disabled={isRunning}
          />
        </div>
      </ScrollArea>
    );
  }

  if (showWriterSetup || (sessionNeedsResume && currentStep === "writer")) {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <PipelineStepConfig
            novelId={novelId}
            role="writer"
            instructionKey="writer"
            title="Viết chương"
            description="Bước Viết chưa có nội dung hợp lệ. Cấu hình model và prompt rồi chạy lại."
            runLabel="Chạy pipeline (tiếp tục)"
            onRun={onStartPipeline}
            disabled={isRunning || !sessionId}
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className={`${scrollClass} flex shrink-0 flex-col overflow-hidden`}>
      <ChapterPreview
        sessionId={sessionId}
        assumeStreaming={isRunning && currentStep === "writer"}
        isRewriting={isRewriting}
        onRegenerateAction={
          sessionId && !isRunning && !isRewriting ? onRerunWriter : undefined
        }
      />
    </div>
  );
}
