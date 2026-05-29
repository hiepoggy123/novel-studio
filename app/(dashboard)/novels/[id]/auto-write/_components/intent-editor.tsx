"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LineEditor } from "@/components/ui/line-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlotArcs } from "@/lib/hooks";
import { updateChapterPlan } from "@/lib/hooks/use-chapter-plans";
import type { ChapterIntent } from "@/lib/writing/intent-schema";
import { ChapterIntentSchema } from "@/lib/writing/intent-schema";
import { useState } from "react";
import { toast } from "sonner";

interface IntentEditorProps {
  novelId: string;
  planId: string;
  intent: ChapterIntent | null;
  onSaved?: () => void;
}

function ReadOnlyTags({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "secondary" | "destructive" | "outline";
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant={variant} className="font-normal">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function IntentEditor({
  novelId,
  planId,
  intent,
  onSaved,
}: IntentEditorProps) {
  const [draft, setDraft] = useState<ChapterIntent>(
    intent ?? {
      goal: "",
      mustKeep: [],
      mustAvoid: [],
      styleEmphasis: [],
      hookRefs: [],
    },
  );
  const [saving, setSaving] = useState(false);

  const arcs = usePlotArcs(novelId);
  const arcsLoaded = arcs !== undefined;
  const validHookIds = new Set<string>();
  for (const a of arcs ?? []) {
    validHookIds.add(a.id);
    for (const p of a.plotPoints) validHookIds.add(p.id);
  }
  const hookGroups = (arcs ?? [])
    .filter((a) => a.status !== "completed" && a.status !== "abandoned")
    .map((a) => ({
      arc: a,
      points: a.plotPoints.filter((p) => p.status !== "resolved"),
    }))
    .filter((g) => g.points.length > 0);
  const hasHooks = hookGroups.length > 0;

  function toggleHook(id: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      hookRefs: checked
        ? [...d.hookRefs.filter((h) => h !== id), id]
        : d.hookRefs.filter((h) => h !== id),
    }));
  }

  async function save() {
    const cleaned = arcsLoaded
      ? { ...draft, hookRefs: draft.hookRefs.filter((id) => validHookIds.has(id)) }
      : draft;
    const parsed = ChapterIntentSchema.safeParse(cleaned);
    if (!parsed.success) {
      toast.error("Dữ liệu không hợp lệ: " + parsed.error.issues[0]?.message);
      return;
    }
    setSaving(true);
    try {
      await updateChapterPlan(planId, { intent: parsed.data });
      toast.success("Đã lưu ý định chương");
      onSaved?.();
    } catch {
      toast.error("Không thể lưu ý định chương");
    } finally {
      setSaving(false);
    }
  }

  const realSelectedCount = draft.hookRefs.filter((id) =>
    validHookIds.has(id),
  ).length;
  const hookLimitReached = realSelectedCount >= 5;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Mục tiêu chương</Label>
        <LineEditor
          value={draft.goal}
          onChange={(v) => setDraft((d) => ({ ...d, goal: v }))}
          placeholder="Mục tiêu chính của chương (1–2 câu)..."
          className="h-28"
          contentFont="text-xs leading-5"
          gutterFont="text-xs leading-5"
        />
      </div>

      <ReadOnlyTags
        label="Bắt buộc giữ"
        items={draft.mustKeep}
        variant="secondary"
      />
      <ReadOnlyTags label="Cấm" items={draft.mustAvoid} variant="destructive" />
      <ReadOnlyTags
        label="Phong cách"
        items={draft.styleEmphasis}
        variant="outline"
      />

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Hook cần xử lý</Label>
        {!hasHooks ? (
          <p className="text-xs text-muted-foreground">
            Không có hook đang mở. Thêm mạch truyện ở tab Mạch truyện.
          </p>
        ) : (
          <ScrollArea className="h-60 rounded-md border">
            <div className="space-y-3 p-2">
              {hookGroups.map(({ arc, points }) => (
                <div key={arc.id} className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {arc.title}
                  </p>
                  <div className="space-y-1.5 pl-1">
                    {points.map((hook) => {
                      const checked = draft.hookRefs.includes(hook.id);
                      return (
                        <div
                          key={hook.id}
                          className="flex items-start gap-2 text-xs"
                        >
                          <Checkbox
                            id={`hook-${hook.id}`}
                            checked={checked}
                            disabled={!checked && hookLimitReached}
                            onCheckedChange={(v) =>
                              toggleHook(hook.id, v === true)
                            }
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`hook-${hook.id}`}
                            className="cursor-pointer leading-5"
                          >
                            {hook.title}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Button
        onClick={() => void save()}
        disabled={saving}
        size="sm"
        className="w-full"
      >
        {saving ? "Đang lưu..." : "Lưu ý định"}
      </Button>
    </div>
  );
}
