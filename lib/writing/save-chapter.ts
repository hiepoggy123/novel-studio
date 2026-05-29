import { db } from "@/lib/db";
import { countWords } from "@/lib/utils";
import { createSceneVersion, insertSceneVersionRow } from "@/lib/hooks/use-scene-versions";
import type { OutlineAgentOutput } from "./types";

export interface SavedChapterResult {
  chapterId: string;
  sceneId: string;
}

export async function saveGeneratedChapter(options: {
  novelId: string;
  sessionId: string;
  chapterPlanId: string;
  outline: OutlineAgentOutput;
}): Promise<SavedChapterResult> {
  const { novelId, sessionId, chapterPlanId, outline } = options;

  const chapterPlan = await db.chapterPlans.get(chapterPlanId);
  if (!chapterPlan) throw new Error("Chapter plan not found");

  const [rewriteResult, writerResult] = await Promise.all([
    db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, "revise"])
      .first(),
    db.writingStepResults
      .where("[sessionId+role]")
      .equals([sessionId, "writer"])
      .first(),
  ]);

  const finalContent =
    rewriteResult?.status === "completed" && rewriteResult.output
      ? rewriteResult.output
      : (writerResult?.output ?? "");

  if (!finalContent) throw new Error("No content to save");

  return upsertChapterWithScene({
    novelId,
    chapterPlanId,
    chapterPlan,
    outline,
    content: finalContent,
  });
}

export interface UpsertChapterOptions {
  novelId: string;
  chapterPlanId: string;
  chapterPlan: { chapterId?: string; chapterOrder: number };
  outline: OutlineAgentOutput;
  content: string;
}

export async function upsertChapterWithScene(
  options: UpsertChapterOptions,
): Promise<SavedChapterResult> {
  const { novelId, chapterPlanId, chapterPlan, outline, content } = options;
  const now = new Date();

  if (chapterPlan.chapterId) {
    const chapterRow = await db.chapters.get(chapterPlan.chapterId);
    const activeScene = chapterRow
      ? await db.scenes
          .where("[chapterId+isActive]")
          .equals([chapterPlan.chapterId, 1])
          .first()
      : undefined;

    if (chapterRow && activeScene) {
      await createSceneVersion(activeScene.id, novelId, "ai-write", content);

      await db.scenes.update(activeScene.id, {
        content,
        wordCount: countWords(content),
        updatedAt: now,
      });

      return { chapterId: chapterPlan.chapterId, sceneId: activeScene.id };
    }
    // Referenced chapter was deleted — fall through and create a fresh one.
  }

  const chapterId = crypto.randomUUID();
  const sceneId = crypto.randomUUID();

  await db.chapters.add({
    id: chapterId,
    novelId,
    title: outline.chapterTitle,
    order: chapterPlan.chapterOrder,
    summary: outline.synopsis,
    createdAt: now,
    updatedAt: now,
  });

  await db.scenes.add({
    id: sceneId,
    chapterId,
    novelId,
    title: outline.chapterTitle,
    content,
    order: 1,
    wordCount: countWords(content),
    version: 1,
    versionType: "ai-write",
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.chapterPlans.update(chapterPlanId, {
    chapterId,
    status: "saved",
    updatedAt: now,
  });

  return { chapterId, sceneId };
}

export interface UpsertInsideTxnOptions {
  novelId: string;
  chapterPlan: { chapterId?: string; chapterOrder: number };
  outline: OutlineAgentOutput;
  content: string;
}

export async function upsertChapterInsideTxn(
  options: UpsertInsideTxnOptions,
): Promise<SavedChapterResult> {
  const { novelId, chapterPlan, outline, content } = options;
  const now = new Date();

  if (chapterPlan.chapterId) {
    const chapterRow = await db.chapters.get(chapterPlan.chapterId);
    const activeScene = chapterRow
      ? await db.scenes
          .where("[chapterId+isActive]")
          .equals([chapterPlan.chapterId, 1])
          .first()
      : undefined;

    if (chapterRow && activeScene) {
      await insertSceneVersionRow(activeScene, novelId, "ai-write", content);

      await db.scenes.update(activeScene.id, {
        content,
        wordCount: countWords(content),
        updatedAt: now,
      });

      return { chapterId: chapterPlan.chapterId, sceneId: activeScene.id };
    }
    // Referenced chapter was deleted — fall through and create a fresh one.
  }

  const chapterId = crypto.randomUUID();
  const sceneId = crypto.randomUUID();

  await db.chapters.add({
    id: chapterId,
    novelId,
    title: outline.chapterTitle,
    order: chapterPlan.chapterOrder,
    summary: outline.synopsis,
    createdAt: now,
    updatedAt: now,
  });

  await db.scenes.add({
    id: sceneId,
    chapterId,
    novelId,
    title: outline.chapterTitle,
    content,
    order: 1,
    wordCount: countWords(content),
    version: 1,
    versionType: "ai-write",
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });

  return { chapterId, sceneId };
}
