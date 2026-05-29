"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { StoryState } from "@/lib/db";
import { saveStoryState } from "@/lib/writing/state/state-store";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

export function useStoryState(novelId: string | undefined) {
  return useLiveQuery(
    () => (novelId ? db.storyStates.get(novelId).then((r) => r ?? null) : null),
    [novelId],
  );
}

export async function updateStoryState(
  novelId: string,
  patch: Partial<Omit<StoryState, "id">>,
): Promise<void> {
  const existing = await db.storyStates.get(novelId);
  if (!existing) return;
  const updated: StoryState = { ...existing, ...patch, updatedAt: new Date() };
  await saveStoryState(novelId, updated as StoryStateSnapshot);
}
