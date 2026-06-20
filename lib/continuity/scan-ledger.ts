import type { StateDelta } from "@/lib/writing/state/schemas";
import type { LedgerCharPatch, LedgerFact, ScanLedger } from "@/lib/continuity/schemas";

export interface LedgerChapterInput {
  chapterOrder: number;
  chapterId: string;
  text: string;
  delta: StateDelta;
}

function conflictKey(op: {
  title?: string;
  plotPointId?: string;
  plotArcId: string;
}): string {
  // Always scope by plotArcId so two arcs sharing a title (a common LLM output
  // pattern) are not conflated into one conflict.
  const label = (op.title?.trim() || op.plotPointId || "").toLowerCase();
  return `${op.plotArcId}|${label}`;
}

/**
 * Pure builder: turns the full set of per-chapter observation deltas (plus raw
 * chapter text) into a ScanLedger. Detectors read this — never the reducer's
 * compacted snapshot — so cross-chapter history (every observed fact, every
 * conflict open/advance/resolve) survives reducer compaction.
 */
export function buildScanLedger(input: LedgerChapterInput[]): ScanLedger {
  // Sort by chapter order so first/last-seen tracking is correct regardless of
  // the caller's input order.
  const chapters = [...input].sort((a, b) => a.chapterOrder - b.chapterOrder);

  const facts: LedgerFact[] = [];
  const charPatches: LedgerCharPatch[] = [];
  const conflictFirstSeen = new Map<string, number>();
  const conflictLastSeen = new Map<string, number>();
  const resolvedConflicts = new Set<string>();
  const chapterIdByOrder = new Map<number, string>();
  const knownNames = new Set<string>();
  let maxChapterOrder = 0;

  for (const ch of chapters) {
    chapterIdByOrder.set(ch.chapterOrder, ch.chapterId);
    if (ch.chapterOrder > maxChapterOrder) maxChapterOrder = ch.chapterOrder;

    for (const op of ch.delta.factOps) {
      if (op.op === "add") {
        facts.push({
          subject: op.subject,
          predicate: op.predicate,
          object: op.object,
          chapterOrder: ch.chapterOrder,
        });
      }
    }

    for (const patch of ch.delta.characterStatePatches) {
      charPatches.push({
        name: patch.name,
        currentState: patch.currentState,
        location: patch.location,
        status: patch.status,
        chapterOrder: ch.chapterOrder,
      });
      if (patch.name.trim()) knownNames.add(patch.name.trim());
    }

    for (const op of ch.delta.hookOps) {
      const key = conflictKey(op);
      if (!key) continue;
      if (op.op === "add") {
        if (!conflictFirstSeen.has(key)) conflictFirstSeen.set(key, ch.chapterOrder);
        conflictLastSeen.set(key, ch.chapterOrder);
      } else if (op.op === "advance" || op.op === "defer") {
        conflictLastSeen.set(key, ch.chapterOrder);
      } else if (op.op === "resolve") {
        resolvedConflicts.add(key);
        conflictLastSeen.set(key, ch.chapterOrder);
      }
    }
  }

  const charNameIndexByChapter = new Map<number, Set<string>>();
  const names = [...knownNames];
  for (const ch of chapters) {
    const present = new Set<string>();
    for (const name of names) {
      if (ch.text.includes(name)) present.add(name);
    }
    charNameIndexByChapter.set(ch.chapterOrder, present);
  }

  return {
    facts,
    charPatches,
    conflictFirstSeen,
    conflictLastSeen,
    resolvedConflicts,
    charNameIndexByChapter,
    chapterIdByOrder,
    maxChapterOrder,
  };
}
