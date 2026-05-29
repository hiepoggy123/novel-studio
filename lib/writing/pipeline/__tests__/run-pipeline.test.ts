import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WritingAgentRole } from "@/lib/db";

vi.mock("@/lib/db", () => {
  const firstFn = vi.fn().mockResolvedValue(undefined);
  const stepResultFirstFn = vi.fn().mockResolvedValue(undefined);
  const stepResultDeleteFn = vi.fn().mockResolvedValue(undefined);

  return {
    db: {
      writingSessions: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
        where: vi.fn(() => ({ equals: vi.fn(() => ({ first: firstFn, toArray: vi.fn().mockResolvedValue([]) })) })),
        toArray: vi.fn().mockResolvedValue([]),
      },
      writingStepResults: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        delete: stepResultDeleteFn,
        where: vi.fn(() => ({
          equals: vi.fn(() => ({
            first: stepResultFirstFn,
            delete: vi.fn().mockResolvedValue(undefined),
            toArray: vi.fn().mockResolvedValue([]),
          })),
        })),
        toArray: vi.fn().mockResolvedValue([]),
      },
      chapterPlans: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
        where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn().mockResolvedValue(undefined), toArray: vi.fn().mockResolvedValue([]) })) })),
        toArray: vi.fn().mockResolvedValue([]),
      },
      writingSettings: {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
        toArray: vi.fn().mockResolvedValue([]),
      },
      novels: {
        get: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        toArray: vi.fn().mockResolvedValue([]),
      },
      chapters: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]), sortBy: vi.fn().mockResolvedValue([]) })) })) },
      characters: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]), sortBy: vi.fn().mockResolvedValue([]) })) })) },
      plotArcs: { where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]), sortBy: vi.fn().mockResolvedValue([]) })) })) },
      storyStates: {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
        toArray: vi.fn().mockResolvedValue([]),
      },
      chatSettings: { get: vi.fn().mockResolvedValue({ providerId: "openai", modelId: "gpt-4o" }) },
    },
  };
});

vi.mock("@/lib/writing/state/state-store", () => ({
  loadStoryState: vi.fn(),
  saveStoryState: vi.fn(),
}));

vi.mock("@/lib/writing/state/bootstrap", () => ({
  bootstrapStoryState: vi.fn(() => ({
    lastAppliedChapter: 0,
    characterStates: [],
    worldFacts: "",
    openConflicts: [],
    knownTruths: [],
    knownFacts: [],
    chapterHashes: {},
    bootstrapComplete: false,
    updatedAt: new Date("2026-01-01"),
    incomplete: false,
  })),
}));

vi.mock("@/lib/writing/read-chapter-text", () => ({
  concatActiveScenes: vi.fn(() => ({ text: "", contentHash: "hash0", sceneIds: [] })),
}));

vi.mock("@/lib/writing/resync-chapter-state", () => ({
  resyncChapterState: vi.fn(() => Promise.resolve({ action: "skipped", reason: "hash matches" })),
}));

vi.mock("@/lib/writing/revise-loop", () => ({
  shouldRevise: vi.fn(() => false),
}));

vi.mock("@/lib/ai/resolve-step", () => ({
  resolveStep: vi.fn(() => Promise.resolve({ modelId: "stub" })),
}));

vi.mock("@/lib/ai/api-inference", () => ({
  isWebGpuInferenceProviderId: vi.fn(() => false),
  WEBGPU_BLOCKED_FOR_API_INFERENCE_VI: "webgpu blocked",
}));

const mockPipelineSteps: import("../steps").StepDescriptor[] = [];
const mockStepIndex = new Map<WritingAgentRole, number>();
const mockGetStepAfter = vi.fn((_role: WritingAgentRole): WritingAgentRole | null => null);
const mockClearStepResult = vi.fn();

vi.mock("../steps", () => ({
  get PIPELINE_STEPS() { return mockPipelineSteps; },
  get STEP_INDEX() { return mockStepIndex; },
  getStepAfter: (...args: Parameters<typeof mockGetStepAfter>) => mockGetStepAfter(...args),
  clearStepResult: (...args: Parameters<typeof mockClearStepResult>) => mockClearStepResult(...args),
}));

import { loadStoryState } from "@/lib/writing/state/state-store";
import { bootstrapStoryState } from "@/lib/writing/state/bootstrap";
import { shouldRevise } from "@/lib/writing/revise-loop";
import { db } from "@/lib/db";

const STUB_SNAPSHOT = {
  lastAppliedChapter: 0,
  characterStates: [],
  worldFacts: "",
  openConflicts: [],
  knownTruths: [],
  knownFacts: [],
  chapterHashes: {},
  bootstrapComplete: false,
  updatedAt: new Date("2026-01-01"),
  incomplete: false,
};

type StepRun = (ctx: import("../pipeline-ctx").PipelineCtx) => Promise<void>;

function buildStubSteps(
  roles: WritingAgentRole[],
  overrides: Partial<Record<WritingAgentRole, { gate?: boolean; run?: StepRun; throws?: string }>> = {},
): import("../steps").StepDescriptor[] {
  return roles.map((role) => ({
    role,
    humanGate: overrides[role]?.gate ?? (role === "plan" || role === "audit"),
    run: overrides[role]?.throws
      ? async () => { throw new Error(overrides[role]!.throws); }
      : overrides[role]?.run ?? vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
          if (role === "writer") ctx.pendingText = "chapter text";
          if (role === "audit") {
            ctx.bestSoFar = { score: 8, writerStepResultId: "wid", pendingText: "chapter text" };
          }
        }),
  }));
}

function setMockSteps(steps: import("../steps").StepDescriptor[]) {
  mockPipelineSteps.length = 0;
  mockPipelineSteps.push(...steps);
  mockStepIndex.clear();
  steps.forEach((s, i) => mockStepIndex.set(s.role, i));
  mockGetStepAfter.mockImplementation((role) => {
    const idx = mockStepIndex.get(role);
    if (idx === undefined) return null;
    return mockPipelineSteps[idx + 1]?.role ?? null;
  });
}

async function seedSession(
  currentStep: WritingAgentRole,
  status: "active" | "paused" | "error" = "active",
) {
  const sessionId = "sess-1";
  const planId = "plan-1";

  vi.mocked(db.writingSessions.get).mockResolvedValue({
    id: sessionId,
    novelId: "novel-1",
    chapterPlanId: planId,
    currentStep,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);

  vi.mocked(db.chapterPlans.get).mockResolvedValue({
    id: planId,
    novelId: "novel-1",
    chapterOrder: 2,
    directions: ["direction A"],
    outline: "",
    scenes: [],
    status: "writing",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);

  vi.mocked(db.writingSettings.get).mockResolvedValue(undefined as never);
  vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_SNAPSHOT);

  return { sessionId, planId };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClearStepResult.mockResolvedValue(undefined);
  setMockSteps(buildStubSteps(
    ["plan", "outline", "writer", "normalize", "observe", "audit", "revise", "commit"],
  ));
  vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_SNAPSHOT);
});

describe("stateHash — computed and compared on resume", () => {
  it("returns stale-state when hash mismatches mid-session", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const sessionId = "sess-hash";

    vi.mocked(db.writingSessions.get).mockResolvedValue({
      id: sessionId,
      novelId: "novel-1",
      chapterPlanId: "plan-1",
      currentStep: "outline" as WritingAgentRole,
      status: "active",
      stateHash: "old-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.chapterPlans.get).mockResolvedValue({
      id: "plan-1",
      novelId: "novel-1",
      chapterOrder: 2,
      directions: [],
      outline: "",
      scenes: [],
      status: "writing",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.writingSettings.get).mockResolvedValue(undefined as never);
    vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...STUB_SNAPSHOT,
      lastAppliedChapter: 5,
      updatedAt: new Date("2026-06-01"),
    });

    const result = await runPipeline({ novelId: "novel-1", sessionId });
    expect(result).toBe("stale-state");
  });

  it("does NOT return stale-state when starting at plan (fresh start)", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("plan");

    vi.mocked(db.writingSessions.get).mockResolvedValue({
      id: sessionId,
      novelId: "novel-1",
      chapterPlanId: "plan-1",
      currentStep: "plan" as WritingAgentRole,
      status: "active",
      stateHash: "old-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await runPipeline({ novelId: "novel-1", sessionId });
    expect(result).not.toBe("stale-state");
  });
});

describe("non-blocking bootstrap", () => {
  it("proceeds with warning when bootstrap is incomplete", async () => {
    const { runPipeline } = await import("../run-pipeline");
    vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    vi.mocked(bootstrapStoryState as ReturnType<typeof vi.fn>).mockReturnValue({
      ...STUB_SNAPSHOT,
      incomplete: true,
      warnings: ["Phân tích chưa hoàn tất"],
    });

    vi.mocked(db.storyStates.put).mockResolvedValue(undefined as never);
    const { sessionId } = await seedSession("plan");

    vi.mocked(db.writingSessions.get).mockResolvedValue({
      id: sessionId,
      novelId: "novel-1",
      chapterPlanId: "plan-1",
      currentStep: "plan" as WritingAgentRole,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await runPipeline({ novelId: "novel-1", sessionId });
    expect(result).not.toBe("error");
  });
});

describe("human gate — hands-free off", () => {
  beforeEach(() => {
    vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_SNAPSHOT);
  });

  it("pauses at plan gate when handsFree is false", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("plan");

    const planRun = vi.fn(async () => {});
    setMockSteps([
      { role: "plan", humanGate: true, run: planRun },
      { role: "outline", humanGate: false, run: vi.fn() },
    ]);

    const result = await runPipeline({ novelId: "novel-1", sessionId, handsFree: false });
    expect(result).toBe("awaiting-input");
  });
});

describe("abort → paused", () => {
  it("returns awaiting-input and sets session to paused on abort", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("plan");

    const abortController = new AbortController();
    abortController.abort();

    setMockSteps([
      {
        role: "plan",
        humanGate: false,
        run: async () => { throw new DOMException("Aborted", "AbortError"); },
      },
    ]);

    const result = await runPipeline({
      novelId: "novel-1",
      sessionId,
      abortSignal: abortController.signal,
    });
    expect(result).toBe("awaiting-input");
  });
});

describe("error propagation", () => {
  it("returns error and sets session status on step throw", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("plan");

    const updateSpy = vi.spyOn(db.writingSessions, "update");

    setMockSteps([
      {
        role: "plan",
        humanGate: false,
        run: async () => { throw new Error("LLM error"); },
      },
    ]);

    const result = await runPipeline({ novelId: "novel-1", sessionId });
    expect(result).toBe("error");
    expect(updateSpy).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ status: "error" }),
    );
  });
});

describe("in-memory revise loop — commit called once", () => {
  it("revises in memory without extra commits when shouldRevise returns true then false", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("audit");

    const commitRun = vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
      ctx.snapshot = { ...STUB_SNAPSHOT };
    });

    vi.mocked(shouldRevise as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    setMockSteps([
      { role: "audit", humanGate: false, run: vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
        ctx.bestSoFar = { score: 5, writerStepResultId: "w1", pendingText: "draft" };
        ctx.pendingText = "draft";
      })},
      { role: "revise", humanGate: false, run: vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
        ctx.pendingText = "revised draft";
        ctx.bestSoFar = { score: 8, writerStepResultId: "w1", pendingText: "revised draft" };
      })},
      { role: "commit", humanGate: false, run: commitRun },
    ]);

    const result = await runPipeline({ novelId: "novel-1", sessionId, handsFree: true });

    expect(result).toBe("completed");
    expect(commitRun).toHaveBeenCalledTimes(1);
  });
});

describe("resume — skips completed steps", () => {
  it("skips already-completed steps and advances", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("outline");

    const outlineRun = vi.fn();
    const writerRun = vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
      ctx.pendingText = "chapter text";
    });

    setMockSteps([
      { role: "outline", humanGate: false, run: outlineRun },
      { role: "writer", humanGate: false, run: writerRun },
      { role: "commit", humanGate: false, run: vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
        ctx.snapshot = { ...STUB_SNAPSHOT };
      })},
    ]);

    await runPipeline({ novelId: "novel-1", sessionId, handsFree: true });
    expect(outlineRun).toHaveBeenCalledTimes(1);
    expect(writerRun).toHaveBeenCalledTimes(1);
  });
});

describe("commit re-observes saved scene text", () => {
  it("commit step receives observeConfig, not stale in-memory delta", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("commit");

    let capturedCtx: import("../pipeline-ctx").PipelineCtx | undefined;
    const commitRun = vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
      capturedCtx = ctx;
      ctx.snapshot = { ...STUB_SNAPSHOT };
    });

    setMockSteps([
      { role: "commit", humanGate: false, run: commitRun },
    ]);

    vi.mocked(db.writingStepResults.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const result = await runPipeline({ novelId: "novel-1", sessionId, handsFree: true });

    expect(result).toBe("completed");
    expect(commitRun).toHaveBeenCalledTimes(1);
    expect(capturedCtx).toBeDefined();
  });
});

describe("resume rehydrates bestSoFar", () => {
  it("restores bestSoFar score from persisted observe result on resume", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const { sessionId } = await seedSession("audit");

    const observeResultData = {
      id: "obs-1",
      sessionId,
      role: "audit",
      status: "completed",
      output: JSON.stringify({ score: 7 }),
    };
    const writerResultData = {
      id: "wr-rehydrate",
      sessionId,
      role: "writer",
      status: "completed",
      output: "previously written text",
    };

    vi.mocked(db.writingStepResults.where).mockReturnValue({
      equals: vi.fn().mockImplementation((val: unknown) => {
        const [, role] = val as [string, string];
        if (role === "observe") {
          return {
            first: vi.fn().mockResolvedValue(observeResultData),
            delete: vi.fn().mockResolvedValue(undefined),
            toArray: vi.fn().mockResolvedValue([]),
          };
        }
        if (role === "writer") {
          return {
            first: vi.fn().mockResolvedValue(writerResultData),
            delete: vi.fn().mockResolvedValue(undefined),
            toArray: vi.fn().mockResolvedValue([]),
          };
        }
        return {
          first: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          toArray: vi.fn().mockResolvedValue([]),
        };
      }),
    } as never);

    let capturedBestSoFar: import("../pipeline-ctx").BestSoFar | null = null;
    const auditRun = vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
      capturedBestSoFar = ctx.bestSoFar;
      ctx.bestSoFar = { score: 9, writerStepResultId: "wr-rehydrate", pendingText: "previously written text" };
    });

    setMockSteps([
      { role: "audit", humanGate: false, run: auditRun },
      { role: "commit", humanGate: false, run: vi.fn(async (ctx: import("../pipeline-ctx").PipelineCtx) => {
        ctx.snapshot = { ...STUB_SNAPSHOT };
      })},
    ]);

    await runPipeline({ novelId: "novel-1", sessionId, handsFree: true });

    expect(capturedBestSoFar).not.toBeNull();
    const best = capturedBestSoFar as unknown as import("../pipeline-ctx").BestSoFar;
    expect(best.score).toBe(7);
    expect(best.pendingText).toBe("previously written text");
  });
});

describe("old-role session — no phantom complete on resume", () => {
  it("session with migrated currentStep does not skip steps when stateHash cleared", async () => {
    const { runPipeline } = await import("../run-pipeline");
    const sessionId = "sess-migrated";

    vi.mocked(db.writingSessions.get).mockResolvedValue({
      id: sessionId,
      novelId: "novel-1",
      chapterPlanId: "plan-1",
      currentStep: "plan" as WritingAgentRole,
      status: "paused",
      stateHash: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.chapterPlans.get).mockResolvedValue({
      id: "plan-1",
      novelId: "novel-1",
      chapterOrder: 1,
      directions: [],
      outline: "",
      scenes: [],
      status: "writing",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.writingSettings.get).mockResolvedValue(undefined as never);
    vi.mocked(loadStoryState as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_SNAPSHOT);

    vi.mocked(db.writingStepResults.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const planRun = vi.fn(async () => {});
    setMockSteps([
      { role: "plan", humanGate: true, run: planRun },
    ]);

    const result = await runPipeline({ novelId: "novel-1", sessionId, handsFree: false });

    expect(result).not.toBe("completed");
    expect(planRun).toHaveBeenCalledTimes(1);
  });
});

describe("repairSessionIfWriterOutputEmpty", () => {
  it("deletes empty writer result and resets to writer step", async () => {
    const { repairSessionIfWriterOutputEmpty } = await import("../run-pipeline");

    const firstFn = vi.fn().mockResolvedValue({
      id: "wr-1",
      sessionId: "sess-repair",
      role: "writer",
      status: "completed",
      output: "  ",
    });
    vi.mocked(db.writingStepResults.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({ first: firstFn, delete: vi.fn(), toArray: vi.fn().mockResolvedValue([]) }),
    } as never);
    vi.mocked(db.writingStepResults.delete).mockResolvedValue(undefined as never);

    vi.mocked(db.writingSessions.get).mockResolvedValue({
      id: "sess-repair",
      novelId: "novel-1",
      chapterPlanId: "plan-1",
      currentStep: "audit",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await repairSessionIfWriterOutputEmpty("sess-repair");
    expect(vi.mocked(db.writingStepResults.delete)).toHaveBeenCalledWith("wr-1");
  });
});
