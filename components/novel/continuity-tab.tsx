"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { scanNovel } from "@/lib/continuity/scan-runner";
import type {
  ContinuityFinding,
  ContinuityFindingSeverity,
  ContinuityFindingType,
} from "@/lib/db";
import {
  dismissFinding,
  reopenFinding,
  resolveFinding,
  useContinuityFindings,
} from "@/lib/hooks/use-continuity-findings";
import { useContinuityStore } from "@/lib/stores/continuity";
import { cn } from "@/lib/utils";
import {
  CheckCircle2Icon,
  EyeOffIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const TYPE_LABELS: Record<ContinuityFindingType, string> = {
  "fact-conflict": "Mâu thuẫn dữ kiện",
  "character-state": "Trạng thái nhân vật",
  "abandoned-conflict": "Mạch truyện bỏ lửng",
  "name-inconsistency": "Tên không nhất quán",
};

const SEVERITY_RANK: Record<ContinuityFindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const SEVERITY_LABELS: Record<ContinuityFindingSeverity, string> = {
  high: "Nghiêm trọng",
  medium: "Trung bình",
  low: "Nhẹ",
};

function severityClass(severity: ContinuityFindingSeverity): string {
  switch (severity) {
    case "high":
      return "bg-red-500/10 text-red-700 dark:text-red-300";
    case "medium":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function EvidenceLink({
  novelId,
  chapterId,
  chapterOrder,
  quote,
}: {
  novelId: string;
  chapterId?: string;
  chapterOrder: number;
  quote: string;
}) {
  const href = chapterId
    ? `/novels/${novelId}/chapters/${chapterId}`
    : chapterOrder > 0
      ? `/novels/${novelId}/read/${chapterOrder}`
      : undefined;

  const label = chapterOrder > 0 ? `Ch.${chapterOrder}` : "Từ điển";
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
      <div className="mb-0.5 text-xs font-medium text-muted-foreground">
        {href ? (
          <Link href={href} className="underline-offset-2 hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </div>
      <p className="text-foreground/90">{quote}</p>
    </div>
  );
}

function FindingCard({
  finding,
  novelId,
}: {
  finding: ContinuityFinding;
  novelId: string;
}) {
  const dimmed = finding.status !== "open";
  return (
    <Card className={dimmed ? "opacity-60" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={severityClass(finding.severity)}
            variant="secondary"
          >
            {SEVERITY_LABELS[finding.severity]}
          </Badge>
          <Badge variant="outline">{TYPE_LABELS[finding.type]}</Badge>
          {finding.type === "character-state" && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(finding.confidence * 100)}% tin cậy
            </span>
          )}
          {finding.status !== "open" && (
            <Badge variant="secondary">
              {finding.status === "dismissed" ? "Đã bỏ qua" : "Đã xử lý"}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base">{finding.title}</CardTitle>
        <CardDescription>{finding.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {finding.evidence.map((e, i) => (
          <EvidenceLink
            key={i}
            novelId={novelId}
            chapterId={e.chapterId}
            chapterOrder={e.chapterOrder}
            quote={e.quote}
          />
        ))}
        <div className="flex gap-2 pt-1">
          {finding.status === "open" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolveFinding(finding.id)}
              >
                <CheckCircle2Icon className="size-3.5" /> Đã xử lý
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissFinding(finding.id)}
              >
                <EyeOffIcon className="size-3.5" /> Bỏ qua
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => reopenFinding(finding.id)}
            >
              <RotateCcwIcon className="size-3.5" /> Mở lại
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LogLine({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full cursor-pointer text-left hover:text-foreground",
        open ? "whitespace-pre-wrap wrap-break-word" : "truncate",
      )}
      title={open ? undefined : "Nhấn để mở rộng"}
    >
      {text}
    </button>
  );
}

export function ContinuityTab({ novelId }: { novelId: string }) {
  const findings = useContinuityFindings(novelId);
  const {
    isScanning,
    novelId: scanningNovelId,
    phase,
    done,
    total,
    log,
    lastResult,
    cancel,
  } = useContinuityStore();
  const [typeFilter, setTypeFilter] = useState<"all" | ContinuityFindingType>(
    "all",
  );
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanningThisNovel = isScanning && scanningNovelId === novelId;
  // Only show the last scan's warnings on the novel they belong to.
  const warnings =
    scanningNovelId === novelId ? lastResult?.warnings : undefined;

  async function handleScan(full: boolean) {
    setError(null);
    const ac = useContinuityStore.getState().start(novelId);
    try {
      const result = await scanNovel({
        novelId,
        full,
        onProgress: (p) => useContinuityStore.getState().setProgress(p),
        signal: ac.signal,
      });
      useContinuityStore.getState().finish(result);
    } catch (err) {
      useContinuityStore.getState().cancel();
      if (!(err instanceof Error && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  const visible = useMemo(() => {
    return findings
      .filter((f) => (showClosed ? true : f.status === "open"))
      .filter((f) => typeFilter === "all" || f.type === typeFilter)
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.type.localeCompare(b.type),
      );
  }, [findings, typeFilter, showClosed]);

  const openCount = findings.filter((f) => f.status === "open").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const phaseLabel =
    phase === "observe"
      ? `Đang quan sát chương… ${done}/${total}`
      : phase === "detect"
        ? "Đang phân tích dữ kiện, mạch truyện, tên…"
        : phase === "character"
          ? `Đang kiểm tra nhân vật… ${done}/${total}`
          : "Đang quét…";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => handleScan(false)} disabled={isScanning}>
          <ScanSearchIcon className="size-4" /> Quét nhất quán
        </Button>
        <Button
          variant="outline"
          onClick={() => handleScan(true)}
          disabled={isScanning}
        >
          Quét lại toàn bộ
        </Button>
        {scanningThisNovel && (
          <Button variant="ghost" onClick={cancel}>
            <XIcon className="size-4" /> Huỷ
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {openCount} vấn đề đang mở
        </span>
      </div>

      {scanningThisNovel && (
        <div className="space-y-1.5">
          <Progress
            value={
              (phase === "observe" || phase === "character") && total > 0
                ? pct
                : undefined
            }
          />
          <p className="text-xs text-muted-foreground">{phaseLabel}</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="max-h-150 space-y-px overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {log.map((line, i) => (
            <LogLine key={`${i}-${line}`} text={line} />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {warnings?.map((w, i) => (
        <p
          key={i}
          className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {w}
        </p>
      ))}

      {findings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            size="sm"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | ContinuityFindingType)
            }
          >
            <NativeSelectOption value="all">Tất cả loại</NativeSelectOption>
            {(Object.keys(TYPE_LABELS) as ContinuityFindingType[]).map((t) => (
              <NativeSelectOption key={t} value={t}>
                {TYPE_LABELS[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            variant={showClosed ? "secondary" : "ghost"}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? "Đang hiện đã đóng" : "Ẩn đã đóng"}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        scanningThisNovel ? null : (
          <Empty>
            <EmptyMedia variant="icon">
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>
              {findings.length === 0 ? "Chưa quét" : "Không có vấn đề"}
            </EmptyTitle>
            <EmptyDescription>
              {findings.length === 0
                ? "Nhấn “Quét nhất quán” để kiểm tra mâu thuẫn xuyên suốt truyện."
                : "Không có vấn đề nào khớp bộ lọc hiện tại."}
            </EmptyDescription>
          </Empty>
        )
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <FindingCard key={f.id} finding={f} novelId={novelId} />
          ))}
        </div>
      )}
    </div>
  );
}
