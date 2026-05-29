import { db } from "@/lib/db";
import { loadStoryState } from "@/lib/writing/state/state-store";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import { commitChapterState } from "@/lib/writing/commit-chapter-state";
import type { AgentConfig } from "@/lib/writing/types";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

export interface ResyncInput {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  sessionId: string;
  config: AgentConfig;
  chapterPlanId: string;
  outline: { chapterTitle: string; synopsis: string; scenes: unknown[]; totalWordCountTarget: number };
}

export type ResyncResult =
  | { action: "skipped"; reason: string }
  | { action: "resynced"; snapshot: StoryStateSnapshot }
  | { action: "failed"; error: string };

export async function resyncChapterState(input: ResyncInput): Promise<ResyncResult> {
  const { novelId, chapterId, chapterOrder, sessionId, config, chapterPlanId, outline } = input;

  const snapshot = await loadStoryState(novelId);
  if (!snapshot) return { action: "skipped", reason: "no snapshot" };

  const storedHash = snapshot.chapterHashes[String(chapterOrder)];

  const activeScenes = await db.scenes
    .where("[chapterId+isActive]")
    .equals([chapterId, 1])
    .toArray();

  if (activeScenes.length === 0) return { action: "skipped", reason: "no active scenes" };

  const { text, contentHash } = concatActiveScenes(
    activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
  );

  if (storedHash === contentHash) return { action: "skipped", reason: "hash matches" };

  const chapterPlan = await db.chapterPlans.get(chapterPlanId);
  if (!chapterPlan) return { action: "failed", error: "chapter plan not found" };

  const result = await commitChapterState({
    novelId,
    sessionId,
    chapterOrder,
    chapterPlanId,
    observeConfig: config,
    chapterSaveData: {
      novelId,
      chapterPlan: { chapterId, chapterOrder },
      outline: outline as import("./types").OutlineAgentOutput,
      content: text,
    },
  });

  if (!result.ok) return { action: "failed", error: result.error };
  return { action: "resynced", snapshot: result.snapshot };
}
