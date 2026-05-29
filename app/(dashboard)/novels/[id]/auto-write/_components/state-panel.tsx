"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StoryStateCharacter, StoryStateKnownFact } from "@/lib/db";
import { updateStoryState, useStoryState } from "@/lib/hooks/use-story-state";
import { StoryStateSnapshotSchema } from "@/lib/writing/state/schemas";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  EditIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface StatePanelProps {
  novelId: string;
}

function CharacterRow({
  char,
  editing,
  onChange,
}: {
  char: StoryStateCharacter;
  editing: boolean;
  onChange: (updated: StoryStateCharacter) => void;
}) {
  if (!editing) {
    return (
      <div className="rounded-md border px-3 py-2 space-y-0.5">
        <p className="text-xs font-medium">{char.name}</p>
        {char.location && (
          <p className="text-xs text-muted-foreground">@ {char.location}</p>
        )}
        <p className="text-xs">{char.currentState}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border px-3 py-2 space-y-1.5">
      <Input
        value={char.name}
        onChange={(e) => onChange({ ...char, name: e.target.value })}
        className="h-6 text-xs font-medium"
        placeholder="Tên"
      />
      <Input
        value={char.location ?? ""}
        onChange={(e) => onChange({ ...char, location: e.target.value })}
        className="h-6 text-xs"
        placeholder="Vị trí"
      />
      <Textarea
        value={char.currentState}
        onChange={(e) => onChange({ ...char, currentState: e.target.value })}
        className="text-xs min-h-[48px] resize-none"
        placeholder="Trạng thái"
      />
    </div>
  );
}

export function StatePanel({ novelId }: StatePanelProps) {
  const state = useStoryState(novelId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<typeof state>(undefined);

  const display = editing ? draft : state;

  function startEdit() {
    setDraft(state ? { ...state } : undefined);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(undefined);
    setEditing(false);
  }

  async function saveEdit() {
    if (!draft) return;
    const parsed = StoryStateSnapshotSchema.safeParse({
      lastAppliedChapter: draft.lastAppliedChapter,
      characterStates: draft.characterStates,
      worldFacts: draft.worldFacts,
      openConflicts: draft.openConflicts,
      knownTruths: draft.knownTruths,
      knownFacts: draft.knownFacts,
      chapterHashes: draft.chapterHashes,
      bootstrapComplete: draft.bootstrapComplete,
      updatedAt: draft.updatedAt,
      incomplete: draft.incomplete,
      warnings: draft.warnings,
    });
    if (!parsed.success) {
      toast.error("Dữ liệu không hợp lệ: " + parsed.error.issues[0]?.message);
      return;
    }
    await updateStoryState(novelId, parsed.data);
    setEditing(false);
    setDraft(undefined);
    toast.success("Đã lưu trạng thái truyện");
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
        Chưa có snapshot trạng thái.
      </div>
    );
  }

  const chars = display?.characterStates ?? [];
  const facts = display?.knownFacts ?? [];
  const conflicts = display?.openConflicts ?? [];
  const truths = display?.knownTruths ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Trạng thái truyện</span>
          <Badge variant="secondary" className="text-xs">
            ch.{state.lastAppliedChapter}
          </Badge>
          {state.incomplete && (
            <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
        <div className="flex gap-1">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={cancelEdit}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                className="h-7 w-7"
                onClick={() => void saveEdit()}
              >
                <SaveIcon className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={startEdit}
            >
              <EditIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {state.incomplete && state.warnings && (
        <div className="mx-4 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
          {state.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <ScrollArea className="h-[calc(100svh-200px)] min-h-0">
        <div className="p-4 space-y-4">
          <Section label="Nhân vật" count={chars.length}>
            <div className="space-y-2">
              {chars.map((char, i) => (
                <CharacterRow
                  key={i}
                  char={char}
                  editing={editing}
                  onChange={(updated) => {
                    if (!draft) return;
                    const next = [...draft.characterStates];
                    next[i] = updated;
                    setDraft({ ...draft, characterStates: next });
                  }}
                />
              ))}
            </div>
          </Section>

          <Section label="Bối cảnh thế giới">
            {editing && draft ? (
              <Textarea
                value={draft.worldFacts}
                onChange={(e) =>
                  setDraft({ ...draft, worldFacts: e.target.value })
                }
                className="text-xs min-h-[80px] resize-none"
                placeholder="Bối cảnh thế giới..."
              />
            ) : (
              <p className="text-xs whitespace-pre-wrap">
                {display?.worldFacts || "—"}
              </p>
            )}
          </Section>

          <Section label="Xung đột mở" count={conflicts.length}>
            <div className="space-y-1">
              {conflicts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có</p>
              ) : (
                conflicts.map((c, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      {i + 1}.
                    </span>
                    {editing && draft ? (
                      <Input
                        value={c}
                        onChange={(e) => {
                          const next = [...draft.openConflicts];
                          next[i] = e.target.value;
                          setDraft({ ...draft, openConflicts: next });
                        }}
                        className="h-6 text-xs flex-1"
                      />
                    ) : (
                      <span>{c}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section label="Sự thật bất biến" count={truths.length}>
            <div className="space-y-1">
              {truths.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có</p>
              ) : (
                truths.map((t, i) => (
                  <p key={i} className="text-xs">
                    • {t}
                  </p>
                ))
              )}
            </div>
          </Section>

          <Section
            label="Sự kiện đã xác nhận (knownFacts)"
            count={facts.length}
          >
            <div className="space-y-1.5">
              {facts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có</p>
              ) : (
                facts.map((f, i) => <FactRow key={i} fact={f} />)
              )}
            </div>
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors">
        <ChevronDownIcon className="h-3 w-3 transition-transform data-[state=closed]:-rotate-90" />
        {label}
        {count !== undefined && (
          <span className="ml-auto tabular-nums">{count}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function FactRow({ fact }: { fact: StoryStateKnownFact }) {
  return (
    <div className="rounded-md border px-2.5 py-1.5 text-xs">
      <span className="font-medium">{fact.subject}</span>
      <span className="text-muted-foreground mx-1">{fact.predicate}</span>
      <span>{fact.object}</span>
      <span className="ml-2 text-muted-foreground text-[10px]">
        ch.{fact.sourceChapter}
      </span>
    </div>
  );
}
