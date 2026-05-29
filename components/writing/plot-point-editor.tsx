"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PlotPoint } from "@/lib/db";
import { Trash2Icon } from "lucide-react";

const STATUS_OPTIONS: { value: PlotPoint["status"]; label: string }[] = [
  { value: "planned", label: "Dự định" },
  { value: "in-progress", label: "Đang diễn ra" },
  { value: "resolved", label: "Đã giải quyết" },
];

export function PlotPointEditor({
  point,
  index,
  onChangeAction,
  onDeleteAction,
}: {
  point: PlotPoint;
  index: number;
  onChangeAction: (updated: PlotPoint) => void;
  onDeleteAction: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          Điểm {index + 1}
        </span>
        <Input
          value={point.title}
          onChange={(e) => onChangeAction({ ...point, title: e.target.value })}
          className="h-7 text-xs"
          placeholder="Tiêu đề điểm cốt truyện"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDeleteAction}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Textarea
        value={point.description}
        onChange={(e) =>
          onChangeAction({ ...point, description: e.target.value })
        }
        rows={2}
        className="text-xs resize-y"
        placeholder="Mô tả"
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Chương đích</Label>
          <Input
            type="number"
            min={1}
            value={point.chapterOrder ?? ""}
            onChange={(e) =>
              onChangeAction({
                ...point,
                chapterOrder: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            className="h-7 text-xs"
            placeholder="—"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <NativeSelect
            className="h-7 text-xs"
            value={point.status}
            onChange={(e) =>
              onChangeAction({
                ...point,
                status: e.target.value as PlotPoint["status"],
              })
            }
          >
            {STATUS_OPTIONS.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hook cốt lõi</Label>
          <div className="flex h-7 items-center">
            <Switch
              checked={point.coreHook ?? false}
              onCheckedChange={(v) =>
                onChangeAction({ ...point, coreHook: v })
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Kết quả mong đợi (tùy chọn)
        </Label>
        <Input
          value={point.expectedPayoff ?? ""}
          onChange={(e) =>
            onChangeAction({
              ...point,
              expectedPayoff: e.target.value || undefined,
            })
          }
          className="h-7 text-xs"
          placeholder="Tùy chọn"
        />
      </div>
    </div>
  );
}
