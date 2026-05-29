import Dexie, { type EntityTable } from "dexie";
import { registerMigrations } from "./db-migrations";

// ─── Entity Types ────────────────────────────────────────────

export interface NameDescription {
  name: string;
  description: string;
}

export interface Novel {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  genre?: string;
  targetWordCount?: number;
  color?: string;
  author?: string;
  sourceUrl?: string;
  // Analysis fields (merged from NovelAnalysis)
  genres?: string[];
  tags?: string[];
  synopsis?: string;
  worldOverview?: string;
  powerSystem?: string;
  storySetting?: string;
  timePeriod?: string;
  factions?: NameDescription[];
  keyLocations?: NameDescription[];
  worldRules?: string;
  technologyLevel?: string;
  analysisStatus?: "pending" | "analyzing" | "completed" | "failed";
  chaptersAnalyzed?: number;
  totalChapters?: number;
  analysisError?: string;
  /** Persisted critical/minor review issues from prior chapters for cross-session memory. */
  reviewIssues?: Array<{
    chapterOrder: number;
    type: string;
    description: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  novelId: string;
  title: string;
  order: number;
  summary?: string;
  characterIds?: string[];
  analyzedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SceneVersionType =
  | "ai-translate"
  | "ai-edit"
  | "ai-write"
  | "manual"
  | "qt-convert"
  | "find-replace";

export interface Scene {
  id: string;
  chapterId: string;
  novelId: string;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  // Version fields
  version: number;
  versionType: SceneVersionType;
  /** 1 = current content, 0 = historical version. Number for IndexedDB compound key compat. */
  isActive: number;
  activeSceneId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterRelationship {
  characterName: string;
  description: string;
}

export interface Character {
  id: string;
  novelId: string;
  name: string;
  role: string;
  roleKey?: number;
  description: string;
  notes?: string;
  imageUrl?: string;
  // Analysis fields
  age?: string;
  sex?: string;
  appearance?: string;
  personality?: string;
  hobbies?: string;
  relationshipWithMC?: string;
  relationships?: CharacterRelationship[];
  characterArc?: string;
  strengths?: string;
  weaknesses?: string;
  motivations?: string;
  goals?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note {
  id: string;
  novelId: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "mistral"
  | "xai"
  | "openrouter"
  | "openai-compatible"
  | "webgpu";

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
  providerType?: ProviderType;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIModel {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  novelId?: string;
  chapterId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool-calls"; toolCalls: ChatToolCall[] };

export interface ChatImage {
  dataUrl: string; // base64 data URL, e.g. "data:image/jpeg;base64,..."
  mimeType: string; // "image/jpeg" | "image/png" | "image/webp" | etc.
  name?: string;
}

export interface ChatFile {
  name: string;
  mimeType: string;
  size: number; // original file size in bytes
  content: string; // extracted text content
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  /** Ordered parts for interleaved text/tool-call rendering */
  parts?: MessagePart[];
  /** Images attached to this message (user messages only) */
  images?: ChatImage[];
  /** Text files attached to this message (user messages only) */
  files?: ChatFile[];
  createdAt: Date;
}

export interface ChatSettings {
  id: "default";
  providerId: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  globalSystemInstruction?: string;
  /** Max tool-calling steps per message (default 5) */
  maxToolSteps?: number;
}

export interface StepModelConfig {
  providerId: string;
  modelId: string;
}

export interface AnalysisSettings {
  id: "default";
  chapterAnalysisPrompt?: string;
  novelAggregationPrompt?: string;
  characterProfilingPrompt?: string;
  chapterModel?: StepModelConfig;
  aggregationModel?: StepModelConfig;
  characterModel?: StepModelConfig;
  // Chapter AI tools
  translateModel?: StepModelConfig;
  reviewModel?: StepModelConfig;
  editModel?: StepModelConfig;
  translatePrompt?: string;
  reviewPrompt?: string;
  editPrompt?: string;
  // Character AI tools
  characterEnhanceModel?: StepModelConfig;
  characterGenerateModel?: StepModelConfig;
  characterEnhancePrompt?: string;
  characterGeneratePrompt?: string;
}

// ─── Name Dictionary ─────────────────────────────────────────

export type NameEntryCategory =
  | "nhân vật"
  | "địa danh"
  | "môn phái"
  | "thuật ngữ"
  | "vật phẩm"
  | "kỹ năng"
  | "khác";

export const NAME_ENTRY_CATEGORIES: NameEntryCategory[] = [
  "nhân vật",
  "địa danh",
  "môn phái",
  "thuật ngữ",
  "vật phẩm",
  "kỹ năng",
  "khác",
];

export interface NameEntry {
  id: string;
  scope: string; // "global" | novelId
  chinese: string;
  vietnamese: string;
  category: string; // NameEntryCategory or custom string
  createdAt: Date;
  updatedAt: Date;
}

// ─── Replace Rules ──────────────────────────────────────────

export interface ReplaceRule {
  id: string;
  scope: string; // "global" | novelId
  pattern: string;
  replacement: string;
  isRegex: boolean;
  caseSensitive: boolean;
  enabled: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Excluded Names ─────────────────────────────────────────

export interface ExcludedName {
  id: string;
  scope: string; // "global" | novelId
  chinese: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── QT Dictionary ───────────────────────────────────────────

export type DictSource =
  | "vietphrase"
  | "names"
  | "names2"
  | "phienam"
  | "luatnhan";

export interface DictEntry {
  id: string;
  source: DictSource;
  chinese: string;
  vietnamese: string;
}

export interface DictMeta {
  id: string; // "dict-meta" singleton
  loadedAt: Date;
  sources: Record<DictSource, number>; // entry count per source
}

/** Cached raw text per dict source — avoids reading 728k rows from dictEntries on init */
export interface DictCache {
  source: DictSource;
  rawText: string;
}

// ─── Name Frequency Tracking ────────────────────────────────

export type NameFrequencyStatus = "pending" | "approved" | "rejected";

export interface NameFrequency {
  id: string;
  novelId: string;
  chinese: string;
  reading: string;
  count: number;
  chapters: string[];
  surnameType: "compound" | "single" | "rare";
  status: NameFrequencyStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Convert Settings ────────────────────────────────────────

export { DEFAULT_CONVERT_OPTIONS } from "@/lib/workers/qt-engine.types";
export type { ConvertOptions } from "@/lib/workers/qt-engine.types";

export interface ConvertSettings {
  id: string; // "convert-settings" singleton
  nameVsPriority: string;
  scopePriority: string;
  maxPhraseLength: number;
  vpLengthPriority: string;
  luatNhanMode: string;
  splitMode: string;
  capitalizeBrackets?: boolean;
}

// ─── Database ────────────────────────────────────────────────

export interface TTSSettings {
  id: "default";
  providerId: string;
  voiceId: string;
  rate: number;
  pitch: number;
  highlightColor: string;
  fluencyAdjust: number;
  providerApiKeys?: Record<string, string>;
}

// ─── Writing Pipeline ───────────────────────────────────────

export interface PlotPoint {
  id: string;
  title: string;
  description: string;
  chapterOrder?: number;
  status: "planned" | "in-progress" | "resolved";
  payoffTiming?: number;
  expectedPayoff?: string;
  coreHook?: boolean;
  lastAdvancedChapter?: number;
}

export interface PlotArc {
  id: string;
  novelId: string;
  title: string;
  description: string;
  type: "main" | "subplot" | "character";
  plotPoints: PlotPoint[];
  status: "active" | "completed" | "abandoned";
  createdAt: Date;
  updatedAt: Date;
}

export interface ChapterPlanScene {
  title: string;
  summary: string;
  characters: string[];
  location?: string;
  mood?: string;
  keyEvents?: string[];
}

export interface ChapterPlan {
  id: string;
  novelId: string;
  chapterOrder: number;
  title?: string;
  directions: string[];
  outline: string;
  scenes: ChapterPlanScene[];
  status: "planned" | "writing" | "written" | "reviewed" | "saved";
  chapterId?: string;
  intent?: import("@/lib/writing/intent-schema").ChapterIntent;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterDevelopment {
  chapterOrder: number;
  description: string;
}

export interface CharacterArc {
  id: string;
  novelId: string;
  characterId: string;
  trajectory: string;
  developments: CharacterDevelopment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryStateCharacter {
  name: string;
  currentState: string;
  location?: string;
  status?: string;
}

export interface StoryStateKnownFact {
  subject: string;
  predicate: string;
  object: string;
  sourceChapter: number;
}

export interface StoryState {
  id: string;
  lastAppliedChapter: number;
  characterStates: StoryStateCharacter[];
  worldFacts: string;
  openConflicts: string[];
  knownTruths: string[];
  knownFacts: StoryStateKnownFact[];
  chapterHashes: Record<string, string>;
  bootstrapComplete: boolean;
  updatedAt: Date;
  incomplete?: boolean;
  warnings?: string[];
  auditHistory?: Array<{
    chapterOrder: number;
    type: string;
    description: string;
    migratedAt: string;
  }>;
}

export type WritingAgentRole =
  | "plan"
  | "outline"
  | "writer"
  | "normalize"
  | "observe"
  | "audit"
  | "revise"
  | "commit";

export type WritingStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "editing"
  | "skipped"
  | "error";

/** Per-novel writing pipeline configuration. id === novelId. */
export interface WritingSettings {
  id: string;
  chapterLength: number;
  /** Max tool rounds for smart writer (UI 5–20); falls back to chat maxToolSteps when unset. */
  smartWriterMaxToolSteps?: number;
  /** When true, new sessions run the pipeline hands-free until review completes. */
  noAskingMode?: boolean;
  /** Minimum review score (0-10) to auto-accept in hands-free mode. Default 7. */
  minScoreToAutoAccept?: number;
  /** Max automatic retries from Outline when score is below threshold. Default 2. */
  maxAutoRetries?: number;
  planModel?: StepModelConfig;
  outlineModel?: StepModelConfig;
  writerModel?: StepModelConfig;
  normalizeModel?: StepModelConfig;
  observeModel?: StepModelConfig;
  auditModel?: StepModelConfig;
  reviseModel?: StepModelConfig;
  polishModel?: StepModelConfig;
  enablePolish?: boolean;
  styleFingerprint?: string;
  planPrompt?: string;
  outlinePrompt?: string;
  writerPrompt?: string;
  normalizePrompt?: string;
  observePrompt?: string;
  auditPrompt?: string;
  revisePrompt?: string;
  polishPrompt?: string;
  // Setup wizard step prompts (auto-generate framework)
  worldBuildingPrompt?: string;
  characterGenPrompt?: string;
  plotArcPrompt?: string;
  chapterPlanPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WritingSession {
  id: string;
  novelId: string;
  chapterPlanId: string;
  currentStep: WritingAgentRole;
  status: "active" | "paused" | "completed" | "error";
  stateHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WritingStepResult {
  id: string;
  sessionId: string;
  role: WritingAgentRole;
  status: WritingStepStatus;
  output?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Database ────────────────────────────────────────────────

export class NovelStudioDB extends Dexie {
  novels!: EntityTable<Novel, "id">;
  chapters!: EntityTable<Chapter, "id">;
  scenes!: EntityTable<Scene, "id">;
  characters!: EntityTable<Character, "id">;
  notes!: EntityTable<Note, "id">;
  aiProviders!: EntityTable<AIProvider, "id">;
  aiModels!: EntityTable<AIModel, "id">;
  conversations!: EntityTable<Conversation, "id">;
  conversationMessages!: EntityTable<ConversationMessage, "id">;
  chatSettings!: EntityTable<ChatSettings, "id">;
  analysisSettings!: EntityTable<AnalysisSettings, "id">;
  nameEntries!: EntityTable<NameEntry, "id">;
  replaceRules!: EntityTable<ReplaceRule, "id">;
  excludedNames!: EntityTable<ExcludedName, "id">;
  dictEntries!: EntityTable<DictEntry, "id">;
  dictMeta!: EntityTable<DictMeta, "id">;
  dictCache!: EntityTable<DictCache, "source">;
  convertSettings!: EntityTable<ConvertSettings, "id">;
  nameFrequency!: EntityTable<NameFrequency, "id">;
  ttsSettings!: EntityTable<TTSSettings, "id">;
  plotArcs!: EntityTable<PlotArc, "id">;
  chapterPlans!: EntityTable<ChapterPlan, "id">;
  writingSettings!: EntityTable<WritingSettings, "id">;
  writingSessions!: EntityTable<WritingSession, "id">;
  writingStepResults!: EntityTable<WritingStepResult, "id">;
  storyStates!: EntityTable<StoryState, "id">;

  constructor() {
    super("novel-studio");
    registerMigrations(this);
  }
}

export const db = new NovelStudioDB();
