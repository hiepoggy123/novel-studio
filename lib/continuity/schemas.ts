import type {
  ContinuityEvidence,
  ContinuityFindingSeverity,
  ContinuityFindingType,
} from "@/lib/db";

export interface LedgerFact {
  subject: string;
  predicate: string;
  object: string;
  chapterOrder: number;
}

export interface LedgerCharPatch {
  name: string;
  currentState?: string;
  location?: string;
  status?: string;
  chapterOrder: number;
}

export interface ScanLedger {
  facts: LedgerFact[];
  charPatches: LedgerCharPatch[];
  /** conflict key -> first chapter it was opened */
  conflictFirstSeen: Map<string, number>;
  /** conflict key -> last chapter it was opened or advanced */
  conflictLastSeen: Map<string, number>;
  /** conflict keys resolved via a resolve hookOp */
  resolvedConflicts: Set<string>;
  /** chapterOrder -> set of character names whose text mentions them */
  charNameIndexByChapter: Map<number, Set<string>>;
  /** chapterOrder -> chapterId, for evidence links */
  chapterIdByOrder: Map<number, string>;
  maxChapterOrder: number;
}

/** A finding as produced by a detector, before persistence metadata is attached. */
export interface DetectedFinding {
  type: ContinuityFindingType;
  severity: ContinuityFindingSeverity;
  confidence: number;
  title: string;
  description: string;
  evidence: ContinuityEvidence[];
  signature: string;
}

export interface NameEntryLite {
  chinese: string;
  vietnamese: string;
  scope: string;
}

export interface NameFrequencyLite {
  chinese: string;
  reading: string;
  chapters: string[];
  status: string;
}

export interface PlotPointLite {
  title: string;
  status: string;
  lastAdvancedChapter?: number;
}

export interface DetectorCtx {
  novelId: string;
  staleGap: number;
  stablePredicates?: string[];
  /** lowercased alias -> canonical name, built from NameEntry */
  aliasMap?: Map<string, string>;
  /** NameEntry rows (scope = novelId or "global") for name-consistency */
  nameEntries?: NameEntryLite[];
  /** NameFrequency rows (novel-scoped) for name-consistency */
  nameFrequencies?: NameFrequencyLite[];
  /** flattened PlotPoints for abandoned-conflict plot variant */
  plotPoints?: PlotPointLite[];
}

export type Detector = (
  ledger: ScanLedger,
  ctx: DetectorCtx,
) => DetectedFinding[] | Promise<DetectedFinding[]>;

export type ScanPhase = "observe" | "detect" | "character" | "done";

export interface ScanProgress {
  phase: ScanPhase;
  done: number;
  total: number;
  /** human-readable activity line (e.g. a chapter summary or a confirm result) */
  message?: string;
}

export interface ScanInput {
  novelId: string;
  /** force re-observe every chapter, ignoring the observation cache */
  full?: boolean;
  detectors?: Detector[];
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}

export interface ScanResult {
  findingsCount: number;
  observedChapters: number;
  cachedChapters: number;
  statePersisted: boolean;
  /** true when the scan was cancelled before observing every chapter */
  partial: boolean;
  warnings: string[];
}
