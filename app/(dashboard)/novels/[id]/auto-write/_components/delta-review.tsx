"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useStepResult } from "@/lib/hooks";
import type { StateDelta } from "@/lib/writing/state/schemas";
import { GitMergeIcon, PlusIcon, MinusIcon, ArrowRightIcon } from "lucide-react";

interface DeltaReviewProps {
  sessionId: string | undefined;
}

const OP_CONFIG = {
  add: { icon: PlusIcon, color: "text-green-600 dark:text-green-400", label: "Thêm" },
  remove: { icon: MinusIcon, color: "text-red-600 dark:text-red-400", label: "Xóa" },
  advance: { icon: ArrowRightIcon, color: "text-blue-600 dark:text-blue-400", label: "Tiến" },
  resolve: { icon: PlusIcon, color: "text-green-600 dark:text-green-400", label: "Hoàn thành" },
  defer: { icon: MinusIcon, color: "text-yellow-600 dark:text-yellow-400", label: "Trì hoãn" },
};

export function DeltaReview({ sessionId }: DeltaReviewProps) {
  const observeResult = useStepResult(sessionId, "observe");

  const delta = useMemo((): StateDelta | null => {
    if (!observeResult?.output) return null;
    try {
      return JSON.parse(observeResult.output) as StateDelta;
    } catch {
      return null;
    }
  }, [observeResult]);

  if (!delta) {
    return (
      <Empty className="h-[40vh]">
        <EmptyMedia variant="icon">
          <GitMergeIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa có delta trạng thái</EmptyTitle>
          <EmptyDescription>
            Kết quả quan sát xuất hiện sau bước Quan sát.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const characterStatePatches = delta.characterStatePatches ?? [];
  const factOps = delta.factOps ?? [];
  const hookOps = delta.hookOps ?? [];
  const knownTruthsAdded = delta.knownTruthsAdded ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tóm tắt chương {delta.chapter}
          </p>
          <p className="text-sm">{delta.chapterSummary}</p>
        </div>

        {characterStatePatches.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nhân vật ({characterStatePatches.length})
            </p>
            {characterStatePatches.map((p, i) => (
              <div key={i} className="rounded-md border px-3 py-2 space-y-0.5">
                <p className="text-xs font-medium">{p.name}</p>
                {p.currentState && (
                  <p className="text-xs text-muted-foreground">{p.currentState}</p>
                )}
                {p.location && (
                  <p className="text-xs text-muted-foreground">@ {p.location}</p>
                )}
                {p.status && (
                  <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                )}
              </div>
            ))}
          </section>
        )}

        {factOps.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sự kiện ({factOps.length})
            </p>
            {factOps.map((op, i) => {
              const cfg = OP_CONFIG[op.op as keyof typeof OP_CONFIG] ?? OP_CONFIG.add;
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                  <span>
                    <span className="font-medium">{op.subject}</span>
                    <span className="text-muted-foreground mx-1">{op.predicate}</span>
                    <span>{op.object}</span>
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {hookOps.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Mốc cốt truyện ({hookOps.length})
            </p>
            {hookOps.map((op, i) => {
              const cfg = OP_CONFIG[op.op as keyof typeof OP_CONFIG] ?? OP_CONFIG.advance;
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                  <span>
                    <Badge variant="outline" className="text-[10px] mr-1">{cfg.label}</Badge>
                    {op.title ?? op.plotPointId ?? op.plotArcId}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {knownTruthsAdded.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sự thật mới ({knownTruthsAdded.length})
            </p>
            {knownTruthsAdded.map((t, i) => (
              <p key={i} className="text-xs">• {t}</p>
            ))}
          </section>
        )}
      </div>
    </ScrollArea>
  );
}
