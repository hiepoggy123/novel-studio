import type { WritingAgentRole, WritingSettings } from "@/lib/db";
import type { StoryStateSnapshot } from "@/lib/writing/state/schemas";

export interface BestSoFar {
  score: number;
  writerStepResultId: string;
  pendingText: string;
}

export interface PipelineCtx {
  novelId: string;
  sessionId: string;
  chapterPlanId: string;
  chapterOrder: number;
  settings: WritingSettings;
  snapshot: StoryStateSnapshot;
  bestSoFar: BestSoFar | null;
  pendingText: string;
  bootstrapWarning?: string;
  retryCount: number;
  handsFree: boolean;
  abortSignal?: AbortSignal;
  onStepStart?: (role: WritingAgentRole) => void;
  onStepComplete?: (role: WritingAgentRole) => void;
  onWriterChunk?: (text: string) => void;
  onWriterActivity?: (label: string) => void;
  stepUserInstructions?: Partial<Record<WritingAgentRole, string>>;
}
