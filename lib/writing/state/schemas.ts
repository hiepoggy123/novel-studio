import { z } from "zod";

export const KnownFactSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  sourceChapter: z.number().int().nonnegative(),
});

export const CharacterStateSchema = z.object({
  name: z.string(),
  currentState: z.string(),
  location: z.string().optional(),
  status: z.string().optional(),
});

export const StoryStateSnapshotSchema = z.object({
  lastAppliedChapter: z.number().int().nonnegative(),
  characterStates: z.array(CharacterStateSchema),
  worldFacts: z.string(),
  openConflicts: z.array(z.string()),
  knownTruths: z.array(z.string()),
  knownFacts: z.array(KnownFactSchema),
  chapterHashes: z.record(z.string(), z.string()),
  bootstrapComplete: z.boolean(),
  updatedAt: z.date(),
  incomplete: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
});

export const FactOpSchema = z.object({
  op: z.enum(["add", "remove"]),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
});

export const HookOpSchema = z.object({
  op: z.enum(["advance", "resolve", "defer", "add"]),
  plotArcId: z.string(),
  plotPointId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  chapterOrder: z.number().int().optional(),
});

export const CharacterStatePatchSchema = z.object({
  name: z.string(),
  currentState: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
});

export const StateDeltaSchema = z.object({
  chapter: z.number().int().positive(),
  factOps: z.array(FactOpSchema),
  hookOps: z.array(HookOpSchema),
  characterStatePatches: z.array(CharacterStatePatchSchema),
  chapterSummary: z.string(),
  knownTruthsAdded: z.array(z.string()),
});

export type KnownFact = z.infer<typeof KnownFactSchema>;
export type CharacterState = z.infer<typeof CharacterStateSchema>;
export type StoryStateSnapshot = z.infer<typeof StoryStateSnapshotSchema>;
export type FactOp = z.infer<typeof FactOpSchema>;
export type HookOp = z.infer<typeof HookOpSchema>;
export type CharacterStatePatch = z.infer<typeof CharacterStatePatchSchema>;
export type StateDelta = z.infer<typeof StateDeltaSchema>;
