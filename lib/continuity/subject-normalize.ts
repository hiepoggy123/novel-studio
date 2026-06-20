import type { NameEntryLite } from "@/lib/continuity/schemas";

/**
 * Build an alias map (lowercased surface form -> canonical Vietnamese name) from
 * NameEntry rows. Both the Chinese and Vietnamese forms point at the canonical
 * Vietnamese name so facts referencing either form group together.
 */
export function buildAliasMap(entries: NameEntryLite[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    const canonical = e.vietnamese.trim();
    if (!canonical) continue;
    const vi = canonical.toLowerCase();
    map.set(vi, canonical);
    const cn = e.chinese.trim().toLowerCase();
    if (cn) map.set(cn, canonical);
  }
  return map;
}

/** Normalize a fact subject for grouping: trim + lowercase + alias resolution. */
export function normalizeSubject(
  subject: string,
  aliasMap?: Map<string, string>,
): string {
  const key = subject.trim().toLowerCase();
  const canonical = aliasMap?.get(key);
  return (canonical ?? key).toLowerCase();
}
