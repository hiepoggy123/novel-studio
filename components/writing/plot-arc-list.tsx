"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  createPlotArc,
  deletePlotArc,
  usePlotArcs,
} from "@/lib/hooks/use-plot-arcs";
import type { PlotArc } from "@/lib/db";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<PlotArc["type"], string> = {
  main: "Chính",
  subplot: "Phụ",
  character: "Nhân vật",
};

const STATUS_STYLE: Record<PlotArc["status"], string> = {
  active: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  abandoned: "bg-secondary text-muted-foreground",
};

export function PlotArcList({
  novelId,
  onEditArcAction,
}: {
  novelId: string;
  onEditArcAction: (arcId: string) => void;
}) {
  const arcs = usePlotArcs(novelId);

  const handleCreate = async () => {
    const id = await createPlotArc({
      novelId,
      title: "Tuyến truyện mới",
      description: "",
      type: "subplot",
      plotPoints: [],
      status: "active",
    });
    onEditArcAction(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-1 pb-3">
        <span className="text-sm font-medium">
          Tuyến truyện ({arcs?.length ?? 0})
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleCreate}
        >
          <PlusIcon className="h-3 w-3 mr-1" />
          Thêm tuyến
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-1 py-3">
        {arcs && arcs.length > 0 ? (
          arcs.map((arc) => (
            <div
              key={arc.id}
              className="group/arc flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {arc.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {TYPE_LABEL[arc.type]}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[arc.status]}`}
                  >
                    {arc.plotPoints.length} điểm
                  </span>
                </div>
                {arc.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {arc.description}
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => onEditArcAction(arc.id)}
                title="Chỉnh sửa"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Xóa"
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xóa tuyến truyện?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tuyến &quot;{arc.title}&quot; và toàn bộ điểm cốt truyện sẽ
                      bị xóa vĩnh viễn.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await deletePlotArc(arc.id);
                        toast.success("Đã xóa tuyến truyện");
                      }}
                    >
                      Xóa
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        ) : (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            Chưa có tuyến truyện. Thêm thủ công hoặc dùng AI để tạo.
          </p>
        )}
      </div>
    </div>
  );
}
