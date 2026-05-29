import {
  WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
  isWebGpuInferenceProviderId,
} from "@/lib/ai/api-inference";
import { resolveStep } from "@/lib/ai/resolve-step";
import { db } from "@/lib/db";
import { getNextChapterOrder } from "@/lib/hooks/use-chapter-plans";
import type { WritingAgentRole, Chapter } from "@/lib/db";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import { generateStructured } from "@/lib/ai/structured";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import {
  DEFAULT_WORLD_BUILDING_SYSTEM,
  DEFAULT_CHARACTER_GENERATION_SYSTEM,
  DEFAULT_PLOT_ARC_SYSTEM,
  buildChapterPlanSystem,
} from "@/lib/writing/auto-generate-prompts";
import { jsonSchema } from "ai";
import type { LanguageModel } from "ai";

interface GenerateFrameworkOptions {
  novelId: string;
  genre?: string;
  setting?: string;
  idea: string;
  style?: string;
  systemPrompt?: string;
  userInstruction?: string;
  abortSignal?: AbortSignal;
  onPhase?: (phase: "world" | "characters" | "arcs" | "plans") => void;
}

interface WorldBuildingResult {
  worldOverview: string;
  powerSystem?: string;
  storySetting: string;
  timePeriod?: string;
  worldRules?: string;
  technologyLevel?: string;
  factions: Array<{ name: string; description: string }>;
  keyLocations: Array<{ name: string; description: string }>;
}

interface CharacterResult {
  characters: Array<{
    name: string;
    role: string;
    description: string;
    personality: string;
    motivations: string;
    goals: string;
  }>;
}

interface PlotArcResult {
  arcs: Array<{
    title: string;
    description: string;
    type: "main" | "subplot" | "character";
    plotPoints: Array<{
      title: string;
      description: string;
      chapterOrder?: number;
    }>;
  }>;
}

interface ChapterPlanResult {
  plans: Array<{
    chapterOrder: number;
    title: string;
    directions: string[];
  }>;
}

const worldSchema = jsonSchema<WorldBuildingResult>({
  type: "object",
  properties: {
    worldOverview: { type: "string" },
    powerSystem: { type: "string" },
    storySetting: { type: "string" },
    timePeriod: { type: "string" },
    worldRules: { type: "string" },
    technologyLevel: { type: "string" },
    factions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "description"],
      },
    },
    keyLocations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["worldOverview", "storySetting", "factions", "keyLocations"],
});

const characterSchema = jsonSchema<CharacterResult>({
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          description: { type: "string" },
          personality: { type: "string" },
          motivations: { type: "string" },
          goals: { type: "string" },
        },
        required: [
          "name",
          "role",
          "description",
          "personality",
          "motivations",
          "goals",
        ],
      },
    },
  },
  required: ["characters"],
});

const plotArcSchema = jsonSchema<PlotArcResult>({
  type: "object",
  properties: {
    arcs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["main", "subplot", "character"] },
          plotPoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                chapterOrder: { type: "number" },
              },
              required: ["title", "description"],
            },
          },
        },
        required: ["title", "description", "type", "plotPoints"],
      },
    },
  },
  required: ["arcs"],
});

const chapterPlanSchema = jsonSchema<ChapterPlanResult>({
  type: "object",
  properties: {
    plans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chapterOrder: { type: "number" },
          title: { type: "string" },
          directions: { type: "array", items: { type: "string" } },
        },
        required: ["chapterOrder", "title", "directions"],
      },
    },
  },
  required: ["plans"],
});

async function getModelForRole(
  novelId: string,
  role: WritingAgentRole,
): Promise<LanguageModel> {
  const settings = await db.writingSettings.get(novelId);
  const stepModelKey = `${role}Model` as keyof typeof settings;
  const stepConfig = settings?.[stepModelKey] as import("@/lib/db").StepModelConfig | undefined;
  if (stepConfig) {
    const model = await resolveStep(stepConfig);
    if (model) return model;
  }
  const globalSettings = await db.writingSettings.get("global-default");
  const globalConfig = globalSettings?.[stepModelKey] as import("@/lib/db").StepModelConfig | undefined;
  if (globalConfig) {
    const model = await resolveStep(globalConfig);
    if (model) return model;
  }
  const chatSettings = await db.chatSettings.get("default");
  if (chatSettings?.providerId && chatSettings?.modelId) {
    const model = await resolveStep({
      providerId: chatSettings.providerId,
      modelId: chatSettings.modelId,
    });
    if (model) return model;
    if (isWebGpuInferenceProviderId(chatSettings.providerId)) {
      throw new Error(WEBGPU_BLOCKED_FOR_API_INFERENCE_VI);
    }
  }
  throw new Error("Không tìm thấy mô hình AI. Vui lòng cấu hình trong Cài đặt.");
}

async function getGlobalInstruction(): Promise<string | undefined> {
  const chatSettings = await db.chatSettings.get("default");
  return chatSettings?.globalSystemInstruction;
}

/**
 * Generate world-building from an idea.
 */
export async function generateWorldBuilding(
  options: GenerateFrameworkOptions,
): Promise<WorldBuildingResult> {
  const model = await getModelForRole(options.novelId, "plan");
  const globalInstruction = await getGlobalInstruction();

  const basePrompt = `Thể loại: ${options.genre ?? "Tự suy luận"}\nBối cảnh: ${options.setting ?? "Tự suy luận"}\nÝ tưởng: ${options.idea}\n${options.style ? `Phong cách: ${options.style}` : ""}`;

  const { object } = await generateStructured<WorldBuildingResult>({
    model,
    schema: worldSchema,
    system: withGlobalInstruction(
      options.systemPrompt ?? DEFAULT_WORLD_BUILDING_SYSTEM,
      globalInstruction,
    ),
    prompt: appendUserInstructionToPrompt(basePrompt, options.userInstruction),
    abortSignal: options.abortSignal,
  });
  return object;
}

/**
 * Generate characters from idea + world-building.
 */
export async function generateCharacters(
  options: GenerateFrameworkOptions,
  worldContext: string,
): Promise<CharacterResult> {
  const model = await getModelForRole(options.novelId, "outline");
  const globalInstruction = await getGlobalInstruction();

  const basePrompt = `Ý tưởng: ${options.idea}\n\nThế giới:\n${worldContext}`;

  const { object } = await generateStructured<CharacterResult>({
    model,
    schema: characterSchema,
    system: withGlobalInstruction(
      options.systemPrompt ?? DEFAULT_CHARACTER_GENERATION_SYSTEM,
      globalInstruction,
    ),
    prompt: appendUserInstructionToPrompt(basePrompt, options.userInstruction),
    abortSignal: options.abortSignal,
  });
  return object;
}

/**
 * Generate plot arcs from idea + world + characters.
 */
export async function generatePlotArcs(
  options: GenerateFrameworkOptions,
  context: string,
): Promise<PlotArcResult> {
  const model = await getModelForRole(options.novelId, "outline");
  const globalInstruction = await getGlobalInstruction();

  const basePrompt = `Ý tưởng: ${options.idea}\n\n${context}`;

  const { object } = await generateStructured<PlotArcResult>({
    model,
    schema: plotArcSchema,
    system: withGlobalInstruction(
      options.systemPrompt ?? DEFAULT_PLOT_ARC_SYSTEM,
      globalInstruction,
    ),
    prompt: appendUserInstructionToPrompt(basePrompt, options.userInstruction),
    abortSignal: options.abortSignal,
  });
  return object;
}

/**
 * Generate chapter plans from full context.
 */
const RECENT_CHAPTER_RECAP_LIMIT = 10;

function buildExistingChaptersRecap(chapters: Chapter[]): string {
  if (chapters.length === 0) return "";
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const recent = sorted.slice(-RECENT_CHAPTER_RECAP_LIMIT);
  const omitted = sorted.length - recent.length;
  const last = sorted[sorted.length - 1];
  const lines = recent
    .map(
      (c) =>
        `- Chương ${c.order}${c.title ? `: ${c.title}` : ""}${c.summary ? ` — ${c.summary}` : ""}`,
    )
    .join("\n");
  return (
    `Truyện đã có ${sorted.length} chương (đến chương ${last.order}). ` +
    `Phải tiếp nối nhất quán với nội dung đã viết, KHÔNG bắt đầu lại từ đầu.\n` +
    `${omitted > 0 ? `(đã lược ${omitted} chương đầu)\n` : ""}${lines}`
  );
}

export async function generateChapterPlans(
  options: GenerateFrameworkOptions,
  context: string,
  chapterCount: number = 8,
): Promise<ChapterPlanResult> {
  const model = await getModelForRole(options.novelId, "writer");
  const globalInstruction = await getGlobalInstruction();

  const existingChapters = await db.chapters
    .where("novelId")
    .equals(options.novelId)
    .toArray();
  const fromOrder = existingChapters.reduce((m, c) => Math.max(m, c.order), 0);

  const recap = buildExistingChaptersRecap(existingChapters);
  const fullContext = recap ? `${recap}\n\n${context}` : context;
  const basePrompt = `Ý tưởng: ${options.idea}\n\n${fullContext}`;

  const { object } = await generateStructured<ChapterPlanResult>({
    model,
    schema: chapterPlanSchema,
    system: withGlobalInstruction(
      options.systemPrompt ?? buildChapterPlanSystem(chapterCount, fromOrder),
      globalInstruction,
    ),
    prompt: appendUserInstructionToPrompt(basePrompt, options.userInstruction),
    abortSignal: options.abortSignal,
  });
  return object;
}

/**
 * Save world-building result to Novel entity.
 */
export async function saveWorldBuilding(
  novelId: string,
  world: WorldBuildingResult,
) {
  await db.novels.update(novelId, {
    worldOverview: world.worldOverview,
    powerSystem: world.powerSystem,
    storySetting: world.storySetting,
    timePeriod: world.timePeriod,
    worldRules: world.worldRules,
    technologyLevel: world.technologyLevel,
    factions: world.factions,
    keyLocations: world.keyLocations,
    updatedAt: new Date(),
  });
}

/**
 * Save characters result to Character entities.
 */
export async function saveCharacters(
  novelId: string,
  result: CharacterResult,
) {
  await db.characters.where("novelId").equals(novelId).delete();
  const now = new Date();
  const entries = result.characters.map((char) => ({
    id: crypto.randomUUID(),
    novelId,
    name: char.name,
    role: char.role,
    description: char.description,
    personality: char.personality,
    motivations: char.motivations,
    goals: char.goals,
    notes: "",
    createdAt: now,
    updatedAt: now,
  }));
  await db.characters.bulkAdd(entries);
  return entries.map((e) => e.id);
}

export function mapCandidateToRow(
  novelId: string,
  candidate: import("@/lib/writing/character-ai-schema").CharacterAIFields,
  now: Date,
) {
  return {
    id: crypto.randomUUID(),
    novelId,
    name: candidate.name,
    role: candidate.role ?? "",
    description: candidate.description ?? "",
    age: candidate.age,
    sex: candidate.sex,
    appearance: candidate.appearance,
    personality: candidate.personality,
    hobbies: candidate.hobbies,
    relationshipWithMC: candidate.relationshipWithMC,
    characterArc: candidate.characterArc,
    strengths: candidate.strengths,
    weaknesses: candidate.weaknesses,
    motivations: candidate.motivations,
    goals: candidate.goals,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Append generated characters without deleting existing ones.
 */
export async function saveCharactersAppend(
  novelId: string,
  candidates: import("@/lib/writing/character-ai-schema").CharacterAIFields[],
) {
  const now = new Date();
  const entries = candidates.map((c) => mapCandidateToRow(novelId, c, now));
  await db.characters.bulkAdd(entries);
  return entries.map((e) => e.id);
}

/**
 * Save plot arcs result to PlotArc entities.
 */
export async function savePlotArcs(
  novelId: string,
  result: PlotArcResult,
  options?: { replaceAll?: boolean },
) {
  const replaceAll = options?.replaceAll ?? true;
  if (replaceAll) {
    await db.plotArcs.where("novelId").equals(novelId).delete();
  }
  const now = new Date();
  const entries = result.arcs.map((arc) => ({
    id: crypto.randomUUID(),
    novelId,
    title: arc.title,
    description: arc.description,
    type: arc.type,
    plotPoints: arc.plotPoints.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      status: "planned" as const,
    })),
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  }));
  await db.plotArcs.bulkAdd(entries);
  return entries.map((e) => e.id);
}

/**
 * Save chapter plans result to ChapterPlan entities.
 */
export async function saveChapterPlans(
  novelId: string,
  result: ChapterPlanResult,
  options?: { replaceAll?: boolean },
) {
  const replaceAll = options?.replaceAll ?? true;
  if (replaceAll) {
    await db.chapterPlans.where("novelId").equals(novelId).delete();
  }
  const now = new Date();
  const startOrder = await getNextChapterOrder(novelId);
  const sorted = [...result.plans].sort(
    (a, b) => a.chapterOrder - b.chapterOrder,
  );
  const entries = sorted.map((plan, i) => ({
    id: crypto.randomUUID(),
    novelId,
    chapterOrder: startOrder + i,
    title: plan.title,
    directions: plan.directions,
    outline: "",
    scenes: [] as import("@/lib/db").ChapterPlanScene[],
    status: "planned" as const,
    createdAt: now,
    updatedAt: now,
  }));
  await db.chapterPlans.bulkAdd(entries);
  return entries.map((e) => e.id);
}

export interface GenerateFromExistingOptions {
  abortSignal?: AbortSignal;
  onPhase?: (phase: "arcs" | "plans") => void;
  userInstruction?: string;
}

/**
 * Generate plot arcs and chapter plans from existing novel data.
 * Used for continuation mode (State B).
 */
export async function generateFromExisting(
  novelId: string,
  options: GenerateFromExistingOptions = {},
) {
  const { abortSignal, onPhase, userInstruction } = options;

  const [novel, chapters, characters] = await Promise.all([
    db.novels.get(novelId),
    db.chapters.where("novelId").equals(novelId).sortBy("order"),
    db.characters.where("novelId").equals(novelId).toArray(),
  ]);

  if (!novel) throw new Error("Novel not found");

  const context = [
    novel.synopsis ? `Tóm tắt: ${novel.synopsis}` : "",
    novel.worldOverview ? `Thế giới: ${novel.worldOverview}` : "",
    characters.length > 0
      ? `Nhân vật: ${characters.map((c) => `${c.name} (${c.role})`).join(", ")}`
      : "",
    chapters.length > 0
      ? `Chương đã có:\n${chapters.map((ch) => `${ch.order}. ${ch.title}${ch.summary ? `: ${ch.summary}` : ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const idea = novel.synopsis || novel.description || novel.title;
  const nextChapter = chapters.length + 1;

  onPhase?.("arcs");
  const arcsResult = await generatePlotArcs(
    { novelId, idea, abortSignal, userInstruction },
    context,
  );
  await savePlotArcs(novelId, arcsResult, { replaceAll: false });

  onPhase?.("plans");
  const arcContext =
    context +
    `\n\nMạch truyện:\n${arcsResult.arcs.map((a) => `- ${a.title} (${a.type}): ${a.description}`).join("\n")}`;
  const plansResult = await generateChapterPlans(
    { novelId, idea, abortSignal, userInstruction },
    arcContext,
    5,
  );
  plansResult.plans = plansResult.plans.map((p, i) => ({
    ...p,
    chapterOrder: nextChapter + i,
  }));
  await saveChapterPlans(novelId, plansResult, { replaceAll: false });

  return { arcs: arcsResult, plans: plansResult };
}
