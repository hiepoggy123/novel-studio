"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PipelineStepConfig } from "@/components/writing/pipeline-step-config";
import { OutlineEditor } from "@/components/writing/outline-editor";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import type { OutlineAgentOutput, OutlineScene } from "@/lib/writing/types";
import type { WritingAgentRole } from "@/lib/db";
import { Loader2Icon } from "lucide-react";

interface OutlineTabPanelProps {
  novelId: string;
  sessionId: string | undefined;
  currentStep: WritingAgentRole | undefined;
  outlineOutput: OutlineAgentOutput | null;
  scrollClass: string;
  onApprove: (scenes: OutlineScene[]) => void;
  onRegenerate: () => void;
  onStartPipeline: () => void;
}

export function OutlineTabPanel({
  novelId,
  sessionId,
  currentStep,
  outlineOutput,
  scrollClass,
  onApprove,
  onRegenerate,
  onStartPipeline,
}: OutlineTabPanelProps) {
  const { isRunning, pipelinePreRunRole } = useWritingPipelineStore();

  if (pipelinePreRunRole === "outline") {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <PipelineStepConfig
            novelId={novelId}
            role="outline"
            instructionKey="outline"
            title="Tạo lại giàn ý"
            description="Chỉnh cấu hình rồi chạy lại bước giàn ý."
            runLabel="Chạy AI"
            onRun={onStartPipeline}
            disabled={isRunning}
          />
        </div>
      </ScrollArea>
    );
  }

  if (outlineOutput) {
    return (
      <ScrollArea className={scrollClass}>
        <div className="p-4">
          <OutlineEditor
            chapterTitle={outlineOutput.chapterTitle}
            synopsis={outlineOutput.synopsis}
            scenes={outlineOutput.scenes}
            onApprove={onApprove}
            onRegenerateAction={onRegenerate}
            isLoading={isRunning}
          />
        </div>
      </ScrollArea>
    );
  }

  if (isRunning && currentStep === "outline") {
    return (
      <ScrollArea className={scrollClass}>
        <Empty className="h-[60vh]">
          <EmptyMedia>
            <Loader2Icon className="h-10 w-10 animate-spin text-primary" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Đang tạo giàn ý</EmptyTitle>
            <EmptyDescription>
              AI đang xây dựng cấu trúc phân cảnh chi tiết...
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className={scrollClass}>
      <div className="p-4">
        <PipelineStepConfig
          novelId={novelId}
          role="outline"
          instructionKey="outline"
          title="Giàn ý chương"
          description="Giàn ý xuất hiện sau khi bạn chọn hướng đi."
          runLabel="Chạy pipeline (tiếp tục)"
          onRun={onStartPipeline}
          disabled={isRunning || !sessionId}
        />
      </div>
    </ScrollArea>
  );
}
