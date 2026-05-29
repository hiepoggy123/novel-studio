"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CharacterAIFields } from "@/lib/writing/character-ai-schema";

export function CharacterCandidateCard({
  candidate,
  checked,
  collision,
  onToggleAction,
}: {
  candidate: CharacterAIFields;
  checked: boolean;
  collision: boolean;
  onToggleAction: (checked: boolean) => void;
}) {
  return (
    <Card
      className={cn(
        "flex gap-2.5 p-3 transition-colors",
        checked ? "border-primary/40" : "opacity-60",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onToggleAction(v === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{candidate.name}</span>
          {candidate.role && (
            <Badge variant="outline" className="text-[10px]">
              {candidate.role}
            </Badge>
          )}
          {collision && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="size-3" />
              Trùng tên
            </span>
          )}
        </div>
        {candidate.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {candidate.description}
          </p>
        )}
        {candidate.motivations && (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/70">
            Động lực: {candidate.motivations}
          </p>
        )}
      </div>
    </Card>
  );
}
