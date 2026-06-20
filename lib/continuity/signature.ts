import type { ContinuityFindingType } from "@/lib/db";

/**
 * Build a stable, order-independent dedupe key for a finding. Same logical
 * issue across re-scans yields the same signature, so a dismissed/resolved
 * finding stays dismissed/resolved. Kept human-readable (not hashed) for
 * debuggability — collisions only happen for genuinely identical issues.
 */
export function buildSignature(
  type: ContinuityFindingType,
  keyParts: string[],
  chapters: number[],
): string {
  const norm = keyParts
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .sort();
  const chs = [...new Set(chapters)].sort((a, b) => a - b);
  return `${type}|${norm.join("~")}|${chs.join(",")}`;
}
