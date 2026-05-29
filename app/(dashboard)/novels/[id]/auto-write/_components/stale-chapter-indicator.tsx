"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStoryState } from "@/lib/hooks/use-story-state";
import { useWritingSettings } from "@/lib/hooks";
import { db } from "@/lib/db";
import { resyncChapterState } from "@/lib/writing/resync-chapter-state";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import { resolveStep } from "@/lib/ai/resolve-step";
import { getDefaultPrompt } from "@/lib/writing/prompts";
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

interface StaleChapterIndicatorProps {
  novelId: string;
  chapterOrder: number | undefined;
  chapterId: string | undefined;
  chapterPlanId: string | undefined;
}

export function StaleChapterIndicator({
  novelId,
  chapterOrder,
  chapterId,
  chapterPlanId,
}: StaleChapterIndicatorProps) {
  const storyState = useStoryState(novelId);
  const settings = useWritingSettings(novelId);
  const [syncing, setSyncing] = useState(false);
  const [stale, setStale] = useState<boolean | null>(null);

  const hashKey = String(chapterOrder ?? "");
  const storedHash = storyState?.chapterHashes?.[hashKey];

  useEffect(() => {
    if (!chapterId || storedHash === undefined) return;
    let cancelled = false;

    async function checkStale() {
      if (!chapterId) return;
      const activeScenes = await db.scenes
        .where("[chapterId+isActive]")
        .equals([chapterId, 1])
        .toArray();
      if (cancelled) return;
      if (activeScenes.length === 0) {
        setStale(false);
        return;
      }
      const { contentHash } = concatActiveScenes(
        activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
      );
      if (!cancelled) setStale(storedHash !== contentHash);
    }

    void checkStale();
    return () => { cancelled = true; };
  }, [chapterId, storedHash]);

  async function handleResync() {
    if (!chapterId || !chapterOrder || !chapterPlanId) return;
    setSyncing(true);
    try {
      const plan = await db.chapterPlans.get(chapterPlanId);
      if (!plan) {
        toast.error("Không tìm thấy kế hoạch chương");
        return;
      }

      const observeModelCfg = settings?.observeModel;
      const model = observeModelCfg
        ? await resolveStep({ providerId: observeModelCfg.providerId, modelId: observeModelCfg.modelId })
        : null;

      if (!model) {
        toast.error("Chưa cấu hình mô hình Quan sát — vào Cài đặt để chọn.");
        return;
      }

      const tempSessionId = crypto.randomUUID();
      const outline = {
        chapterTitle: plan.title ?? `Chương ${chapterOrder}`,
        synopsis: plan.outline ?? "",
        scenes: plan.scenes,
        totalWordCountTarget: settings?.chapterLength ?? 3000,
      };

      const result = await resyncChapterState({
        novelId,
        chapterId,
        chapterOrder,
        sessionId: tempSessionId,
        chapterPlanId,
        outline,
        config: {
          model,
          systemPrompt: settings?.observePrompt ?? getDefaultPrompt("observe"),
        },
      });

      if (result.action === "resynced") {
        setStale(false);
        toast.success("Đã đồng bộ trạng thái từ chương đã chỉnh sửa");
      } else if (result.action === "skipped") {
        setStale(false);
        toast.info("Không cần đồng bộ — nội dung chưa thay đổi");
      } else {
        toast.error("Đồng bộ thất bại: " + result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setSyncing(false);
    }
  }

  if (!chapterId || !storedHash || stale !== true) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <span className="flex-1 text-amber-700 dark:text-amber-400">
        Chương đã chỉnh sửa sau khi commit — trạng thái có thể lỗi thời.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs px-2 shrink-0"
        onClick={() => void handleResync()}
        disabled={syncing}
      >
        {syncing ? (
          <Loader2Icon className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <RefreshCwIcon className="h-3 w-3 mr-1" />
            Đồng bộ
          </>
        )}
      </Button>
    </div>
  );
}
