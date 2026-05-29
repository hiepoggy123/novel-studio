"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Character } from "@/lib/db";
import { createCharacter, updateCharacter } from "@/lib/hooks";
import {
  extractMarkerBlock,
  mergeMarkerBlock,
  stripMarkerBlock,
} from "@/lib/writing/state/entity-sync";
import { ImagePicker } from "@/components/ui/image-picker";
import { CharacterEnhanceControl } from "./character-enhance-control";

type CharacterFields = Omit<
  Character,
  "id" | "novelId" | "createdAt" | "updatedAt"
>;

const EMPTY: CharacterFields = {
  name: "",
  role: "",
  description: "",
};

export function CharacterEditDialog({
  open,
  onOpenChange,
  novelId,
  character,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: string;
  character?: Character;
}) {
  const isEditing = !!character;
  const [fields, setFields] = useState<CharacterFields>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (character) {
        const {
          id: _,
          novelId: __,
          createdAt: ___,
          updatedAt: ____,
          ...rest
        } = character;
        setFields(rest);
      } else {
        setFields(EMPTY);
      }
    }
  }, [open, character]);

  const set = (key: keyof CharacterFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const applyEnhancement = (incoming: Partial<Character>) => {
    const defined = Object.fromEntries(
      Object.entries(incoming).filter(([, v]) => v !== undefined && v !== ""),
    ) as Partial<CharacterFields>;
    setFields((prev) => {
      const next = { ...prev, ...defined };
      if (defined.characterArc !== undefined) {
        const existingBlock = extractMarkerBlock(prev.characterArc);
        const aiHuman = stripMarkerBlock(defined.characterArc);
        next.characterArc = mergeMarkerBlock(aiHuman, existingBlock);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!fields.name.trim()) {
      toast.error("Tên là bắt buộc");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await updateCharacter(character.id, fields);
        toast.success("Đã cập nhật nhân vật");
      } else {
        await createCharacter({ novelId, ...fields });
        toast.success("Đã tạo nhân vật");
      }
      onOpenChange(false);
    } catch {
      toast.error("Lưu nhân vật thất bại");
    } finally {
      setSaving(false);
    }
  };

  const textField = (
    key: keyof CharacterFields,
    label: string,
    multi = false,
  ) => (
    <div key={key} className="w-full">
      <Label className="text-xs">{label}</Label>
      {multi ? (
        <Textarea
          value={(fields[key] as string) ?? ""}
          onChange={(e) => set(key, e.target.value)}
          className="mt-1 text-sm w-full"
          rows={2}
        />
      ) : (
        <Input
          value={(fields[key] as string) ?? ""}
          onChange={(e) => set(key, e.target.value)}
          className="mt-1 text-sm w-full"
        />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Sửa ${character.name}` : "Thêm nhân vật"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] -mr-4">
          <div className="space-y-3 pr-4">
            {isEditing && (
              <CharacterEnhanceControl
                novelId={novelId}
                charId={character.id}
                onApplyAction={applyEnhancement}
              />
            )}
            <div className="flex gap-2">
              <div>
                <Label className="text-xs">Ảnh đại diện</Label>
                <ImagePicker
                  value={fields.imageUrl ?? undefined}
                  onChange={(v) => set("imageUrl", v ?? "")}
                  aspectRatio="aspect-square"
                  maxSize={256}
                  className="mt-1 w-24"
                  placeholder="Avatar"
                />
              </div>
              <div className="flex-1 space-y-2">
                {textField("name", "Tên *")}
                {textField(
                  "role",
                  "Vai trò (nhân vật chính, phản diện, phụ...)",
                )}
              </div>
            </div>
            {textField("description", "Mô tả", true)}
            <div className="grid grid-cols-2 gap-3">
              {textField("age", "Tuổi")}
              {textField("sex", "Giới tính")}
            </div>
            {textField("appearance", "Ngoại hình", true)}
            {textField("personality", "Tính cách", true)}
            {textField("hobbies", "Sở thích")}
            {textField("relationshipWithMC", "Mối quan hệ với nhân vật chính")}
            {textField("characterArc", "Hành trình nhân vật", true)}
            <div className="grid grid-cols-2 gap-3">
              {textField("strengths", "Điểm mạnh")}
              {textField("weaknesses", "Điểm yếu")}
            </div>
            {textField("motivations", "Động lực")}
            {textField("goals", "Mục tiêu")}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Đang lưu..." : isEditing ? "Lưu" : "Thêm nhân vật"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
