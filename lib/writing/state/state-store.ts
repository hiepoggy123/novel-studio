import { db } from "@/lib/db";
import type { StoryStateSnapshot, CharacterStatePatch } from "@/lib/writing/state/schemas";

export async function loadStoryState(novelId: string): Promise<StoryStateSnapshot | undefined> {
  const record = await db.storyStates.get(novelId);
  if (!record) return undefined;
  return record as StoryStateSnapshot;
}

export async function saveStoryState(
  novelId: string,
  snapshot: StoryStateSnapshot,
): Promise<void> {
  await db.storyStates.put({ id: novelId, ...snapshot });
}

export async function applyStatePatch(
  novelId: string,
  patches: CharacterStatePatch[],
): Promise<void> {
  if (patches.length === 0) return;

  await db.transaction("rw", db.storyStates, async () => {
    const record = await db.storyStates.get(novelId);
    if (!record) return;
    const current = record as StoryStateSnapshot;

    const states = [...current.characterStates];
    for (const patch of patches) {
      const idx = states.findIndex((s) => s.name === patch.name);
      if (idx >= 0) {
        states[idx] = {
          ...states[idx],
          ...(patch.currentState !== undefined ? { currentState: patch.currentState } : {}),
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        };
      } else {
        states.push({
          name: patch.name,
          currentState: patch.currentState ?? "",
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        });
      }
    }

    await db.storyStates.put({
      id: novelId,
      ...current,
      characterStates: states,
      updatedAt: new Date(),
    });
  });
}
