import { db } from "@/lib/db";
import type { ReviewAgentOutput } from "@/lib/writing/types";

export interface AuditHistoryEntry {
  chapterOrder: number;
  type: string;
  description: string;
  migratedAt: string;
}

export async function persistAuditHistory(
  novelId: string,
  chapterOrder: number,
  audit: ReviewAgentOutput,
): Promise<void> {
  const record = await db.storyStates.get(novelId);
  if (!record) return;

  const existing: AuditHistoryEntry[] = record.auditHistory ?? [];

  const newEntries: AuditHistoryEntry[] = audit.issues
    .filter((i) => i.severity === "critical" || i.severity === "minor")
    .map((i) => ({
      chapterOrder,
      type: i.type,
      description: i.description,
      migratedAt: new Date().toISOString(),
    }));

  const filtered = existing.filter((e) => e.chapterOrder !== chapterOrder);

  await db.storyStates.update(novelId, {
    auditHistory: [...filtered, ...newEntries],
    updatedAt: new Date(),
  });
}

export function extractMustAvoidFromHistory(
  history: AuditHistoryEntry[],
  maxEntries = 5,
): string[] {
  return history
    .slice(-maxEntries)
    .map((e) => `[${e.type}] ${e.description}`);
}
