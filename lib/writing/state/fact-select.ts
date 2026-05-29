import type { KnownFact } from "@/lib/writing/state/schemas";

export function selectRelevantFacts(
  facts: KnownFact[],
  subjects: string[],
): KnownFact[] {
  if (subjects.length === 0) return [];
  const subjectSet = new Set(subjects);
  return facts.filter((f) => subjectSet.has(f.subject));
}
