import type {
  StoryStateSnapshot,
  StateDelta,
  KnownFact,
  CharacterState,
} from "@/lib/writing/state/schemas";

export function applyStateDelta(
  snapshot: StoryStateSnapshot,
  delta: StateDelta,
): StoryStateSnapshot {
  if (delta.chapter <= snapshot.lastAppliedChapter) {
    throw new Error(
      `Delta chapter ${delta.chapter} must be greater than last applied chapter ${snapshot.lastAppliedChapter}`,
    );
  }

  const knownFacts = applyFactOps(snapshot.knownFacts, delta, delta.chapter);
  const characterStates = applyCharacterPatches(snapshot.characterStates, delta);
  const knownTruths = applyKnownTruths(snapshot.knownTruths, delta.knownTruthsAdded);

  return {
    ...snapshot,
    lastAppliedChapter: delta.chapter,
    knownFacts,
    characterStates,
    knownTruths,
  };
}

function applyFactOps(
  facts: KnownFact[],
  delta: StateDelta,
  chapter: number,
): KnownFact[] {
  let result = [...facts];

  for (const op of delta.factOps) {
    if (op.op === "add") {
      const idx = result.findIndex(
        (f) => f.subject === op.subject && f.predicate === op.predicate,
      );
      const next: KnownFact = {
        subject: op.subject,
        predicate: op.predicate,
        object: op.object,
        sourceChapter: chapter,
      };
      if (idx >= 0) {
        result = [...result.slice(0, idx), next, ...result.slice(idx + 1)];
      } else {
        result = [...result, next];
      }
    } else {
      result = result.filter(
        (f) =>
          !(f.subject === op.subject && f.predicate === op.predicate && f.object === op.object),
      );
    }
  }

  return result;
}

function applyCharacterPatches(
  states: CharacterState[],
  delta: StateDelta,
): CharacterState[] {
  const result = [...states];

  for (const patch of delta.characterStatePatches) {
    const idx = result.findIndex((s) => s.name === patch.name);
    if (idx >= 0) {
      result[idx] = {
        ...result[idx],
        ...(patch.currentState !== undefined ? { currentState: patch.currentState } : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      };
    } else {
      result.push({
        name: patch.name,
        currentState: patch.currentState ?? "",
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      });
    }
  }

  return result;
}

function applyKnownTruths(existing: string[], additions: string[]): string[] {
  const set = new Set(existing);
  const result = [...existing];
  for (const truth of additions) {
    if (!set.has(truth)) {
      set.add(truth);
      result.push(truth);
    }
  }
  return result;
}
