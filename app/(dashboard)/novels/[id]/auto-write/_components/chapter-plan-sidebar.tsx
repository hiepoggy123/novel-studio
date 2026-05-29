"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PipelineProgress } from "@/components/writing/pipeline-progress";
import type { ChapterPlan, WritingAgentRole } from "@/lib/db";
import { NetworkIcon, PencilIcon } from "lucide-react";
import { StaleChapterIndicator } from "./stale-chapter-indicator";

const STATUS_STYLE: Record<ChapterPlan["status"], string> = {
  planned: "bg-secondary text-muted-foreground",
  writing: "bg-blue-500/10 text-blue-600",
  written: "bg-amber-500/10 text-amber-600",
  reviewed: "bg-orange-500/10 text-orange-600",
  saved: "bg-green-500/10 text-green-600",
};

const STATUS_LABEL: Record<ChapterPlan["status"], string> = {
  planned: "Dự định",
  writing: "Đang viết",
  written: "Viết xong",
  reviewed: "Đã review",
  saved: "Đã lưu",
};

interface ChapterPlanSidebarProps {
  plans: ChapterPlan[] | undefined;
  effectivePlanId: string | null;
  sessionId: string | undefined;
  currentStep: WritingAgentRole | undefined;
  sessionStatus: "active" | "paused" | "completed" | "error" | undefined;
  isGeneratingPlans: boolean;
  novelId: string;
  onSelectPlan: (id: string) => void;
  onEditPlan: (id: string) => void;
  onRetry: () => void;
  onStepClick: (role: WritingAgentRole) => void;
  onGenerateMore: () => void;
  onAddBlank: () => void;
  onManagePlot: () => void;
}

export function ChapterPlanSidebar({
  plans,
  effectivePlanId,
  sessionId,
  currentStep,
  sessionStatus,
  isGeneratingPlans,
  novelId,
  onSelectPlan,
  onEditPlan,
  onRetry,
  onStepClick,
  onGenerateMore,
  onAddBlank,
  onManagePlot,
}: ChapterPlanSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r">
      <div className="p-3 shrink-0">
        <PipelineProgress
          sessionId={sessionId}
          currentStep={currentStep}
          sessionStatus={sessionStatus}
          onRetryAction={onRetry}
          onStepClick={onStepClick}
        />
        <button
          type="button"
          onClick={onManagePlot}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          <NetworkIcon className="h-3.5 w-3.5" />
          Quản lý cốt truyện
        </button>
      </div>

      <ScrollArea className="flex-1 border-t p-3 min-h-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Kế hoạch chương
          </h3>
          {plans && plans.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {plans.filter((p) => p.status === "saved").length}/{plans.length}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {plans?.map((plan, idx) => {
            const prevDone = idx === 0 || plans[idx - 1]?.status === "saved";
            const isLocked = !prevDone && plan.status === "planned";
            return (
              <div key={plan.id} className="group/plan-item relative">
                <button
                  onClick={() => !isLocked && onSelectPlan(plan.id)}
                  disabled={isLocked}
                  className={`w-full text-left rounded-md px-3 py-1 pr-7 text-xs transition-colors flex ${
                    isLocked
                      ? "opacity-40 cursor-not-allowed"
                      : effectivePlanId === plan.id
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                  }`}
                >
                  <span className="font-medium">{plan.chapterOrder}.</span>
                  {plan.title && (
                    <span className="text-muted-foreground ml-1 line-clamp-1 flex-1">
                      {plan.title}
                    </span>
                  )}
                  <span
                    className={`ml-2 shrink-0 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[plan.status]}`}
                  >
                    {STATUS_LABEL[plan.status]}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditPlan(plan.id);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/plan-item:opacity-100 hover:bg-muted transition-opacity"
                  title="Chỉnh sửa kế hoạch chương"
                >
                  <PencilIcon className="h-3 w-3 text-muted-foreground" />
                </button>
                {plan.status === "saved" && plan.chapterId && (
                  <StaleChapterIndicator
                    novelId={novelId}
                    chapterOrder={plan.chapterOrder}
                    chapterId={plan.chapterId}
                    chapterPlanId={plan.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {plans && plans.length > 0 && (
        <div className="flex gap-1 mx-2 my-2 shrink-0">
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={isGeneratingPlans}
            className="flex-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isGeneratingPlans ? "Đang tạo..." : "+ Tạo thêm (AI)"}
          </button>
          <button
            type="button"
            onClick={onAddBlank}
            className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            + Thêm trống
          </button>
        </div>
      )}
    </div>
  );
}
