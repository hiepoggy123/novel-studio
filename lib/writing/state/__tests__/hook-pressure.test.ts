import { describe, it, expect } from "vitest";
import {
  selectOpenHooks,
  classifyOverdue,
  flattenHookTitles,
} from "@/lib/writing/state/hook-pressure";
import type { PlotArc, PlotPoint } from "@/lib/db";

function makeArc(overrides: Partial<PlotArc> = {}): PlotArc {
  return {
    id: "arc-1",
    novelId: "novel-1",
    title: "Arc A",
    description: "desc",
    type: "main",
    plotPoints: [],
    status: "active",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makePoint(overrides: Partial<PlotPoint> = {}): PlotPoint {
  return {
    id: "pp-1",
    title: "Hook A",
    description: "desc",
    status: "planned",
    ...overrides,
  };
}

describe("selectOpenHooks", () => {
  it("returns plot points that are not resolved", () => {
    const arc = makeArc({
      plotPoints: [
        makePoint({ id: "pp-1", status: "planned" }),
        makePoint({ id: "pp-2", status: "in-progress" }),
        makePoint({ id: "pp-3", status: "resolved" }),
      ],
    });
    const result = selectOpenHooks([arc]);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.status !== "resolved")).toBe(true);
  });

  it("skips resolved and abandoned arcs entirely", () => {
    const resolved = makeArc({ status: "completed", plotPoints: [makePoint({ status: "planned" })] });
    const abandoned = makeArc({ status: "abandoned", plotPoints: [makePoint({ status: "planned" })] });
    const result = selectOpenHooks([resolved, abandoned]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when all plot points are resolved", () => {
    const arc = makeArc({ plotPoints: [makePoint({ status: "resolved" })] });
    expect(selectOpenHooks([arc])).toHaveLength(0);
  });

  it("returns empty array for empty arcs list", () => {
    expect(selectOpenHooks([])).toHaveLength(0);
  });

  it("includes coreHook field when present", () => {
    const arc = makeArc({
      plotPoints: [makePoint({ id: "pp-1", status: "planned", coreHook: true })],
    });
    const result = selectOpenHooks([arc]);
    expect(result[0].coreHook).toBe(true);
  });
});

describe("flattenHookTitles", () => {
  it("emits arc and plot-point id/title pairs in order", () => {
    const arc = makeArc({
      id: "arc-1",
      title: "Arc A",
      plotPoints: [
        makePoint({ id: "pp-1", title: "Hook 1" }),
        makePoint({ id: "pp-2", title: "Hook 2" }),
      ],
    });
    expect(flattenHookTitles([arc])).toEqual([
      { id: "arc-1", title: "Arc A" },
      { id: "pp-1", title: "Hook 1" },
      { id: "pp-2", title: "Hook 2" },
    ]);
  });

  it("includes resolved/abandoned arcs (resolution is the caller's concern)", () => {
    const arc = makeArc({
      id: "arc-x",
      status: "completed",
      plotPoints: [makePoint({ id: "pp-x", status: "resolved" })],
    });
    expect(flattenHookTitles([arc])).toHaveLength(2);
  });

  it("returns empty for empty arcs", () => {
    expect(flattenHookTitles([])).toEqual([]);
  });
});

describe("classifyOverdue", () => {
  it("returns overdue when chapterOrder <= currentChapter and point not resolved", () => {
    const point = makePoint({ chapterOrder: 3, status: "planned" });
    expect(classifyOverdue(point, 5)).toBe("overdue");
  });

  it("returns overdue when chapterOrder equals currentChapter", () => {
    const point = makePoint({ chapterOrder: 5, status: "planned" });
    expect(classifyOverdue(point, 5)).toBe("overdue");
  });

  it("returns upcoming when chapterOrder > currentChapter", () => {
    const point = makePoint({ chapterOrder: 10, status: "planned" });
    expect(classifyOverdue(point, 5)).toBe("upcoming");
  });

  it("returns none when no chapterOrder set", () => {
    const point = makePoint({ chapterOrder: undefined, status: "planned" });
    expect(classifyOverdue(point, 5)).toBe("none");
  });

  it("returns none when point is already resolved", () => {
    const point = makePoint({ chapterOrder: 3, status: "resolved" });
    expect(classifyOverdue(point, 5)).toBe("none");
  });
});
