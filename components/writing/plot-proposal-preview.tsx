"use client";

import { Button } from "@/components/ui/button";
import { usePlotArcs } from "@/lib/hooks/use-plot-arcs";
import { applyPlotProposal } from "@/lib/writing/agents/plot-agent";
import type { PlotProposal } from "@/lib/writing/plot-proposal-schema";
import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function PlotProposalPreview({
  novelId,
  proposal,
  onDoneAction,
  onDiscardAction,
}: {
  novelId: string;
  proposal: PlotProposal;
  onDoneAction: () => void;
  onDiscardAction: () => void;
}) {
  const arcs = usePlotArcs(novelId);
  const [saving, setSaving] = useState(false);
  const arcTitle = (id: string) =>
    arcs?.find((a) => a.id === id)?.title ?? "(không tìm thấy)";

  const handleAccept = async () => {
    setSaving(true);
    try {
      const result = await applyPlotProposal(novelId, proposal);
      const parts: string[] = [];
      if (result.arcsCreated > 0) parts.push(`${result.arcsCreated} tuyến mới`);
      if (result.pointsAdded > 0) parts.push(`${result.pointsAdded} điểm`);
      toast.success(`Đã lưu ${parts.join(", ") || "đề xuất"}`);
      if (result.skipped.length > 0) {
        toast.error(
          `Bỏ qua ${result.skipped.length} mục: tuyến đích không tồn tại`,
        );
      }
      onDoneAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-1 py-3">
        {proposal.reasoning && (
          <p className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
            {proposal.reasoning}
          </p>
        )}

        {proposal.items.map((item, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            {item.kind === "new-arc" ? (
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">
                  Tuyến mới
                </span>
                <span className="text-sm font-medium">{item.title}</span>
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {item.type}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600">
                  Thêm điểm
                </span>
                <span className="text-sm font-medium">
                  → {arcTitle(item.targetArcId)}
                </span>
              </div>
            )}

            {item.kind === "new-arc" && item.description && (
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            )}

            <ul className="space-y-1.5">
              {item.plotPoints.map((p, j) => (
                <li key={j} className="text-xs">
                  <span className="font-medium">{p.title}</span>
                  {p.chapterOrder != null && (
                    <span className="ml-1 text-muted-foreground">
                      (chương {p.chapterOrder})
                    </span>
                  )}
                  {p.coreHook && (
                    <span className="ml-1 rounded-full bg-amber-500/10 px-1.5 text-[10px] text-amber-600">
                      hook
                    </span>
                  )}
                  <p className="text-muted-foreground">{p.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t px-1 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDiscardAction}
          disabled={saving}
        >
          <XIcon className="h-3.5 w-3.5 mr-1" />
          Bỏ qua
        </Button>
        <Button type="button" size="sm" onClick={handleAccept} disabled={saving}>
          <CheckIcon className="h-3.5 w-3.5 mr-1" />
          {saving ? "Đang lưu..." : "Chấp nhận & lưu"}
        </Button>
      </div>
    </div>
  );
}
