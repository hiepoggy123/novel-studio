"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineEditor } from "@/components/ui/line-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveCharactersAppend } from "@/lib/writing/auto-generate";
import { generateMoreCharacters } from "@/lib/writing/character-ai";
import type { CharacterAIFields } from "@/lib/writing/character-ai-schema";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CharacterCandidateCard } from "./character-candidate-card";

export function GenerateCharactersDialog({
  open,
  onOpenChangeAction,
  novelId,
  existingNames = [],
}: {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  novelId: string;
  existingNames?: string[];
}) {
  const [count, setCount] = useState(3);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<CharacterAIFields[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await generateMoreCharacters(novelId, {
        count,
        instruction: instruction.trim() || undefined,
      });
      setCandidates(result);
      setSelected(new Set(result.map((_, i) => i)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo nhân vật thất bại");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (index: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const handleSave = async () => {
    const picked = candidates.filter((_, i) => selected.has(i));
    if (picked.length === 0) {
      toast.error("Chưa chọn nhân vật nào");
      return;
    }
    setSaving(true);
    try {
      await saveCharactersAppend(novelId, picked);
      toast.success(`Đã thêm ${picked.length} nhân vật`);
      setCandidates([]);
      setSelected(new Set());
      onOpenChangeAction(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo nhân vật bằng AI</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="w-24">
              <Label className="text-xs">Số lượng</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                  )
                }
                className="mt-1 h-8 text-sm"
                disabled={loading}
              />
            </div>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {candidates.length ? "Tạo lại" : "Tạo"}
            </Button>
          </div>
          <div>
            <Label className="text-xs">Hướng dẫn thêm (tùy chọn)</Label>
            <LineEditor
              value={instruction}
              onChange={setInstruction}
              className="mt-1 h-[64px]"
              contentFont="text-sm leading-5"
              gutterFont="text-xs leading-5"
              readOnly={loading}
              xmlColors
            />
          </div>

          {candidates.length > 0 && (
            <ScrollArea className="h-[40vh] -mr-4">
              <div className="space-y-2 p-1 pr-4">
                {candidates.map((c, i) => (
                  <CharacterCandidateCard
                    key={i}
                    candidate={c}
                    checked={selected.has(i)}
                    collision={existing.has(c.name.trim().toLowerCase())}
                    onToggleAction={(checked) => toggle(i, checked)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={saving || selected.size === 0}>
            {saving ? "Đang lưu..." : `Lưu ${selected.size} nhân vật`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
