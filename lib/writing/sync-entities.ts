import { db } from "@/lib/db";
import { loadStoryState } from "@/lib/writing/state/state-store";
import {
  buildWorldSyncBlock,
  buildCharacterSyncBlock,
  mergeMarkerBlock,
  selectCharacterFacts,
} from "@/lib/writing/state/entity-sync";

export interface SyncEntitiesResult {
  ok: boolean;
  error?: string;
  charactersUpdated: number;
  charactersCreated: number;
  worldUpdated: boolean;
}

export async function syncStateToEntities(
  novelId: string,
): Promise<SyncEntitiesResult> {
  const snapshot = await loadStoryState(novelId);
  if (!snapshot) {
    return {
      ok: false,
      error: "Chưa có story state — cần bootstrap trước",
      charactersUpdated: 0,
      charactersCreated: 0,
      worldUpdated: false,
    };
  }

  let charactersUpdated = 0;
  let charactersCreated = 0;
  let worldUpdated = false;

  await db.transaction("rw", [db.novels, db.characters], async () => {
    const now = new Date();

    const novel = await db.novels.get(novelId);
    if (novel) {
      const worldBlock = buildWorldSyncBlock(snapshot);
      const merged = mergeMarkerBlock(novel.worldOverview, worldBlock);
      if (merged !== (novel.worldOverview ?? "")) {
        await db.novels.update(novelId, { worldOverview: merged, updatedAt: now });
        worldUpdated = true;
      }
    }

    const existing = await db.characters.where("novelId").equals(novelId).toArray();
    const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

    for (const state of snapshot.characterStates) {
      const key = state.name.trim().toLowerCase();
      if (!key) continue;

      const block = buildCharacterSyncBlock(
        state,
        selectCharacterFacts(snapshot, state.name),
      );
      if (!block) continue;

      const match = byName.get(key);
      if (match) {
        const merged = mergeMarkerBlock(match.characterArc, block);
        if (merged !== (match.characterArc ?? "")) {
          await db.characters.update(match.id, {
            characterArc: merged,
            updatedAt: now,
          });
          charactersUpdated++;
        }
      } else {
        await db.characters.add({
          id: crypto.randomUUID(),
          novelId,
          name: state.name.trim(),
          role: "minor",
          description: "",
          characterArc: mergeMarkerBlock(undefined, block),
          createdAt: now,
          updatedAt: now,
        });
        charactersCreated++;
      }
    }
  });

  return { ok: true, charactersUpdated, charactersCreated, worldUpdated };
}
