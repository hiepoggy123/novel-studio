"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckIcon, PencilLineIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

export function EditableText({
  value,
  onSave,
  placeholder = "Nhấn để chỉnh sửa...",
  multiline = false,
  markdown = false,
  className = "",
  displayClassName = "",
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  markdown?: boolean;
  className?: string;
  displayClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Sync draft when value changes externally (only when not editing)
  if (!editing && draft !== value) {
    setDraft(value);
  }

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    const InputComponent = multiline ? Textarea : Input;
    return (
      <div className={`flex items-start gap-1.5 ${className}`}>
        <InputComponent
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !multiline) handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className={`focus-visible:ring-0 ${multiline ? "flex-1 min-h-[80px] text-sm" : "text-sm"}`}
        />
        <div className={`flex ${multiline ? "flex-col" : "flex-row"}`}>
          <Button variant="ghost" size="icon-sm" onClick={handleSave}>
            <CheckIcon className="size-3.5 text-green-500" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleCancel}>
            <XIcon className="size-3.5 text-red-500" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex cursor-pointer items-start gap-1.5 ${className}`}
      onClick={() => setEditing(true)}
    >
      {!markdown ? (
        <div
          className={cn(
            "flex-1 text-sm",
            multiline ? "whitespace-pre-wrap" : "truncate",
            value
              ? displayClassName
              : `${displayClassName} text-muted-foreground italic`,
          )}
        >
          {value || placeholder}
        </div>
      ) : (
        <Streamdown mode="streaming">{value || placeholder}</Streamdown>
      )}
      <PencilLineIcon className="mt-1.25 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
    </div>
  );
}
