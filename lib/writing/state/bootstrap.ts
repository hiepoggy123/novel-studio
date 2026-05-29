import type { StoryStateSnapshot, KnownFact, CharacterState } from "@/lib/writing/state/schemas";

export interface BootstrapChapter {
  id: string;
  order: number;
  summary?: string;
  characterIds?: string[];
}

export interface BootstrapCharacter {
  id: string;
  name: string;
  role: string;
  characterArc?: string;
}

export interface BootstrapPlotPoint {
  id: string;
  title: string;
  status: "planned" | "in-progress" | "resolved";
  chapterOrder?: number;
}

export interface BootstrapPlotArc {
  id: string;
  title: string;
  type: string;
  status: string;
  plotPoints: BootstrapPlotPoint[];
}

export interface BootstrapCharacterArc {
  characterId: string;
  trajectory: string;
  developments: { chapterOrder: number; description: string }[];
}

export interface BootstrapInput {
  chapters: BootstrapChapter[];
  characters: BootstrapCharacter[];
  plotArcs: BootstrapPlotArc[];
  characterArcs: BootstrapCharacterArc[];
  analysisStatus?: string;
  worldFacts?: string;
}

export function bootstrapStoryState(input: BootstrapInput): StoryStateSnapshot {
  const warnings: string[] = [];
  const knownFacts: KnownFact[] = [];
  const characterStates: CharacterState[] = [];

  if (!input.analysisStatus || input.characters.length === 0) {
    warnings.push("Phân tích chưa hoàn tất — trạng thái nhân vật có thể không đầy đủ.");
  }

  if (input.plotArcs.length === 0) {
    warnings.push("Không có tuyến truyện — hook tracking sẽ trống.");
  }

  const charById = new Map(input.characters.map((c) => [c.id, c]));

  for (const arc of input.characterArcs) {
    const char = charById.get(arc.characterId);
    if (!char) continue;

    if (arc.trajectory) {
      knownFacts.push({
        subject: char.name,
        predicate: "hành trình",
        object: arc.trajectory,
        sourceChapter: 0,
      });
    }

    for (const dev of arc.developments) {
      knownFacts.push({
        subject: char.name,
        predicate: `phát triển ch.${dev.chapterOrder}`,
        object: dev.description,
        sourceChapter: dev.chapterOrder,
      });
    }
  }

  for (const char of input.characters) {
    characterStates.push({
      name: char.name,
      currentState: char.characterArc ?? "",
    });
  }

  const incomplete = warnings.length > 0;
  const lastAppliedChapter = input.chapters.reduce(
    (max, c) => Math.max(max, c.order),
    0,
  );

  return {
    lastAppliedChapter,
    characterStates,
    worldFacts: input.worldFacts ?? "",
    openConflicts: [],
    knownTruths: [],
    knownFacts,
    chapterHashes: {},
    bootstrapComplete: true,
    updatedAt: new Date(),
    incomplete,
    warnings: incomplete ? warnings : undefined,
  };
}
