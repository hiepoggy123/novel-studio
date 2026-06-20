import { buildSignature } from "@/lib/continuity/signature";
import type {
  DetectedFinding,
  DetectorCtx,
  ScanLedger,
} from "@/lib/continuity/schemas";

/** Strip the `${plotArcId}|` prefix from a conflict key to get a display title. */
function conflictTitle(key: string): string {
  const idx = key.indexOf("|");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

/**
 * Deterministic: a conflict/thread that was opened, never resolved, and has had
 * no activity for ≥ staleGap chapters is flagged as a dangling thread. Also
 * folds in PlotPoints with a stale `lastAdvancedChapter` when plot data exists.
 */
export function detectAbandonedConflicts(
  ledger: ScanLedger,
  ctx: DetectorCtx,
): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  for (const [key, firstSeen] of ledger.conflictFirstSeen) {
    if (ledger.resolvedConflicts.has(key)) continue;
    const lastSeen = ledger.conflictLastSeen.get(key) ?? firstSeen;
    const gap = ledger.maxChapterOrder - lastSeen;
    if (gap < ctx.staleGap) continue;

    const title = conflictTitle(key) || key;
    findings.push({
      type: "abandoned-conflict",
      severity: "low",
      confidence: 1,
      title: `Mạch truyện bỏ lửng: ${title}`,
      description: `Xung đột/tình tiết "${title}" mở ở chương ${firstSeen}, lần cuối nhắc tới ở chương ${lastSeen}, im lặng ${gap} chương (tới chương ${ledger.maxChapterOrder}).`,
      evidence: [
        {
          chapterOrder: lastSeen,
          chapterId: ledger.chapterIdByOrder.get(lastSeen),
          quote: title,
        },
      ],
      // Identity = the conflict key (plotArcId|title), stable across re-scan even
      // as firstSeen/lastSeen shift — so a dismissed thread stays dismissed.
      signature: buildSignature("abandoned-conflict", [key], []),
    });
  }

  for (const pp of ctx.plotPoints ?? []) {
    if (pp.status === "resolved") continue;
    if (pp.lastAdvancedChapter == null) continue;
    const gap = ledger.maxChapterOrder - pp.lastAdvancedChapter;
    if (gap < ctx.staleGap) continue;

    const title = pp.title.trim();
    if (!title) continue;
    findings.push({
      type: "abandoned-conflict",
      severity: "low",
      confidence: 1,
      title: `Tình tiết cốt truyện bỏ lửng: ${title}`,
      description: `Tình tiết "${title}" chưa giải quyết, lần cuối tiến triển ở chương ${pp.lastAdvancedChapter}, im lặng ${gap} chương.`,
      evidence: [
        {
          chapterOrder: pp.lastAdvancedChapter,
          chapterId: ledger.chapterIdByOrder.get(pp.lastAdvancedChapter),
          quote: title,
        },
      ],
      signature: buildSignature("abandoned-conflict", ["plotpoint", title], []),
    });
  }

  return findings;
}
