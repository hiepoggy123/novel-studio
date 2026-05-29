"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { deletePlotArc, updatePlotArc } from "@/lib/hooks/use-plot-arcs";
import type { PlotArc, PlotPoint } from "@/lib/db";
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlotPointEditor } from "./plot-point-editor";

const TYPE_OPTIONS: { value: PlotArc["type"]; label: string }[] = [
  { value: "main", label: "Tuyến chính" },
  { value: "subplot", label: "Tuyến phụ" },
  { value: "character", label: "Tuyến nhân vật" },
];

const STATUS_OPTIONS: { value: PlotArc["status"]; label: string }[] = [
  { value: "active", label: "Đang diễn ra" },
  { value: "completed", label: "Hoàn thành" },
  { value: "abandoned", label: "Bỏ dở" },
];

export function PlotArcEditor({
  arc,
  onCloseAction,
}: {
  arc: PlotArc;
  onCloseAction: () => void;
}) {
  const [title, setTitle] = useState(arc.title);
  const [description, setDescription] = useState(arc.description);
  const [type, setType] = useState<PlotArc["type"]>(arc.type);
  const [status, setStatus] = useState<PlotArc["status"]>(arc.status);
  const [points, setPoints] = useState<PlotPoint[]>(arc.plotPoints);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(arc.title);
    setDescription(arc.description);
    setType(arc.type);
    setStatus(arc.status);
    setPoints(arc.plotPoints);
  }, [arc]);

  const handleAddPoint = () => {
    setPoints((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: "",
        description: "",
        status: "planned",
      },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePlotArc(arc.id, {
        title: title.trim(),
        description: description.trim(),
        type,
        status,
        plotPoints: points,
      });
      toast.success("Đã lưu tuyến truyện");
      onCloseAction();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-1 pb-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCloseAction}
        >
          <ArrowLeftIcon className="h-3.5 w-3.5 mr-1" />
          Danh sách
        </Button>
        <span className="text-sm font-medium truncate">
          {title || "(chưa đặt tên)"}
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Tiêu đề tuyến truyện</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Mô tả</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="text-xs resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Loại</Label>
            <NativeSelect
              className="h-8 text-xs"
              value={type}
              onChange={(e) => setType(e.target.value as PlotArc["type"])}
            >
              {TYPE_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Trạng thái</Label>
            <NativeSelect
              className="h-8 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as PlotArc["status"])}
            >
              {STATUS_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            Điểm cốt truyện ({points.length})
          </Label>
          {points.map((p, i) => (
            <PlotPointEditor
              key={p.id}
              point={p}
              index={i}
              onChangeAction={(updated) =>
                setPoints((prev) =>
                  prev.map((x, idx) => (idx === i ? updated : x)),
                )
              }
              onDeleteAction={() =>
                setPoints((prev) => prev.filter((_, idx) => idx !== i))
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddPoint}
          >
            <PlusIcon className="h-3 w-3 mr-1" />
            Thêm điểm
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-1 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={saving}
          onClick={async () => {
            await deletePlotArc(arc.id);
            toast.success("Đã xóa tuyến truyện");
            onCloseAction();
          }}
        >
          <Trash2Icon className="h-3.5 w-3.5 mr-1" />
          Xóa tuyến
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </div>
  );
}
