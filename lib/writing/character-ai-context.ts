import { db } from "@/lib/db";
import type { Character, Chapter } from "@/lib/db";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";

export const APPEARANCE_CHAPTER_CAP = 15;

export interface AppearanceSelection {
  chapters: Chapter[];
  partial: boolean;
}

export function selectAppearanceChapters(
  chapters: Chapter[],
  charId: string,
  cap: number = APPEARANCE_CHAPTER_CAP,
): AppearanceSelection {
  const linked = chapters.filter((c) => (c.characterIds ?? []).includes(charId));
  const source = linked.length > 0 ? linked : null;
  const sorted = [...(source ?? chapters)].sort((a, b) => b.order - a.order);
  const selected = sorted.slice(0, cap).sort((a, b) => a.order - b.order);
  const partial = source === null || sorted.length > cap;
  return { chapters: selected, partial };
}

function worldSection(novel: {
  worldOverview?: string;
  worldRules?: string;
  powerSystem?: string;
}): string {
  const parts = [novel.worldOverview, novel.powerSystem, novel.worldRules]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? `Thế giới:\n${parts.join("\n")}` : "";
}

function siblingsSection(siblings: Character[]): string {
  if (siblings.length === 0) return "";
  const lines = siblings.map(
    (c) =>
      `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.description ? `: ${c.description}` : ""}`,
  );
  return `Nhân vật khác:\n${lines.join("\n")}`;
}

async function chaptersSection(
  novelId: string,
  charId: string,
): Promise<{ text: string; partial: boolean }> {
  const chapters = await db.chapters.where("novelId").equals(novelId).toArray();
  if (chapters.length === 0) return { text: "", partial: false };

  const { chapters: selected, partial } = selectAppearanceChapters(chapters, charId);
  if (selected.length === 0) return { text: "", partial: true };

  const blocks: string[] = [];
  for (const ch of selected) {
    const scenes = await db.scenes
      .where("[chapterId+isActive]")
      .equals([ch.id, 1])
      .toArray();
    const { text } = concatActiveScenes(
      scenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
    );
    const body = text.trim() || ch.summary?.trim() || "";
    if (body) blocks.push(`Chương ${ch.order}${ch.title ? ` — ${ch.title}` : ""}:\n${body}`);
  }
  const note = partial
    ? "(Ngữ cảnh một phần — chạy phân tích để có kết quả tốt hơn.)\n"
    : "";
  return {
    text: blocks.length ? `${note}Chương liên quan:\n${blocks.join("\n\n")}` : "",
    partial,
  };
}

export interface CharacterContext {
  context: string;
  partial: boolean;
}

export async function buildCharacterContext(
  novelId: string,
  options: { charId?: string } = {},
): Promise<CharacterContext> {
  const [novel, characters] = await Promise.all([
    db.novels.get(novelId),
    db.characters.where("novelId").equals(novelId).toArray(),
  ]);
  if (!novel) throw new Error("Không tìm thấy truyện");

  const siblings = options.charId
    ? characters.filter((c) => c.id !== options.charId)
    : characters;

  const sections = [worldSection(novel), siblingsSection(siblings)];
  let partial = false;

  if (options.charId) {
    const chaptersResult = await chaptersSection(novelId, options.charId);
    if (chaptersResult.text) sections.push(chaptersResult.text);
    partial = chaptersResult.partial;
  }

  return { context: sections.filter(Boolean).join("\n\n"), partial };
}
