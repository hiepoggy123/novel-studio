import { db } from "@/lib/db";
import type { ContinuityFinding } from "@/lib/db";
import { resolveStep } from "@/lib/ai/resolve-step";
import { runWithConcurrency, CONCURRENCY_LIMIT } from "@/lib/analysis/concurrency";
import { runObserverAgent } from "@/lib/writing/agents/observer-agent";
import { getDefaultPrompt } from "@/lib/writing/prompts";
import { applyStateDelta } from "@/lib/writing/state/reducer";
import { loadStoryState, saveStoryState } from "@/lib/writing/state/state-store";
import { concatActiveScenes } from "@/lib/writing/read-chapter-text";
import type { AgentConfig } from "@/lib/writing/types";
import type { StateDelta, StoryStateSnapshot } from "@/lib/writing/state/schemas";
import { buildScanLedger, type LedgerChapterInput } from "@/lib/continuity/scan-ledger";
import { buildAliasMap } from "@/lib/continuity/subject-normalize";
import { detectFactConflicts } from "@/lib/continuity/detectors/fact-conflict";
import { detectAbandonedConflicts } from "@/lib/continuity/detectors/abandoned-conflict";
import { detectNameInconsistencies } from "@/lib/continuity/detectors/name-consistency";
import {
  runCharacterStateDetection,
  MAX_SUSPECTS,
} from "@/lib/continuity/detectors/character-state";
import type {
  DetectedFinding,
  Detector,
  DetectorCtx,
  ScanInput,
  ScanResult,
} from "@/lib/continuity/schemas";

const STALE_GAP = 25;

const DEFAULT_DETECTORS: Detector[] = [
  detectFactConflicts,
  detectAbandonedConflicts,
  detectNameInconsistencies,
];

// Observations run in parallel (no incrementally-built prior state), so each
// chapter is observed against an empty snapshot. Cross-chapter reasoning is the
// detectors' job, working off the full ledger — not the observer.
const EMPTY_SNAPSHOT: StoryStateSnapshot = {
  lastAppliedChapter: 0,
  characterStates: [],
  worldFacts: "",
  openConflicts: [],
  knownTruths: [],
  knownFacts: [],
  chapterHashes: {},
  bootstrapComplete: false,
  updatedAt: new Date(0),
};

interface PreparedChapter {
  chapterId: string;
  chapterOrder: number;
  text: string;
  contentHash: string;
}

/** Resolve the continuity model (continuityModel, then chapterModel fallback). */
async function resolveContinuityConfig(
  signal?: AbortSignal,
): Promise<AgentConfig | undefined> {
  const settings = await db.analysisSettings.get("default");
  const model =
    (await resolveStep(settings?.continuityModel)) ??
    (await resolveStep(settings?.chapterModel));
  if (!model) return undefined;
  const chatSettings = await db.chatSettings.get("default");
  return {
    model,
    systemPrompt: settings?.continuityPrompt?.trim() || getDefaultPrompt("observe"),
    globalInstruction: chatSettings?.globalSystemInstruction,
    abortSignal: signal,
  };
}

async function prepareChapters(novelId: string): Promise<PreparedChapter[]> {
  const chapters = await db.chapters.where("novelId").equals(novelId).toArray();
  chapters.sort((a, b) => a.order - b.order);

  const prepared: PreparedChapter[] = [];
  for (const ch of chapters) {
    const activeScenes = await db.scenes
      .where("[chapterId+isActive]")
      .equals([ch.id, 1])
      .toArray();
    if (activeScenes.length === 0) continue;
    const { text, contentHash } = concatActiveScenes(
      activeScenes.map((s) => ({ id: s.id, content: s.content, order: s.order })),
    );
    if (!text.trim()) continue;
    prepared.push({
      chapterId: ch.id,
      chapterOrder: ch.order,
      text,
      contentHash,
    });
  }
  return prepared;
}

async function buildDetectorCtx(novelId: string): Promise<DetectorCtx> {
  const [scopedNames, globalNames, frequencies, plotArcs] = await Promise.all([
    db.nameEntries.where("scope").equals(novelId).toArray(),
    db.nameEntries.where("scope").equals("global").toArray(),
    db.nameFrequency.where("novelId").equals(novelId).toArray(),
    db.plotArcs.where("novelId").equals(novelId).toArray(),
  ]);
  const nameEntries = [...scopedNames, ...globalNames].map((e) => ({
    chinese: e.chinese,
    vietnamese: e.vietnamese,
    scope: e.scope,
  }));
  const nameFrequencies = frequencies.map((f) => ({
    chinese: f.chinese,
    reading: f.reading,
    chapters: f.chapters,
    status: f.status,
  }));
  const plotPoints = plotArcs.flatMap((arc) =>
    (arc.plotPoints ?? []).map((p) => ({
      title: p.title,
      status: p.status,
      lastAdvancedChapter: p.lastAdvancedChapter,
    })),
  );
  return {
    novelId,
    staleGap: STALE_GAP,
    aliasMap: buildAliasMap(nameEntries),
    nameEntries,
    nameFrequencies,
    plotPoints,
  };
}

async function upsertFindings(
  novelId: string,
  detected: DetectedFinding[],
  opts: { allowDelete: boolean } = { allowDelete: true },
): Promise<void> {
  const existing = await db.continuityFindings.where("novelId").equals(novelId).toArray();
  const existingBySig = new Map(existing.map((f) => [f.signature, f]));
  const now = new Date();
  const seen = new Set<string>();
  const toPut: ContinuityFinding[] = [];

  for (const d of detected) {
    seen.add(d.signature);
    const prev = existingBySig.get(d.signature);
    if (prev) {
      toPut.push({
        ...prev,
        type: d.type,
        severity: d.severity,
        confidence: d.confidence,
        title: d.title,
        description: d.description,
        evidence: d.evidence,
        updatedAt: now,
      });
    } else {
      toPut.push({
        id: crypto.randomUUID(),
        novelId,
        status: "open",
        createdAt: now,
        updatedAt: now,
        ...d,
      });
    }
  }

  // Stale cleanup: drop findings that vanished AND are still "open".
  // Keep dismissed/resolved rows as history. Skipped on partial scans.
  const staleOpenIds = opts.allowDelete
    ? existing
        .filter((f) => !seen.has(f.signature) && f.status === "open")
        .map((f) => f.id)
    : [];

  await db.transaction("rw", db.continuityFindings, async () => {
    if (staleOpenIds.length) await db.continuityFindings.bulkDelete(staleOpenIds);
    if (toPut.length) await db.continuityFindings.bulkPut(toPut);
  });
}

/**
 * Scan a novel for continuity issues. Observes (LLM, incremental via the
 * observation cache), reduces into a seed-only StoryState, builds the detector
 * ledger, runs the supplied detectors, and upserts findings (dedupe by
 * signature so dismiss/resolve persist across re-scans).
 */
export async function scanNovel(input: ScanInput): Promise<ScanResult> {
  const { novelId, full, detectors = DEFAULT_DETECTORS, onProgress, signal } = input;
  const warnings: string[] = [];

  const prepared = await prepareChapters(novelId);
  const config = await resolveContinuityConfig(signal);
  if (!config) {
    warnings.push(
      "Chưa cấu hình mô hình AI cho kiểm tra nhất quán — bỏ qua bước quan sát.",
    );
  }

  const cached = await db.continuityObservations
    .where("novelId")
    .equals(novelId)
    .toArray();
  const cachedByOrder = new Map(cached.map((o) => [o.chapterOrder, o]));

  const toObserve = config
    ? prepared.filter(
        (c) =>
          full ||
          cachedByOrder.get(c.chapterOrder)?.contentHash !== c.contentHash,
      )
    : [];

  let done = 0;
  const report = () =>
    onProgress?.({ phase: "observe", done, total: toObserve.length });
  report();

  const observedDeltas = new Map<number, StateDelta>();
  if (config && toObserve.length > 0) {
    const tasks = toObserve.map((ch) => async () => {
      if (signal?.aborted) return;
      try {
        const delta = await runObserverAgent(
          { chapterOrder: ch.chapterOrder, chapterText: ch.text, snapshot: EMPTY_SNAPSHOT },
          config,
        );
        // Persist each observation immediately so a cancelled scan keeps its
        // progress — a re-scan resumes from the un-observed chapters.
        observedDeltas.set(ch.chapterOrder, delta);
        await db.continuityObservations.put({
          id: `${novelId}:${ch.chapterOrder}`,
          novelId,
          chapterOrder: ch.chapterOrder,
          chapterId: ch.chapterId,
          contentHash: ch.contentHash,
          delta,
          updatedAt: new Date(),
        });
        done += 1;
        onProgress?.({
          phase: "observe",
          done,
          total: toObserve.length,
          message: `Ch.${ch.chapterOrder}: ${delta.chapterSummary.trim()}`,
        });
      } catch (err) {
        // Cancel ends gracefully (no throw): observed-so-far stays cached and the
        // run proceeds to surface partial findings. Other failures → warning.
        if (err instanceof Error && err.name === "AbortError") return;
        warnings.push(
          `Không thể quan sát chương ${ch.chapterOrder}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
    await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
  }

  const partial = signal?.aborted ?? false;

  if (partial) {
    warnings.push(
      "Quét bị huỷ — đã lưu tiến độ. Quét lại để tiếp tục các chương còn lại.",
    );
  }

  // Assemble full delta set from fresh observations + cache.
  const ledgerChapters: LedgerChapterInput[] = [];
  let observedCount = 0;
  let cachedCount = 0;
  for (const ch of prepared) {
    const fresh = observedDeltas.get(ch.chapterOrder);
    const stored = cachedByOrder.get(ch.chapterOrder);
    const delta =
      fresh ?? (stored?.contentHash === ch.contentHash ? stored.delta : undefined);
    if (!delta) continue;
    if (fresh) observedCount += 1;
    else cachedCount += 1;
    ledgerChapters.push({
      chapterOrder: ch.chapterOrder,
      chapterId: ch.chapterId,
      text: ch.text,
      delta,
    });
  }

  const ledger = buildScanLedger(ledgerChapters);

  // Seed-only StoryState persist: only when no usable state exists, and never on
  // a partial (cancelled) run — a half-built snapshot would block future seeding.
  let statePersisted = false;
  const existingState = await loadStoryState(novelId);
  if (!partial && (!existingState || existingState.bootstrapComplete === false)) {
    try {
      const seed = existingState ?? EMPTY_SNAPSHOT;
      const chapterHashes: Record<string, string> = { ...seed.chapterHashes };
      let snapshot: StoryStateSnapshot = { ...seed, chapterHashes };
      const ordered = [...ledgerChapters].sort(
        (a, b) => a.chapterOrder - b.chapterOrder,
      );
      for (const ch of ordered) {
        if (ch.delta.chapter <= snapshot.lastAppliedChapter) continue;
        snapshot = applyStateDelta(snapshot, ch.delta);
        chapterHashes[String(ch.chapterOrder)] =
          prepared.find((p) => p.chapterOrder === ch.chapterOrder)?.contentHash ?? "";
      }
      snapshot = {
        ...snapshot,
        chapterHashes,
        bootstrapComplete: true,
        updatedAt: new Date(),
      };
      await saveStoryState(novelId, snapshot);
      statePersisted = true;
    } catch (err) {
      warnings.push(
        `Không thể dựng trạng thái truyện: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Build detector context (QT + plot data injected so detectors stay pure).
  onProgress?.({
    phase: "detect",
    done: ledgerChapters.length,
    total: ledgerChapters.length,
    message: "Phân tích dữ kiện, mạch truyện, tên dịch…",
  });
  const ctx = await buildDetectorCtx(novelId);

  const detected: DetectedFinding[] = [];
  for (const detector of detectors) {
    const results = await detector(ledger, ctx);
    detected.push(...results);
  }

  // Character-state hybrid detector (deterministic suspects + LLM confirm).
  // Run separately because it needs the resolved model + chapter text and can
  // report a suspect-cap truncation warning. Skipped on a cancelled run — it
  // would start fresh LLM calls right after the user asked to stop.
  if (config && !partial) {
    const textByOrder = new Map(prepared.map((p) => [p.chapterOrder, p.text]));
    try {
      const cs = await runCharacterStateDetection({
        ledger,
        config,
        getChapterText: (order) => textByOrder.get(order),
        signal,
        onProgress,
      });
      detected.push(...cs.findings);
      if (cs.truncated > 0) {
        warnings.push(
          `Còn ${cs.truncated} nghi vấn nhân vật chưa kiểm tra (đã giới hạn ${MAX_SUSPECTS}).`,
        );
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        warnings.push(
          `Lỗi kiểm tra trạng thái nhân vật: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // On a partial run, only add/update findings — never delete. The ledger is
  // incomplete, so a vanished signature does not mean the issue is resolved.
  await upsertFindings(novelId, detected, { allowDelete: !partial });

  return {
    findingsCount: detected.length,
    observedChapters: observedCount,
    cachedChapters: cachedCount,
    statePersisted,
    partial,
    warnings,
  };
}
