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
import { DirectionPreFilter } from "@/components/writing/direction-pre-filter";
import { DirectionSelector } from "@/components/writing/direction-selector";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import { useWritingSettings } from "@/lib/hooks";
import type { WritingAgentRole } from "@/lib/db";
import type { PlannerAgentOutput } from "@/lib/writing/agents/planner-agent";
import type { ChapterIntent } from "@/lib/writing/intent-schema";
import { CompassIcon, Loader2Icon } from "lucide-react";
import { IntentEditor } from "./intent-editor";

interface PipelineStepsProps {
  novelId: string;
  sessionId: string | undefined;
  currentStep: WritingAgentRole | undefined;
  sessionStatus: "active" | "paused" | "completed" | "error" | undefined;
  planOutput: PlannerAgentOutput | null;
  effectivePlanId: string | null;
  activePlanIntent: ChapterIntent | null;
  scrollClass: string;
  onRetry: () => void;
  onStepClick: (role: WritingAgentRole) => void;
  onDirectionConfirm: (directions: string[]) => void;
  onRerunPlan: () => void;
  onStartPipeline: () => void;
}

export function PipelineStepsPanel({
  novelId,
  sessionId,
  currentStep,
  sessionStatus,
  planOutput,
  effectivePlanId,
  activePlanIntent,
  scrollClass,
  onDirectionConfirm,
  onRerunPlan,
  onStartPipeline,
}: PipelineStepsProps) {
  const { isRunning, pipelinePreRunRole } = useWritingPipelineStore();
  const settings = useWritingSettings(novelId);
  const noAskingMode = settings?.noAskingMode ?? false;

  const sessionNeedsResume =
    sessionStatus === "paused" || sessionStatus === "error";

  const showPreRunConfig =
    pipelinePreRunRole === "plan" ||
    (sessionNeedsResume &&
      currentStep === "plan" &&
      !planOutput);

  return (
    <ScrollArea className={scrollClass}>
      <div className="p-4 min-w-0">
        {showPreRunConfig ? (
          <div className="space-y-4 mx-auto max-w-lg">
            <DirectionPreFilter novelId={novelId} />
            <PipelineStepConfig
              novelId={novelId}
              role="plan"
              instructionKey="plan"
              title={planOutput ? "Chạy lại kế hoạch" : "Lập kế hoạch chương"}
              description={
                planOutput
                  ? "Chỉnh mô hình, yêu cầu và system prompt, sau đó chạy AI."
                  : "Cấu hình bước này rồi chạy để AI lập kế hoạch và đề xuất hướng đi."
              }
              runLabel={planOutput ? "Chạy AI" : "Chạy pipeline"}
              onRun={onStartPipeline}
              disabled={isRunning}
            />
          </div>
        ) : planOutput ? (
          <div className="space-y-4">
            {!noAskingMode && effectivePlanId && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Ý định chương
                </p>
                <IntentEditor
                  key={effectivePlanId}
                  novelId={novelId}
                  planId={effectivePlanId}
                  intent={activePlanIntent}
                />
              </div>
            )}
            <DirectionSelector
              options={planOutput.directions}
              recommendedOptionIds={planOutput.recommendedOptionIds}
              onConfirm={onDirectionConfirm}
              onRegenerateAction={onRerunPlan}
              isLoading={isRunning}
            />
          </div>
        ) : isRunning && currentStep === "plan" ? (
          <Empty className="h-[60vh]">
            <EmptyMedia>
              <Loader2Icon className="h-10 w-10 animate-spin text-primary" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Đang lập kế hoạch</EmptyTitle>
              <EmptyDescription>
                AI đang phân tích trạng thái truyện và đề xuất hướng đi…
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !sessionId && effectivePlanId ? (
          <div className="space-y-4 mx-auto max-w-lg">
            <DirectionPreFilter novelId={novelId} />
            <PipelineStepConfig
              novelId={novelId}
              role="plan"
              instructionKey="plan"
              title="Bắt đầu viết chương"
              description="Cấu hình model và yêu cầu rồi chạy pipeline."
              runLabel="Chạy pipeline"
              onRun={onStartPipeline}
              disabled={isRunning || !effectivePlanId}
            />
          </div>
        ) : sessionId && effectivePlanId && !isRunning ? (
          <div className="space-y-4 mx-auto max-w-lg">
            <DirectionPreFilter novelId={novelId} />
            <PipelineStepConfig
              novelId={novelId}
              role="plan"
              instructionKey="plan"
              title="Kế hoạch chương"
              description="Chạy lại bước lập kế hoạch, xóa hướng đi và các bước sau."
              runLabel="Chạy lại kế hoạch"
              onRun={onRerunPlan}
              disabled={isRunning}
            />
          </div>
        ) : (
          <Empty className="h-[60vh]">
            <EmptyMedia variant="icon">
              <CompassIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Chọn kế hoạch chương</EmptyTitle>
              <EmptyDescription>
                Chọn kế hoạch chương ở sidebar rồi nhấn &quot;Chạy
                pipeline&quot;.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </ScrollArea>
  );
}

