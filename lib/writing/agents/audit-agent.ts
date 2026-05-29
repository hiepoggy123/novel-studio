import { generateStructured } from "@/lib/ai/structured";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import { reviewOutputSchema } from "@/lib/writing/schemas";
import { selectOpenHooks, classifyOverdue } from "@/lib/writing/state/hook-pressure";
import { ALL_FATIGUE_TERMS } from "@/lib/writing/style/fatigue-list.vi";
import type { AgentConfig, ReviewAgentOutput } from "@/lib/writing/types";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";
import type { PlotArc } from "@/lib/db";

export interface AuditAgentInput {
  chapterOrder: number;
  chapterText: string;
  snapshot: StoryStateSnapshot;
  plotArcs: PlotArc[];
  committedSnapshot?: StoryStateSnapshot;
}

export async function runAuditAgent(
  input: AuditAgentInput,
  config: AgentConfig,
): Promise<ReviewAgentOutput> {
  const prompt = buildAuditPrompt(input);

  const { object } = await generateStructured<ReviewAgentOutput>({
    model: config.model,
    schema: reviewOutputSchema,
    system: withGlobalInstruction(config.systemPrompt, config.globalInstruction),
    prompt: appendUserInstructionToPrompt(prompt, config.userInstruction),
    abortSignal: config.abortSignal,
  });

  return object;
}

function buildFatigueBlock(chapterText: string): string {
  const lower = chapterText.toLowerCase();
  const found = ALL_FATIGUE_TERMS.filter((t) => lower.includes(t.toLowerCase()));
  if (found.length === 0) return "";
  const list = found.map((t) => `  - "${t}"`).join("\n");
  return `\n<lexical_fatigue note="các cụm từ sáo rỗng hoặc AI-sounding phát hiện trong chương — hãy ghi nhận mật độ trong issues">
${list}
</lexical_fatigue>\n`;
}

function buildAuditPrompt(input: AuditAgentInput): string {
  const snapshotBlock = buildSnapshotBlock(input.snapshot);
  const overdueBlock = buildOverdueHooksBlock(input.plotArcs, input.chapterOrder);
  const diffBlock = input.committedSnapshot
    ? buildDiffBlock(input.committedSnapshot, input.snapshot)
    : "";
  const fatigueBlock = buildFatigueBlock(input.chapterText);

  return `<committed_state note="trạng thái đã xác nhận trước chương này">
${snapshotBlock}
</committed_state>
${diffBlock}${overdueBlock}${fatigueBlock}<chapter_to_audit>
${input.chapterText}
</chapter_to_audit>

<request>
Đánh giá chương theo 7 tiêu chí: character, plot, tone, world-rules, pacing, pov, dialogue.
Kiểm tra tính nhất quán so với committed_state đã xác nhận.
Đánh dấu critical cho bất kỳ hook quá hạn nào không được đề cập hoặc giải quyết trong chương.
Nếu lexical_fatigue có từ/cụm từ, hãy ghi nhận mật độ và đặt là minor nếu xuất hiện nhiều (≥3 lần).
Chấm điểm overallScore từ 0–10.
</request>`;
}

function buildSnapshotBlock(snapshot: StoryStateSnapshot): string {
  const parts: string[] = [];

  parts.push(`Chương gần nhất đã cam kết: ${snapshot.lastAppliedChapter}`);

  if (snapshot.characterStates.length > 0) {
    const chars = snapshot.characterStates
      .map((c) => `  - ${c.name}: ${c.currentState}${c.location ? ` (tại ${c.location})` : ""}`)
      .join("\n");
    parts.push(`Trạng thái nhân vật:\n${chars}`);
  }

  if (snapshot.worldFacts) {
    parts.push(`Bối cảnh thế giới: ${snapshot.worldFacts}`);
  }

  if (snapshot.knownTruths.length > 0) {
    parts.push(`Sự thật bất biến:\n${snapshot.knownTruths.map((t) => `  - ${t}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

function buildOverdueHooksBlock(plotArcs: PlotArc[], chapterOrder: number): string {
  const openHooks = selectOpenHooks(plotArcs);
  const overdue = openHooks.filter(
    (p) => classifyOverdue(p, chapterOrder) === "overdue",
  );

  if (overdue.length === 0) return "";

  const list = overdue
    .map((h) => `  - ${h.title}: ${h.description}`)
    .join("\n");

  return `\n<overdue_hooks note="các hook này phải được đề cập trong chương — thiếu = critical">
${list}
</overdue_hooks>\n`;
}

function buildDiffBlock(
  committed: StoryStateSnapshot,
  current: StoryStateSnapshot,
): string {
  const prevChars = new Map(committed.characterStates.map((c) => [c.name, c.currentState]));
  const changes = current.characterStates
    .filter((c) => prevChars.get(c.name) !== c.currentState)
    .map((c) => `  - ${c.name}: ${prevChars.get(c.name) ?? "(mới)"} → ${c.currentState}`);

  if (changes.length === 0) return "";

  return `\n<state_changes note="thay đổi từ snapshot trước">
${changes.join("\n")}
</state_changes>\n`;
}
