"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useStepResult } from "@/lib/hooks";
import { EyeIcon, Loader2Icon } from "lucide-react";
import { DeltaReview } from "./delta-review";

interface ObserveTabPanelProps {
  novelId: string;
  sessionId: string | undefined;
  scrollClass: string;
  isRunning: boolean;
  onSaveChapter: () => void;
}

export function ObserveTabPanel({
  sessionId,
  scrollClass,
  isRunning,
  onSaveChapter,
}: ObserveTabPanelProps) {
  const observeResult = useStepResult(sessionId, "observe");
  const commitResult = useStepResult(sessionId, "commit");

  const observeDone = observeResult?.status === "completed";
  const commitDone = commitResult?.status === "completed";
  const committing = isRunning && observeDone && !commitDone;

  if (!observeDone) {
    return (
      <Empty className="h-[60vh]">
        <EmptyMedia variant="icon">
          <EyeIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có quan sát</EmptyTitle>
          <EmptyDescription>
            Sau khi viết xong, AI quan sát chương và trích xuất thay đổi trạng
            thái truyện. Kết quả hiển thị ở đây.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={`${scrollClass} flex flex-col overflow-hidden`}>
      <DeltaReview sessionId={sessionId} />
      {!commitDone && (
        <div className="border-t px-4 py-3 shrink-0 flex gap-2">
          <button
            onClick={onSaveChapter}
            disabled={isRunning}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {committing && <Loader2Icon className="size-3.5 animate-spin" />}
            {committing
              ? "Đang lưu chương & cập nhật trạng thái…"
              : "Chấp nhận & Lưu chương"}
          </button>
        </div>
      )}
    </div>
  );
}
