import { db } from "@/lib/db";
import { computeStyleMetrics, formatFingerprint } from "./fingerprint";

export async function getCachedFingerprint(novelId: string): Promise<string | null> {
  const settings = await db.writingSettings.get(novelId);
  return settings?.styleFingerprint ?? null;
}

export async function recomputeAndCacheFingerprint(novelId: string): Promise<string> {
  const scenes = await db.scenes
    .where("novelId")
    .equals(novelId)
    .and((s) => s.isActive === 1)
    .toArray();

  if (scenes.length === 0) return "";

  const metrics = computeStyleMetrics(scenes.map((s) => ({ content: s.content })));
  const fingerprint = formatFingerprint(metrics);

  const existing = await db.writingSettings.get(novelId);
  if (existing) {
    await db.writingSettings.update(novelId, {
      styleFingerprint: fingerprint,
      updatedAt: new Date(),
    });
  }

  return fingerprint;
}

export async function getOrComputeFingerprint(novelId: string): Promise<string> {
  const cached = await getCachedFingerprint(novelId);
  if (cached) return cached;
  return recomputeAndCacheFingerprint(novelId);
}
