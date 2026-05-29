"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlotArcs } from "@/lib/hooks/use-plot-arcs";
import type { PlotProposal } from "@/lib/writing/plot-proposal-schema";
import { useEffect, useState } from "react";
import { PlotAiGeneratePanel } from "./plot-ai-generate-panel";
import { PlotArcEditor } from "./plot-arc-editor";
import { PlotArcList } from "./plot-arc-list";
import { PlotModelRow, PlotPromptCollapsible } from "./plot-config-row";
import { PlotProposalPreview } from "./plot-proposal-preview";

export function PlotManagerDialog({
  novelId,
  open,
  onOpenChangeAction,
}: {
  novelId: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}) {
  const arcs = usePlotArcs(novelId);
  const [view, setView] = useState<"manual" | "ai">("manual");
  const [editingArcId, setEditingArcId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlotProposal | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingArcId(null);
      setProposal(null);
    }
  }, [open]);

  const editingArc = arcs?.find((a) => a.id === editingArcId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Quản lý cốt truyện</DialogTitle>
          <DialogDescription>
            Tạo và chỉnh sửa tuyến truyện, điểm cốt truyện thủ công hoặc bằng AI.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-col px-6 py-4"
          style={{ height: "calc(85vh - 90px)" }}
        >
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "manual" | "ai")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-auto mb-3 w-fit shrink-0">
              <TabsTrigger value="manual">Thủ công</TabsTrigger>
              <TabsTrigger value="ai">AI tạo</TabsTrigger>
            </TabsList>

            <TabsContent
              value="manual"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {editingArc ? (
                <PlotArcEditor
                  arc={editingArc}
                  onCloseAction={() => setEditingArcId(null)}
                />
              ) : (
                <PlotArcList
                  novelId={novelId}
                  onEditArcAction={setEditingArcId}
                />
              )}
            </TabsContent>

            <TabsContent
              value="ai"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {proposal ? (
                <PlotProposalPreview
                  novelId={novelId}
                  proposal={proposal}
                  onDoneAction={() => {
                    setProposal(null);
                    setView("manual");
                  }}
                  onDiscardAction={() => setProposal(null)}
                />
              ) : (
                <>
                  <PlotAiGeneratePanel
                    novelId={novelId}
                    onProposalAction={setProposal}
                  />
                  <div className="space-y-2 border-t pt-3">
                    <PlotModelRow novelId={novelId} />
                    <PlotPromptCollapsible novelId={novelId} />
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
