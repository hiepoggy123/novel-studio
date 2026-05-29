"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { usePlotArcs } from "@/lib/hooks/use-plot-arcs";
import { runPlotAgent } from "@/lib/writing/agents/plot-agent";
import type { PlotProposal } from "@/lib/writing/plot-proposal-schema";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function PlotAiGeneratePanel({
  novelId,
  onProposalAction,
}: {
  novelId: string;
  onProposalAction: (proposal: PlotProposal) => void;
}) {
  const arcs = usePlotArcs(novelId);
  const [idea, setIdea] = useState("");
  const [targetArcId, setTargetArcId] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleGenerate = async () => {
    if (!idea.trim()) {
      toast.error("Nhập ý tưởng trước khi tạo");
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const proposal = await runPlotAgent({
        novelId,
        idea: idea.trim(),
        targetArcId: targetArcId || undefined,
        abortSignal: controller.signal,
      });
      onProposalAction(proposal);
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(
          err instanceof Error ? err.message : "Không tạo được đề xuất",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 px-1 py-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Ý tưởng cốt truyện</Label>
        <Textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={5}
          className="text-sm resize-y"
          placeholder="Mô tả ý tưởng tuyến truyện hoặc tình tiết bạn muốn AI phát triển. AI sẽ truy vấn tiểu thuyết để tạo đề xuất nhất quán."
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Thêm điểm vào tuyến</Label>
        <NativeSelect
          className="h-8 text-xs"
          value={targetArcId}
          onChange={(e) => setTargetArcId(e.target.value)}
          disabled={loading}
        >
          <NativeSelectOption value="">(Tạo tuyến mới)</NativeSelectOption>
          {arcs?.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-[11px] text-muted-foreground">
          Để trống nếu muốn AI tự quyết định tạo tuyến mới hay thêm điểm.
        </p>
      </div>

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="self-start"
      >
        {loading ? (
          <>
            <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
            Đang phân tích &amp; tạo...
          </>
        ) : (
          <>
            <SparklesIcon className="h-4 w-4 mr-2" />
            Tạo đề xuất
          </>
        )}
      </Button>
    </div>
  );
}
