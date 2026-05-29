"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStepResult } from "@/lib/hooks";
import type { ReviewAgentOutput, ReviewIssue } from "@/lib/writing/types";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  PenLineIcon,
  SearchCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

interface AuditViewProps {
  sessionId: string | undefined;
  onTargetedRevise?: (indices: number[]) => void;
  isRevising?: boolean;
}

const SEVERITY_CONFIG = {
  critical: { icon: XCircleIcon, color: "text-red-500", label: "Nghiêm trọng" },
  minor: { icon: AlertTriangleIcon, color: "text-yellow-500", label: "Nhỏ" },
  suggestion: { icon: InfoIcon, color: "text-blue-500", label: "Gợi ý" },
};

const TYPE_LABELS: Record<string, string> = {
  character: "Nhân vật",
  plot: "Cốt truyện",
  tone: "Giọng văn",
  "world-rules": "Quy tắc TG",
  pacing: "Nhịp độ",
  pov: "Góc nhìn",
  dialogue: "Hội thoại",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color =
    score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xl font-bold tabular-nums ${
          score >= 8
            ? "text-green-500"
            : score >= 6
              ? "text-yellow-500"
              : "text-red-500"
        }`}
      >
        {score}
      </span>
      <span className="text-xs text-muted-foreground">/10</span>
    </div>
  );
}

function IssueCard({
  issue,
  selected,
  onToggle,
}: {
  issue: ReviewIssue;
  selected: boolean;
  onToggle: () => void;
}) {
  const cfg =
    SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] ??
    SEVERITY_CONFIG.suggestion;
  const Icon = cfg.icon;

  return (
    <Card
      className={`gap-0 mx-1 cursor-pointer transition-colors py-0 ${
        selected ? "border-primary/50 bg-primary/5" : ""
      }`}
      onClick={onToggle}
    >
      <CardHeader className="py-2 px-3">
        <div className="flex items-start gap-2">
          <div className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border flex items-center justify-center mt-0.5">
            {selected && (
              <svg
                className="h-2.5 w-2.5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xs flex-1">
                {issue.description}
              </CardTitle>
              <div className="flex items-center flex-col gap-1">
                <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />

                <Badge variant="secondary" className="text-xs">
                  {TYPE_LABELS[issue.type] ?? issue.type}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        <p className="text-xs text-muted-foreground">
          Vị trí: {issue.location}
        </p>
        <p className="text-xs mt-1">Gợi ý: {issue.suggestion}</p>
      </CardContent>
    </Card>
  );
}

export function AuditView({
  sessionId,
  onTargetedRevise,
  isRevising,
}: AuditViewProps) {
  const auditResult = useStepResult(sessionId, "audit");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const review = useMemo((): ReviewAgentOutput | null => {
    if (!auditResult?.output) return null;
    try {
      return JSON.parse(auditResult.output) as ReviewAgentOutput;
    } catch {
      return null;
    }
  }, [auditResult]);

  if (!review) {
    return (
      <Empty className="h-[40vh]">
        <EmptyMedia variant="icon">
          <SearchCheckIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có đánh giá</EmptyTitle>
          <EmptyDescription>
            Kết quả đánh giá xuất hiện sau bước Đánh giá.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function toggleIssue(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const hasPartial = selected.size > 0 && selected.size < review.issues.length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Đánh giá chương</span>
        </div>
        <ScoreBar score={review.overallScore} />
        <p className="text-xs text-muted-foreground">{review.summary}</p>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-2">
          {review.issues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <CheckCircle2Icon className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Không tìm thấy vấn đề — chương đạt chất lượng tốt!
              </span>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">
                Chọn vấn đề cần viết lại có mục tiêu, hoặc bỏ chọn để viết lại
                toàn bộ.
              </p>
              {review.issues.map((issue, i) => (
                <IssueCard
                  key={i}
                  issue={issue}
                  selected={selected.has(i)}
                  onToggle={() => toggleIssue(i)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {onTargetedRevise && review.issues.length > 0 && (
        <div className="border-t px-4 py-3 shrink-0">
          <Button
            onClick={() =>
              onTargetedRevise(hasPartial ? Array.from(selected) : [])
            }
            disabled={isRevising}
            size="sm"
            className="w-full"
          >
            <PenLineIcon className="h-3.5 w-3.5 mr-1.5" />
            {isRevising
              ? "Đang viết lại..."
              : hasPartial
                ? `Viết lại (${selected.size} vấn đề)`
                : "Viết lại"}
          </Button>
        </div>
      )}
    </div>
  );
}
