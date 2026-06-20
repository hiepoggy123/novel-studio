import { buildSignature } from "@/lib/continuity/signature";
import { normalizeSubject } from "@/lib/continuity/subject-normalize";
import type {
  DetectedFinding,
  DetectorCtx,
  LedgerFact,
  ScanLedger,
} from "@/lib/continuity/schemas";

/**
 * Deterministic: group observed facts by (normalized subject + predicate); a
 * group with ≥2 distinct objects is a contradiction. Objects are compared by
 * normalized exact string — no fuzzy merge, since a false negative is safer
 * than a false positive here.
 */
export function detectFactConflicts(
  ledger: ScanLedger,
  ctx: DetectorCtx,
): DetectedFinding[] {
  const groups = new Map<string, LedgerFact[]>();
  for (const fact of ledger.facts) {
    const subject = normalizeSubject(fact.subject, ctx.aliasMap);
    const predicate = fact.predicate.trim().toLowerCase();
    if (!subject || !predicate) continue;
    const key = `${subject}|${predicate}`;
    const list = groups.get(key);
    if (list) list.push(fact);
    else groups.set(key, [fact]);
  }

  const stable = new Set((ctx.stablePredicates ?? []).map((p) => p.toLowerCase()));
  const findings: DetectedFinding[] = [];

  for (const facts of groups.values()) {
    // earliest fact per distinct (normalized) object
    const byObject = new Map<string, LedgerFact>();
    for (const f of facts) {
      const obj = f.object.trim().toLowerCase();
      const prev = byObject.get(obj);
      if (!prev || f.chapterOrder < prev.chapterOrder) byObject.set(obj, f);
    }
    if (byObject.size < 2) continue;

    const conflicting = [...byObject.values()].sort(
      (a, b) => a.chapterOrder - b.chapterOrder,
    );
    const rawSubject = conflicting[0].subject.trim();
    const subjectNorm = normalizeSubject(rawSubject, ctx.aliasMap);
    // Display the canonical (alias-resolved) name, not whichever surface form
    // happened to appear first.
    const subject = ctx.aliasMap?.get(rawSubject.toLowerCase()) ?? rawSubject;
    const predicate = conflicting[0].predicate.trim();
    const predicateNorm = predicate.toLowerCase();

    findings.push({
      type: "fact-conflict",
      severity: stable.has(predicateNorm) ? "high" : "medium",
      confidence: 1,
      title: `Mâu thuẫn dữ kiện: ${subject} — ${predicate}`,
      description: `"${subject} ${predicate}" được mô tả khác nhau giữa các chương: ${conflicting
        .map((f) => `“${f.object.trim()}” (ch.${f.chapterOrder})`)
        .join(", ")}.`,
      evidence: conflicting.map((f) => ({
        chapterOrder: f.chapterOrder,
        chapterId: ledger.chapterIdByOrder.get(f.chapterOrder),
        quote: `${subject} ${predicate}: ${f.object.trim()}`,
      })),
      // Identity = subject + predicate only. A later scan that adds another
      // conflicting object/chapter must NOT change the signature, or a dismissed
      // finding would silently re-open. Evidence still refreshes on re-scan.
      signature: buildSignature("fact-conflict", [subjectNorm, predicateNorm], []),
    });
  }

  return findings;
}
