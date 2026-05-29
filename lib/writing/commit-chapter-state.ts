import { db } from "@/lib/db";
import type { PlotPoint } from "@/lib/db";
import { StateDeltaSchema } from "@/lib/writing/state/schemas";
import { applyStateDelta } from "@/lib/writing/state/reducer";
import { loadStoryState } from "@/lib/writing/state/state-store";
import { upsertChapterInsideTxn } from "@/lib/writing/save-chapter";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import { runObserverAgent } from "@/lib/writing/agents/observer-agent";
import type { UpsertInsideTxnOptions } from "@/lib/writing/save-chapter";
import type { StateDelta, StoryStateSnapshot } from "@/lib/writing/state/schemas";
import type { AgentConfig } from "@/lib/writing/types";

export interface CommitInput {
  novelId: string;
  sessionId: string;
  chapterOrder: number;
  observeConfig: AgentConfig;
  chapterSaveData: UpsertInsideTxnOptions;
  chapterPlanId: string;
  /** Reuse a delta already produced by the observe step (skips the re-observe AI call). */
  precomputedDelta?: StateDelta;
}

export type CommitResult =
  | { ok: true; snapshot: StoryStateSnapshot; sceneId: string }
  | { ok: false; error: string };

export async function commitChapterState(input: CommitInput): Promise<CommitResult> {
  const { novelId, sessionId, chapterOrder, observeConfig, chapterSaveData, chapterPlanId } = input;

  if (await isAlreadyCommitted(novelId, sessionId, chapterSaveData, chapterOrder)) {
    const snapshot = await loadStoryState(novelId);
    const sceneId = await getActiveSceneId(chapterSaveData.chapterPlan.chapterId);
    return { ok: true, snapshot: snapshot!, sceneId: sceneId ?? "" };
  }

  const saved = await upsertChapterInsideTxnStandalone(chapterSaveData);

  const activeScenes = await db.scenes
    .where("[chapterId+isActive]")
    .equals([saved.chapterId, 1])
    .toArray();

  const savedText = concatActiveScenes(
    activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
  );

  const currentSnapshot = await loadStoryState(novelId);
  if (!currentSnapshot) {
    return { ok: false, error: "Story state not initialised — bootstrap first" };
  }

  let rawDelta: unknown;
  if (input.precomputedDelta) {
    rawDelta = input.precomputedDelta;
  } else {
    try {
      rawDelta = await runObserverAgent(
        {
          chapterOrder,
          chapterText: savedText.text,
          snapshot: currentSnapshot,
          chapterOutline: chapterSaveData.outline.synopsis,
        },
        observeConfig,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await persistObserveResult(sessionId, undefined, { error: msg });
      return { ok: false, error: msg };
    }
  }

  const parseResult = StateDeltaSchema.safeParse(rawDelta);
  if (!parseResult.success) {
    await persistObserveResult(sessionId, rawDelta, { error: parseResult.error.message });
    return { ok: false, error: parseResult.error.message };
  }

  const delta = parseResult.data as StateDelta;

  // Re-committing a chapter at an already-applied order (e.g. the chapter was
  // deleted then re-saved) would trip the forward-only reducer guard. Rewind the
  // marker so the delta re-applies as a replacement; fact/truth ops dedup.
  const baseSnapshot =
    delta.chapter <= currentSnapshot.lastAppliedChapter
      ? { ...currentSnapshot, lastAppliedChapter: delta.chapter - 1 }
      : currentSnapshot;

  let nextSnapshot: StoryStateSnapshot;
  try {
    nextSnapshot = applyStateDelta(baseSnapshot, delta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await persistObserveResult(sessionId, rawDelta, { error: msg });
    return { ok: false, error: msg };
  }

  try {
    await db.transaction(
      "rw",
      [db.storyStates, db.plotArcs, db.chapterPlans, db.writingStepResults],
      async () => {
        nextSnapshot = {
          ...nextSnapshot,
          bootstrapComplete: true,
          chapterHashes: {
            ...nextSnapshot.chapterHashes,
            [String(chapterOrder)]: savedText.contentHash,
          },
        };

        await db.storyStates.put({ id: novelId, ...nextSnapshot });
        await applyHookOps(novelId, delta, chapterOrder);
        await db.chapterPlans.update(chapterPlanId, {
          chapterId: saved.chapterId,
          status: "saved",
          updatedAt: new Date(),
        });
        await persistObserveResultInTxn(sessionId, rawDelta, { summary: delta.chapterSummary });
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  return { ok: true, snapshot: nextSnapshot!, sceneId: saved.sceneId };
}

async function upsertChapterInsideTxnStandalone(
  options: UpsertInsideTxnOptions,
) {
  return db.transaction(
    "rw",
    [db.chapters, db.scenes],
    async () => upsertChapterInsideTxn(options),
  );
}

async function isAlreadyCommitted(
  novelId: string,
  sessionId: string,
  chapterSaveData: UpsertInsideTxnOptions,
  chapterOrder: number,
): Promise<boolean> {
  const observeResult = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, "observe"])
    .first();

  if (observeResult?.status !== "completed") return false;

  const chapterId = chapterSaveData.chapterPlan.chapterId;
  if (!chapterId) return false;

  const chapterRow = await db.chapters.get(chapterId);
  if (!chapterRow) return false;

  const snapshot = await loadStoryState(novelId);
  if (!snapshot) return false;

  const storedHash = snapshot.chapterHashes[String(chapterOrder)];
  if (!storedHash) return false;

  const activeScenes = await db.scenes
    .where("[chapterId+isActive]")
    .equals([chapterId, 1])
    .toArray();

  if (activeScenes.length === 0) return false;

  const { contentHash } = concatActiveScenes(
    activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
  );

  return storedHash === contentHash;
}

async function getActiveSceneId(chapterId: string | undefined): Promise<string | undefined> {
  if (!chapterId) return undefined;
  const scene = await db.scenes
    .where("[chapterId+isActive]")
    .equals([chapterId, 1])
    .first();
  return scene?.id;
}

async function applyHookOps(
  novelId: string,
  delta: StateDelta,
  chapterOrder: number,
): Promise<void> {
  if (delta.hookOps.length === 0) return;

  const arcs = await db.plotArcs.where("novelId").equals(novelId).toArray();
  const arcMap = new Map(arcs.map((a) => [a.id, a]));

  for (const op of delta.hookOps) {
    const arc = arcMap.get(op.plotArcId);
    if (!arc) continue;

    const points = [...arc.plotPoints];
    if (op.op === "add") {
      if (!op.title) continue;
      points.push({
        id: crypto.randomUUID(),
        title: op.title,
        description: op.description ?? "",
        status: "in-progress",
        chapterOrder,
        lastAdvancedChapter: chapterOrder,
      });
    } else {
      const idx = points.findIndex((p) => p.id === op.plotPointId);
      if (idx < 0) continue;
      points[idx] = applyHookOpToPoint(points[idx], op.op, chapterOrder);
    }

    await db.plotArcs.update(arc.id, { plotPoints: points, updatedAt: new Date() });
  }
}

function applyHookOpToPoint(
  point: PlotPoint,
  op: "advance" | "resolve" | "defer",
  chapterOrder: number,
): PlotPoint {
  if (op === "resolve") return { ...point, status: "resolved", lastAdvancedChapter: chapterOrder };
  if (op === "advance") return { ...point, status: "in-progress", lastAdvancedChapter: chapterOrder };
  return { ...point, lastAdvancedChapter: chapterOrder };
}

type ObservePayload = { error: string } | { summary: string };

async function persistObserveResult(
  sessionId: string,
  rawDelta: unknown,
  payload: ObservePayload,
): Promise<void> {
  await db.transaction("rw", db.writingStepResults, async () => {
    await persistObserveResultInTxn(sessionId, rawDelta, payload);
  });
}

async function persistObserveResultInTxn(
  sessionId: string,
  rawDelta: unknown,
  payload: ObservePayload,
): Promise<void> {
  const isError = "error" in payload;
  const existing = await db.writingStepResults
    .where("[sessionId+role]")
    .equals([sessionId, "observe"])
    .first();

  const now = new Date();
  const output = JSON.stringify({ rawDelta, ...payload });

  if (existing) {
    await db.writingStepResults.update(existing.id, {
      status: isError ? "error" : "completed",
      output,
      error: isError ? payload.error : undefined,
      completedAt: now,
    });
  } else {
    await db.writingStepResults.add({
      id: crypto.randomUUID(),
      sessionId,
      role: "observe",
      status: isError ? "error" : "completed",
      output,
      error: isError ? payload.error : undefined,
      startedAt: now,
      completedAt: now,
    });
  }
}
