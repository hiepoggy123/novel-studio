export interface ActiveScene {
  id: string;
  content: string;
  order: number;
}

export interface ChapterText {
  text: string;
  contentHash: string;
  sceneIds: string[];
}

export function buildContentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

export function concatActiveScenes(scenes: ActiveScene[]): ChapterText {
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  const text = sorted.map((s) => s.content).join("\n\n");
  const contentHash = buildContentHash(text);
  const sceneIds = sorted.map((s) => s.id);
  return { text, contentHash, sceneIds };
}
