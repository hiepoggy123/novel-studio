import { create } from "zustand";
import type { ScanPhase, ScanProgress, ScanResult } from "@/lib/continuity/schemas";

const MAX_LOG = 40;

interface ContinuityState {
  isScanning: boolean;
  novelId: string | null;
  phase: ScanPhase;
  done: number;
  total: number;
  log: string[];
  abortController: AbortController | null;
  lastResult: ScanResult | null;

  start: (novelId: string) => AbortController;
  setProgress: (progress: ScanProgress) => void;
  finish: (result: ScanResult) => void;
  cancel: () => void;
  reset: () => void;
}

export const useContinuityStore = create<ContinuityState>((set, get) => ({
  isScanning: false,
  novelId: null,
  phase: "observe",
  done: 0,
  total: 0,
  log: [],
  abortController: null,
  lastResult: null,

  start: (novelId) => {
    get().abortController?.abort();
    const abortController = new AbortController();
    set({
      isScanning: true,
      novelId,
      phase: "observe",
      done: 0,
      total: 0,
      log: [],
      abortController,
      lastResult: null,
    });
    return abortController;
  },

  setProgress: (progress) =>
    set((state) => ({
      phase: progress.phase,
      done: progress.done,
      total: progress.total,
      log: progress.message
        ? [...state.log, progress.message].slice(-MAX_LOG)
        : state.log,
    })),

  finish: (result) =>
    set({ isScanning: false, phase: "done", abortController: null, lastResult: result }),

  cancel: () => {
    get().abortController?.abort();
    set({ isScanning: false, abortController: null });
  },

  reset: () =>
    set({
      isScanning: false,
      novelId: null,
      phase: "observe",
      done: 0,
      total: 0,
      log: [],
      abortController: null,
      lastResult: null,
    }),
}));
