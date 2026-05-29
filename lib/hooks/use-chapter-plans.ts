"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type ChapterPlan } from "@/lib/db";

export function useChapterPlans(novelId: string | undefined) {
  return useLiveQuery(
    () =>
      novelId
        ? db.chapterPlans
            .where("novelId")
            .equals(novelId)
            .sortBy("chapterOrder")
        : [],
    [novelId],
  );
}

export function useChapterPlan(id: string | undefined) {
  return useLiveQuery(() => (id ? db.chapterPlans.get(id) : undefined), [id]);
}

export async function getNextChapterOrder(novelId: string): Promise<number> {
  const [chapters, plans] = await Promise.all([
    db.chapters.where("novelId").equals(novelId).toArray(),
    db.chapterPlans.where("novelId").equals(novelId).toArray(),
  ]);
  const maxChapter = chapters.reduce((m, c) => Math.max(m, c.order), 0);
  const maxPlan = plans.reduce((m, p) => Math.max(m, p.chapterOrder), 0);
  return Math.max(maxChapter, maxPlan) + 1;
}

export async function createChapterPlan(
  data: Omit<ChapterPlan, "id" | "createdAt" | "updatedAt">,
) {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.chapterPlans.add({ ...data, id, createdAt: now, updatedAt: now });
  return id;
}

export async function updateChapterPlan(
  id: string,
  data: Partial<Omit<ChapterPlan, "id" | "createdAt">>,
) {
  await db.chapterPlans.update(id, { ...data, updatedAt: new Date() });
}

export async function deleteChapterPlan(id: string) {
  await db.chapterPlans.delete(id);
}
