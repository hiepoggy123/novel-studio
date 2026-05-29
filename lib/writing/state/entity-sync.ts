import type {
  StoryStateSnapshot,
  CharacterState,
  KnownFact,
} from "@/lib/writing/state/schemas";

export const AUTO_SYNC_START = "<!-- novel-studio:auto-sync:start -->";
export const AUTO_SYNC_END = "<!-- novel-studio:auto-sync:end -->";

export function mergeMarkerBlock(
  existing: string | undefined,
  block: string,
): string {
  const trimmed = block.trim();
  const wrapped = trimmed ? `${AUTO_SYNC_START}\n${trimmed}\n${AUTO_SYNC_END}` : "";
  const base = existing ?? "";

  const startIdx = base.indexOf(AUTO_SYNC_START);
  const endIdx = base.indexOf(AUTO_SYNC_END);

  if (startIdx >= 0 && endIdx > startIdx) {
    const before = base.slice(0, startIdx).replace(/\s+$/, "");
    const after = base.slice(endIdx + AUTO_SYNC_END.length).replace(/^\s+/, "");
    return [before, wrapped, after].filter(Boolean).join("\n\n");
  }

  if (!wrapped) return base;
  return base.trim() ? `${base.trim()}\n\n${wrapped}` : wrapped;
}

export function extractMarkerBlock(text: string | undefined): string {
  const base = text ?? "";
  const startIdx = base.indexOf(AUTO_SYNC_START);
  const endIdx = base.indexOf(AUTO_SYNC_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    return base.slice(startIdx + AUTO_SYNC_START.length, endIdx).trim();
  }
  return "";
}

export function stripMarkerBlock(text: string | undefined): string {
  return mergeMarkerBlock(text, "");
}

export function buildWorldSyncBlock(snapshot: StoryStateSnapshot): string {
  const lines: string[] = [];

  if (snapshot.worldFacts.trim()) {
    lines.push(snapshot.worldFacts.trim());
  }
  if (snapshot.knownTruths.length > 0) {
    lines.push("", "**Sự thật bất biến:**");
    for (const truth of snapshot.knownTruths) lines.push(`- ${truth}`);
  }
  if (snapshot.openConflicts.length > 0) {
    lines.push("", "**Xung đột đang mở:**");
    for (const conflict of snapshot.openConflicts) lines.push(`- ${conflict}`);
  }

  return lines.join("\n").trim();
}

export function buildCharacterSyncBlock(
  state: CharacterState,
  facts: KnownFact[],
): string {
  const lines: string[] = [];

  if (state.currentState.trim()) lines.push(`Trạng thái: ${state.currentState.trim()}`);
  if (state.location?.trim()) lines.push(`Vị trí: ${state.location.trim()}`);
  if (state.status?.trim()) lines.push(`Tình trạng: ${state.status.trim()}`);

  if (facts.length > 0) {
    lines.push("", "Sự kiện liên quan:");
    for (const fact of facts) {
      lines.push(`- ${fact.predicate} ${fact.object} (ch.${fact.sourceChapter})`);
    }
  }

  return lines.join("\n").trim();
}

export function selectCharacterFacts(
  snapshot: StoryStateSnapshot,
  name: string,
): KnownFact[] {
  const key = name.trim().toLowerCase();
  return snapshot.knownFacts.filter(
    (fact) => fact.subject.trim().toLowerCase() === key,
  );
}
