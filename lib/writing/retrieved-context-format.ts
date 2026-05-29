import { estimateTokens, truncateToTokenBudget } from "@/lib/analysis/token-budget";
import { selectRelevantFacts } from "@/lib/writing/state/fact-select";
import { selectOpenHooks, classifyOverdue } from "@/lib/writing/state/hook-pressure";
import type { StoryStateSnapshot, KnownFact } from "@/lib/writing/state/schemas";
import type { PlotArc } from "@/lib/db";

const MAX_CONTEXT_TOKENS = 3000;

export interface FormattedRetrievedContext {
  context: string;
  tokenCount: number;
}

function formatCharacterStates(snapshot: StoryStateSnapshot): string {
  if (snapshot.characterStates.length === 0) return "";
  const lines = snapshot.characterStates.map((c) => {
    const parts = [c.currentState];
    if (c.location) parts.push(`vị trí: ${c.location}`);
    if (c.status) parts.push(c.status);
    return `- ${c.name}: ${parts.join(" | ")}`;
  });
  return `## Trạng thái nhân vật\n${lines.join("\n")}`;
}

function formatKnownFacts(facts: KnownFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- ${f.subject} ${f.predicate} ${f.object} (ch.${f.sourceChapter})`);
  return `## Sự thật đã xác nhận\n${lines.join("\n")}`;
}

function formatOpenConflicts(snapshot: StoryStateSnapshot): string {
  if (snapshot.openConflicts.length === 0) return "";
  return `## Xung đột đang mở\n${snapshot.openConflicts.map((c) => `- ${c}`).join("\n")}`;
}

function formatHooks(plotArcs: PlotArc[], chapterOrder: number): string {
  const openHooks = selectOpenHooks(plotArcs);
  if (openHooks.length === 0) return "";

  const lines = openHooks.map((p) => {
    const timing = classifyOverdue(p, chapterOrder);
    const timingLabel =
      timing === "overdue"
        ? ` [QUÁ HẠN chương ${p.chapterOrder}]`
        : timing === "upcoming" && p.chapterOrder != null
          ? ` [đến hạn chương ${p.chapterOrder}]`
          : "";
    return `- ${p.title}${timingLabel}: ${p.description}`;
  });

  return `## Hook mở / mạch truyện chưa giải quyết\n${lines.join("\n")}`;
}

export function formatRetrievedContext(
  snapshot: StoryStateSnapshot,
  plotArcs: PlotArc[],
  chapterOrder: number,
  subjects: string[],
): FormattedRetrievedContext {
  const parts: string[] = [];

  parts.push(`Chương được chuẩn bị: ${chapterOrder}`);
  parts.push(`Trạng thái đã xác nhận đến chương: ${snapshot.lastAppliedChapter}`);

  if (snapshot.worldFacts) {
    parts.push(`## Thế giới\n${snapshot.worldFacts}`);
  }

  const charSection = formatCharacterStates(snapshot);
  if (charSection) parts.push(charSection);

  const relevantFacts = selectRelevantFacts(snapshot.knownFacts, subjects);
  const factsSection = formatKnownFacts(relevantFacts);
  if (factsSection) parts.push(factsSection);

  if (snapshot.knownTruths.length > 0) {
    parts.push(`## Sự thật bất biến\n${snapshot.knownTruths.map((t) => `- ${t}`).join("\n")}`);
  }

  const hooksSection = formatHooks(plotArcs, chapterOrder);
  if (hooksSection) parts.push(hooksSection);

  if (snapshot.openConflicts.length > 0) {
    const conflictSection = formatOpenConflicts(snapshot);
    if (conflictSection) parts.push(conflictSection);
  }

  const raw = parts.join("\n\n");
  const context = truncateToTokenBudget(raw, MAX_CONTEXT_TOKENS);
  const tokenCount = estimateTokens(context);

  return { context, tokenCount };
}
