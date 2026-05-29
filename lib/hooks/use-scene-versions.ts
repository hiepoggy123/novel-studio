"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type SceneVersionType } from "@/lib/db";

export const MAX_VERSIONS = 10;

/** Reactive query: all inactive versions for a scene, newest first. */
export function useSceneVersions(sceneId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!sceneId) return [];
      const versions = await db.scenes
        .where("activeSceneId")
        .equals(sceneId)
        .sortBy("version");
      return versions.reverse(); // newest first
    },
    [sceneId],
  );
}

/**
 * Create a new version (inactive Scene row) for the given active scene.
 * Returns the new version's ID, or null if limit reached.
 */
export async function createSceneVersion(
  sceneId: string,
  novelId: string,
  type: SceneVersionType,
  content: string,
): Promise<string | null> {
  return db.transaction("rw", db.scenes, async () => {
    const existing = await db.scenes
      .where("activeSceneId")
      .equals(sceneId)
      .toArray();

    if (existing.length >= MAX_VERSIONS) return null;

    const nextVersion =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((v) => v.version)) + 1;

    const activeScene = await db.scenes.get(sceneId);
    if (!activeScene) return null;

    const id = crypto.randomUUID();
    await db.scenes.add({
      id,
      chapterId: activeScene.chapterId,
      novelId,
      title: activeScene.title,
      content,
      order: activeScene.order,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      version: nextVersion,
      versionType: type,
      isActive: 0,
      activeSceneId: sceneId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  });
}

/**
 * Bootstrap v1 (manual) if a scene has no versions yet.
 * Skips if versions already exist or content is empty.
 */
export async function ensureInitialVersion(
  sceneId: string,
  novelId: string,
  content: string,
): Promise<void> {
  if (!content.trim()) return;
  // Atomic check-then-create to prevent duplicate v1 under concurrency
  await db.transaction("rw", db.scenes, async () => {
    const count = await db.scenes
      .where("activeSceneId")
      .equals(sceneId)
      .count();
    if (count > 0) return;

    const activeScene = await db.scenes.get(sceneId);
    if (!activeScene) return;

    await db.scenes.add({
      id: crypto.randomUUID(),
      chapterId: activeScene.chapterId,
      novelId,
      title: activeScene.title,
      content,
      order: activeScene.order,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      version: 1,
      versionType: "manual",
      isActive: 0,
      activeSceneId: sceneId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
}

/**
 * Insert a scene version row directly, without opening a nested transaction.
 * Safe to call inside an existing Dexie transaction that already holds db.scenes.
 * Does NOT enforce MAX_VERSIONS — callers that need the limit should use createSceneVersion.
 */
export async function insertSceneVersionRow(
  activeScene: { id: string; chapterId: string; title: string; order: number },
  novelId: string,
  type: SceneVersionType,
  content: string,
): Promise<void> {
  const existing = await db.scenes
    .where("activeSceneId")
    .equals(activeScene.id)
    .toArray();

  if (existing.length >= MAX_VERSIONS) return;

  const nextVersion =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((v) => v.version)) + 1;

  await db.scenes.add({
    id: crypto.randomUUID(),
    chapterId: activeScene.chapterId,
    novelId,
    title: activeScene.title,
    content,
    order: activeScene.order,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    version: nextVersion,
    versionType: type,
    isActive: 0,
    activeSceneId: activeScene.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/** Delete a single version (inactive scene) by ID. */
export async function deleteSceneVersion(id: string): Promise<void> {
  await db.scenes.delete(id);
}

/** Delete multiple versions by IDs. */
export async function deleteSceneVersions(ids: string[]): Promise<void> {
  await db.scenes.bulkDelete(ids);
}

/** Delete all versions for a scene. */
export async function deleteAllSceneVersions(sceneId: string): Promise<void> {
  await db.scenes.where("activeSceneId").equals(sceneId).delete();
}
