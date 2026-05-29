import type { ReviewAgentOutput } from "./types";
import type { WritingSettings } from "@/lib/db";

export const REVISE_EPSILON = 0.5;

export function shouldRevise(
  audit: ReviewAgentOutput,
  bestScore: number,
  settings: Pick<WritingSettings, "minScoreToAutoAccept" | "maxAutoRetries">,
  retryCount: number,
): boolean {
  const threshold = settings.minScoreToAutoAccept ?? 7;
  const maxRetries = settings.maxAutoRetries ?? 2;

  if (retryCount >= maxRetries) return false;

  const hasCritical = audit.issues.some((i) => i.severity === "critical");
  const belowThreshold = audit.overallScore < threshold;

  if (!hasCritical && !belowThreshold) return false;

  if (retryCount === 0) return true;

  return audit.overallScore > bestScore + REVISE_EPSILON;
}
