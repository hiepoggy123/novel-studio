"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useStoryState } from "@/lib/hooks/use-story-state";
import { useCharacters, usePlotArcs } from "@/lib/hooks";
import { db } from "@/lib/db";
import { bootstrapStoryState } from "@/lib/writing/state/bootstrap";
import { saveStoryState } from "@/lib/writing/state/state-store";
import {
  AlertTriangleIcon,
  DatabaseIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";

interface BootstrapPanelProps {
  novelId: string;
}

export function BootstrapPanel({ novelId }: BootstrapPanelProps) {
  const storyState = useStoryState(novelId);
  const characters = useCharacters(novelId);
  const plotArcs = usePlotArcs(novelId);
  const [running, setRunning] = useState(false);
  const autoTriggered = useRef(false);

  const storyStateLoaded = storyState !== undefined;
  const hasState = !!storyState;
  const isIncomplete = storyState?.incomplete === true;

  async function handleBootstrap() {
    setRunning(true);
    try {
      const chapters = await db.chapters
        .where("novelId")
        .equals(novelId)
        .sortBy("order");

      const novel = await db.novels.get(novelId);

      const snapshot = bootstrapStoryState({
        chapters: chapters.map((c) => ({
          id: c.id,
          order: c.order,
          summary: c.summary,
          characterIds: c.characterIds,
        })),
        characters: (characters ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          characterArc: c.characterArc,
        })),
        plotArcs: (plotArcs ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          status: a.status,
          plotPoints: a.plotPoints.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            chapterOrder: p.chapterOrder,
          })),
        })),
        characterArcs: [],
        analysisStatus: novel?.analysisStatus,
        worldFacts: novel?.worldOverview,
      });

      await saveStoryState(novelId, snapshot);
      toast.success("Đã khởi tạo trạng thái truyện");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Khởi tạo thất bại");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (autoTriggered.current) return;
    if (!storyStateLoaded) return;
    if (hasState) return;
    autoTriggered.current = true;
    void handleBootstrap();
  }, [storyStateLoaded, hasState]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!storyStateLoaded || running) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Đang khởi tạo trạng thái...</p>
      </div>
    );
  }

  if (!hasState) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Empty>
          <EmptyMedia variant="icon">
            <DatabaseIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Chưa có trạng thái truyện</EmptyTitle>
            <EmptyDescription>
              Khởi tạo snapshot từ nhân vật, tuyến truyện và phân tích hiện có.
              Pipeline sẽ dùng snapshot để lấy bối cảnh cho mỗi chương.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Button
          onClick={() => void handleBootstrap()}
          disabled={running}
          className="w-full"
        >
          <DatabaseIcon className="h-4 w-4 mr-2" />
          Khởi tạo trạng thái
        </Button>
      </div>
    );
  }

  if (isIncomplete) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Snapshot chưa đầy đủ
              </p>
            </div>
            {storyState.warnings?.map((w, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-300">
                • {w}
              </p>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Bạn có thể chạy pipeline ngay, nhưng chất lượng bối cảnh có thể thấp hơn.
              Hãy hoàn thiện phân tích và nhân vật rồi khởi tạo lại để có kết quả tốt nhất.
            </p>
          </div>

          <SnapshotSummary novelId={novelId} />

          <Button
            variant="outline"
            onClick={() => void handleBootstrap()}
            disabled={running}
            className="w-full"
            size="sm"
          >
            {running ? (
              <>
                <Loader2Icon className="h-3.5 w-3.5 mr-2 animate-spin" />
                Đang khởi tạo lại...
              </>
            ) : (
              "Khởi tạo lại từ dữ liệu hiện tại"
            )}
          </Button>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <SnapshotSummary novelId={novelId} />
        <Button
          variant="outline"
          onClick={() => void handleBootstrap()}
          disabled={running}
          className="w-full"
          size="sm"
        >
          {running ? (
            <>
              <Loader2Icon className="h-3.5 w-3.5 mr-2 animate-spin" />
              Đang khởi tạo lại...
            </>
          ) : (
            "Khởi tạo lại snapshot"
          )}
        </Button>
      </div>
    </ScrollArea>
  );
}

function SnapshotSummary({ novelId }: { novelId: string }) {
  const state = useStoryState(novelId);
  if (!state) return null;

  const rows: { label: string; value: string }[] = [
    {
      label: "Chương cuối áp dụng",
      value: String(state.lastAppliedChapter),
    },
    { label: "Nhân vật", value: String(state.characterStates.length) },
    { label: "Sự kiện (knownFacts)", value: String(state.knownFacts.length) },
    { label: "Xung đột mở", value: String(state.openConflicts.length) },
    { label: "Sự thật bất biến", value: String(state.knownTruths.length) },
  ];

  return (
    <div className="rounded-md border divide-y text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
