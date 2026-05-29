import { db } from "@/lib/db";
import { loadStoryState } from "@/lib/writing/state/state-store";
import { formatRetrievedContext } from "./retrieved-context-format";
import type { ContextAgentOutput } from "./types";
import type { FormattedRetrievedContext } from "./retrieved-context-format";

export type { FormattedRetrievedContext };

export async function buildRetrievedContext(
  novelId: string,
  chapterOrder: number,
  subjects: string[] = [],
): Promise<FormattedRetrievedContext> {
  const [snapshot, plotArcs] = await Promise.all([
    loadStoryState(novelId),
    db.plotArcs.where("novelId").equals(novelId).toArray(),
  ]);

  if (!snapshot) {
    return { context: "", tokenCount: 0 };
  }

  return formatRetrievedContext(snapshot, plotArcs, chapterOrder, subjects);
}

export function retrievedContextToAgentOutput(
  ctx: FormattedRetrievedContext,
  chapterOrder: number,
): ContextAgentOutput {
  return {
    previousEvents: ctx.context,
    characterStates: [],
    worldState: "",
    plotProgress: `Chương ${chapterOrder}`,
    unresolvedThreads: [],
  };
}
