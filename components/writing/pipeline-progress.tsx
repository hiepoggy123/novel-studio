"use client";

import type { WritingAgentRole, WritingStepStatus } from "@/lib/db";
import { useStepResults } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  CompassIcon,
  EditIcon,
  ListTreeIcon,
  Loader2Icon,
  PenLineIcon,
  SearchCheckIcon,
  XCircleIcon,
} from "lucide-react";

import { useMemo } from "react";

const STEPS: {
  role: WritingAgentRole;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { role: "plan", label: "Kế hoạch", icon: CompassIcon },
  { role: "outline", label: "Giàn ý", icon: ListTreeIcon },
  { role: "writer", label: "Viết", icon: PenLineIcon },
  { role: "normalize", label: "Chuẩn hóa", icon: BookOpenIcon },
  { role: "observe", label: "Quan sát", icon: SearchCheckIcon },
  { role: "audit", label: "Đánh giá", icon: SearchCheckIcon },
  { role: "revise", label: "Viết lại", icon: PenLineIcon },
  { role: "commit", label: "Lưu", icon: CircleDotIcon },
];

function StatusIcon({ status }: { status: WritingStepStatus | undefined }) {
  switch (status) {
    case "completed":
      return <CheckCircle2Icon className="h-4 w-4 text-green-500" />;
    case "running":
      return <Loader2Icon className="h-4 w-4 animate-spin text-blue-500" />;
    case "editing":
      return <EditIcon className="h-4 w-4 text-yellow-500" />;
    case "error":
      return <XCircleIcon className="h-4 w-4 text-red-500" />;
    case "skipped":
      return <CircleDotIcon className="h-4 w-4 text-muted-foreground" />;
    default:
      return <CircleIcon className="h-4 w-4 text-muted-foreground" />;
  }
}

export function PipelineProgress({
  sessionId,
  currentStep,
  sessionStatus,
  onStepClick,
  onRetryAction,
}: {
  sessionId: string | undefined;
  currentStep?: WritingAgentRole;
  sessionStatus?: "active" | "paused" | "completed" | "error";
  onStepClick?: (role: WritingAgentRole) => void;
  onRetryAction?: () => void;
}) {
  const stepResults = useStepResults(sessionId);
  const resultMap = useMemo(
    () => new Map(stepResults?.map((r) => [r.role, r]) ?? []),
    [stepResults],
  );

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Pipeline
      </h3>
      {STEPS.map((step, i) => {
        const result = resultMap.get(step.role);
        const isActive = currentStep === step.role;
        const Icon = step.icon;
        const writerEmptyCompleted =
          step.role === "writer" &&
          result?.status === "completed" &&
          !(result.output?.trim());
        const displayStatus = writerEmptyCompleted
          ? undefined
          : result?.status;

        return (
          <button
            key={step.role}
            onClick={() => onStepClick?.(step.role)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors text-left",
              isActive
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="flex-1">
              {i + 1}. {step.label}
            </span>
            <StatusIcon status={displayStatus} />
          </button>
        );
      })}

      {(() => {
        const errorStep = currentStep ? resultMap.get(currentStep) : undefined;
        const isError = errorStep?.status === "error";
        const isPaused = sessionStatus === "paused";
        if (!isError && !isPaused) return null;
        return (
          <div className="mt-2 space-y-2">
            {isPaused && (
              <p className="text-xs text-muted-foreground px-1">
                Đã tạm dừng — chọn &quot;Thử lại&quot; hoặc mở tab bước tương ứng
                để cấu hình và chạy tiếp.
              </p>
            )}
            {isError && errorStep?.error && (
              <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {errorStep.error}
              </div>
            )}
            {onRetryAction && (
              <button
                onClick={onRetryAction}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Thử lại
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
