import { buildSignature } from "@/lib/continuity/signature";
import type {
  DetectedFinding,
  DetectorCtx,
  ScanLedger,
} from "@/lib/continuity/schemas";

/**
 * Deterministic, end-to-end zero-LLM (reads QT dictionary data only): flags a
 * source name (Chinese token) rendered as more than one Vietnamese name, and
 * approved detected-name readings that disagree with the dictionary mapping.
 * Checks dictionary-level consistency — not in-text rendering, since the source
 * text is not retained per scene.
 */
export function detectNameInconsistencies(
  _ledger: ScanLedger,
  ctx: DetectorCtx,
): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  // Partition by scope: a novel-scoped mapping overrides the global dictionary
  // for that token, so global entries must not be mixed into a novel's grouping
  // (that would flag legitimate per-novel overrides as conflicts).
  const novelByChinese = new Map<string, Set<string>>();
  const globalByChinese = new Map<string, Set<string>>();
  for (const e of ctx.nameEntries ?? []) {
    const cn = e.chinese.trim();
    const vi = e.vietnamese.trim();
    if (!cn || !vi) continue;
    const target = e.scope === ctx.novelId ? novelByChinese : globalByChinese;
    const set = target.get(cn) ?? new Set<string>();
    set.add(vi);
    target.set(cn, set);
  }

  // Effective mapping per token: novel scope wins; fall back to global.
  const byChinese = new Map<string, Set<string>>();
  for (const [cn, set] of globalByChinese) byChinese.set(cn, set);
  for (const [cn, set] of novelByChinese) byChinese.set(cn, set);

  for (const [chinese, viSet] of byChinese) {
    if (viSet.size < 2) continue;
    const variants = [...viSet];
    findings.push({
      type: "name-inconsistency",
      severity: "medium",
      confidence: 1,
      title: `Tên dịch không nhất quán: ${chinese}`,
      description: `"${chinese}" được dịch thành nhiều tên khác nhau: ${variants
        .map((v) => `“${v}”`)
        .join(", ")}.`,
      evidence: [
        { chapterOrder: 0, quote: `${chinese} → ${variants.join(" / ")}` },
      ],
      signature: buildSignature("name-inconsistency", [chinese, ...variants], []),
    });
  }

  for (const nf of ctx.nameFrequencies ?? []) {
    if (nf.status !== "approved") continue;
    const cn = nf.chinese.trim();
    const reading = nf.reading.trim();
    if (!cn || !reading) continue;
    const mapped = byChinese.get(cn);
    if (!mapped || mapped.has(reading)) continue;

    const variants = [...mapped];
    findings.push({
      type: "name-inconsistency",
      severity: "medium",
      confidence: 1,
      title: `Tên phát hiện lệch từ điển: ${cn}`,
      description: `Tên đã duyệt "${cn} → ${reading}" khác với từ điển (${variants
        .map((v) => `“${v}”`)
        .join(", ")}).`,
      evidence: [{ chapterOrder: 0, quote: `${cn}: ${reading} ↔ ${variants.join(" / ")}` }],
      signature: buildSignature(
        "name-inconsistency",
        [cn, reading, ...variants],
        [],
      ),
    });
  }

  return findings;
}
