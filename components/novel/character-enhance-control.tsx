"use client";

import { Button } from "@/components/ui/button";
import { LineEditor } from "@/components/ui/line-editor";
import type { Character } from "@/lib/db";
import { enhanceCharacter } from "@/lib/writing/character-ai";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CharacterEnhanceControl({
  novelId,
  charId,
  onApplyAction,
}: {
  novelId: string;
  charId: string;
  onApplyAction: (fields: Partial<Character>) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [enhancing, setEnhancing] = useState(false);

  const handleEnhance = async () => {
    setEnhancing(true);
    try {
      const { fields, partial } = await enhanceCharacter(novelId, charId, {
        instruction: instruction.trim() || undefined,
      });
      onApplyAction(fields);
      if (partial) {
        toast.info("Ngữ cảnh một phần — chạy phân tích để có kết quả tốt hơn");
      } else {
        toast.success("Đã đề xuất hồ sơ — kiểm tra rồi lưu");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cải thiện thất bại");
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <div className="flex items-end gap-2 rounded-lg border border-dashed p-2">
      <div className="flex-1">
        <LineEditor
          value={instruction}
          onChange={setInstruction}
          placeholder="Hướng dẫn thêm (tùy chọn)"
          className="h-12 min-h-12"
          contentFont="text-xs leading-5"
          gutterFont="text-xs leading-5"
          readOnly={enhancing}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleEnhance}
        disabled={enhancing}
      >
        {enhancing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <SparklesIcon className="size-3.5" />
        )}
        Cải thiện AI
      </Button>
    </div>
  );
}
