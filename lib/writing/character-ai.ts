import { db } from "@/lib/db";
import type { Character, AnalysisSettings, StepModelConfig } from "@/lib/db";
import {
  WEBGPU_BLOCKED_FOR_API_INFERENCE_VI,
  isWebGpuInferenceProviderId,
} from "@/lib/ai/api-inference";
import { resolveStep } from "@/lib/ai/resolve-step";
import { generateStructured } from "@/lib/ai/structured";
import { withGlobalInstruction } from "@/lib/ai/system-prompt";
import type { LanguageModel } from "ai";
import { appendUserInstructionToPrompt } from "@/lib/writing/append-user-instruction";
import { buildCharacterContext } from "@/lib/writing/character-ai-context";
import {
  characterAIObjectSchema,
  characterListSchema,
  type CharacterAIFields,
  type CharacterListResult,
} from "@/lib/writing/character-ai-schema";
import {
  DEFAULT_ENHANCE_SYSTEM,
  DEFAULT_GENERATE_MORE_SYSTEM,
} from "@/lib/writing/character-ai-prompts";

export {
  APPEARANCE_CHAPTER_CAP,
  selectAppearanceChapters,
  buildCharacterContext,
} from "@/lib/writing/character-ai-context";
export type {
  AppearanceSelection,
  CharacterContext,
} from "@/lib/writing/character-ai-context";

async function getGlobalInstruction(): Promise<string | undefined> {
  const chatSettings = await db.chatSettings.get("default");
  return chatSettings?.globalSystemInstruction;
}

type CharacterModelField = "characterEnhanceModel" | "characterGenerateModel";

async function resolveCharacterToolModel(
  settings: AnalysisSettings | undefined,
  field: CharacterModelField,
): Promise<LanguageModel> {
  const toolModel = settings?.[field] as StepModelConfig | undefined;
  if (toolModel) {
    const model = await resolveStep(toolModel);
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

export interface EnhanceResult {
  fields: Partial<Character>;
  partial: boolean;
}

export async function enhanceCharacter(
  novelId: string,
  charId: string,
  options: { instruction?: string; abortSignal?: AbortSignal } = {},
): Promise<EnhanceResult> {
  const character = await db.characters.get(charId);
  if (!character || character.novelId !== novelId) {
    throw new Error("Không tìm thấy nhân vật");
  }

  const { context, partial } = await buildCharacterContext(novelId, { charId });
  const settings = await db.analysisSettings.get("default");
  const model = await resolveCharacterToolModel(settings, "characterEnhanceModel");
  const globalInstruction = await getGlobalInstruction();
  const system = settings?.characterEnhancePrompt?.trim() || DEFAULT_ENHANCE_SYSTEM;

  const current = [
    `Tên: ${character.name}`,
    character.role ? `Vai trò: ${character.role}` : "",
    character.description ? `Mô tả: ${character.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const basePrompt = `Hồ sơ hiện tại:\n${current}\n\n${context}`;

  const { object } = await generateStructured<CharacterAIFields>({
    model,
    schema: characterAIObjectSchema,
    system: withGlobalInstruction(system, globalInstruction),
    prompt: appendUserInstructionToPrompt(basePrompt, options.instruction),
    abortSignal: options.abortSignal,
  });

  const { name: _name, ...rest } = object;
  return { fields: rest, partial };
}

export async function generateMoreCharacters(
  novelId: string,
  options: { count: number; instruction?: string; abortSignal?: AbortSignal },
): Promise<CharacterAIFields[]> {
  const { context } = await buildCharacterContext(novelId);
  const settings = await db.analysisSettings.get("default");
  const model = await resolveCharacterToolModel(settings, "characterGenerateModel");
  const globalInstruction = await getGlobalInstruction();
  const system = settings?.characterGeneratePrompt?.trim() || DEFAULT_GENERATE_MORE_SYSTEM;

  const basePrompt = `Số lượng nhân vật cần tạo: ${options.count}\n\n${context}`;

  const { object } = await generateStructured<CharacterListResult>({
    model,
    schema: characterListSchema,
    system: withGlobalInstruction(system, globalInstruction),
    prompt: appendUserInstructionToPrompt(basePrompt, options.instruction),
    abortSignal: options.abortSignal,
  });

  return object.characters;
}
