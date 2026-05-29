"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type WritingSession } from "@/lib/db";

export function useWritingSessions(novelId: string | undefined) {
  return useLiveQuery(
    () =>
      novelId
        ? db.writingSessions
            .where("novelId")
            .equals(novelId)
            .reverse()
            .sortBy("createdAt")
        : [],
    [novelId],
  );
}

export function useWritingSession(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.writingSessions.get(id) : undefined),
    [id],
  );
}

/** Return the latest session, preferring active > paused > error > completed. */
export function useActiveSession(novelId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!novelId) return undefined;
      const sessions = await db.writingSessions
        .where("novelId")
        .equals(novelId)
        .toArray();
      if (sessions.length === 0) return undefined;
      // Sort by updatedAt descending
      sessions.sort(
        (a, b) =>
          (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
      );
      // Prefer active/paused over others
      const priority = ["active", "paused", "error", "completed"] as const;
      for (const status of priority) {
        const match = sessions.find((s) => s.status === status);
        if (match) return match;
      }
      return sessions[0];
    },
    [novelId],
  );
}

/** Find the session for a specific chapter plan. */
export function useSessionByPlan(chapterPlanId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!chapterPlanId) return undefined;
      return db.writingSessions
        .where("chapterPlanId")
        .equals(chapterPlanId)
        .first();
    },
    [chapterPlanId],
  );
}

export async function createWritingSession(
  data: Omit<WritingSession, "id" | "createdAt" | "updatedAt">,
) {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.writingSessions.add({ ...data, id, createdAt: now, updatedAt: now });
  return id;
}

export async function updateWritingSession(
  id: string,
  data: Partial<Omit<WritingSession, "id" | "createdAt">>,
) {
  await db.writingSessions.update(id, { ...data, updatedAt: new Date() });
}

/** Delete all step results, reset session to context, clear plan directions/outline/scenes. */
export async function resetWritingSessionProgress(sessionId: string) {
  const session = await db.writingSessions.get(sessionId);
  if (!session) throw new Error("Writing session not found");
  const now = new Date();
  await db.transaction(
    "rw",
    db.writingStepResults,
    db.writingSessions,
    db.chapterPlans,
    async () => {
      await db.writingStepResults.where("sessionId").equals(sessionId).delete();
      await db.writingSessions.update(sessionId, {
        currentStep: "plan",
        status: "active",
        stateHash: undefined,
        updatedAt: now,
      });
      await db.chapterPlans.update(session.chapterPlanId, {
        directions: [],
        outline: "",
        scenes: [],
        status: "planned",
        updatedAt: now,
      });
    },
  );
}
