import type { PlotArc, PlotPoint } from "@/lib/db";

export function flattenHookTitles(
  arcs: PlotArc[],
): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const arc of arcs) {
    out.push({ id: arc.id, title: arc.title });
    for (const point of arc.plotPoints) {
      out.push({ id: point.id, title: point.title });
    }
  }
  return out;
}

export function selectOpenHooks(arcs: PlotArc[]): PlotPoint[] {
  const open: PlotPoint[] = [];
  for (const arc of arcs) {
    if (arc.status === "completed" || arc.status === "abandoned") continue;
    for (const point of arc.plotPoints) {
      if (point.status !== "resolved") {
        open.push(point);
      }
    }
  }
  return open;
}

export type HookTiming = "overdue" | "upcoming" | "none";

export function classifyOverdue(point: PlotPoint, currentChapter: number): HookTiming {
  if (point.status === "resolved") return "none";
  if (point.chapterOrder == null) return "none";
  if (point.chapterOrder <= currentChapter) return "overdue";
  return "upcoming";
}
