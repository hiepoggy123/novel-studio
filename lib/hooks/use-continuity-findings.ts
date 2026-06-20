"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { ContinuityFindingStatus } from "@/lib/db";

export function useContinuityFindings(novelId: string | undefined) {
  return useLiveQuery(
    () =>
      novelId
        ? db.continuityFindings.where("novelId").equals(novelId).toArray()
        : [],
    [novelId],
    [],
  );
}

async function setFindingStatus(
  id: string,
  status: ContinuityFindingStatus,
): Promise<void> {
  await db.continuityFindings.update(id, { status, updatedAt: new Date() });
}

export function dismissFinding(id: string): Promise<void> {
  return setFindingStatus(id, "dismissed");
}

export function resolveFinding(id: string): Promise<void> {
  return setFindingStatus(id, "resolved");
}

export function reopenFinding(id: string): Promise<void> {
  return setFindingStatus(id, "open");
}

export async function clearContinuityFindings(novelId: string): Promise<void> {
  await db.continuityFindings.where("novelId").equals(novelId).delete();
}
