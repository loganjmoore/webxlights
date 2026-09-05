// Typeahead over a list of names: what you typed, closest first.
//
// A show has hundreds of rows, and the one you want is the one you can half remember the name
// of. Ranked rather than merely filtered, so "tree" puts "Tree" above "Mega Tree" above
// "Street Lights", and typing the exact name puts exactly that at the top.

export type MatchRank = "exact" | "prefix" | "word" | "substring" | "subsequence";

const ORDER: MatchRank[] = ["exact", "prefix", "word", "substring", "subsequence"];

/** How well `name` answers `query`, or null when it does not. Case and surrounding space are ignored. */
export function matchRank(name: string, query: string): MatchRank | null {
  const q = query.trim().toLowerCase();
  if (q === "") return "substring";
  const n = name.toLowerCase();
  if (n === q) return "exact";
  if (n.startsWith(q)) return "prefix";
  if (n.split(/[\s_-]+/).some((word) => word.startsWith(q))) return "word";
  if (n.includes(q)) return "substring";
  // Every typed letter appears, in order: "gmx" finds "Garage Matrix".
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length ? "subsequence" : null;
}

/**
 * The items whose name matches, best matches first. Ties keep the list's own order, so an
 * empty query returns the list untouched.
 */
export function filterRanked<T>(items: readonly T[], query: string, nameOf: (item: T) => string): T[] {
  if (query.trim() === "") return [...items];
  return items
    .map((item, index) => ({ item, index, rank: matchRank(nameOf(item), query) }))
    .filter((m): m is { item: T; index: number; rank: MatchRank } => m.rank !== null)
    .sort((a, b) => ORDER.indexOf(a.rank) - ORDER.indexOf(b.rank) || a.index - b.index)
    .map((m) => m.item);
}

/** A strand the user never named: xLights and this app both number them "Strand 3". */
export function isDefaultStrandName(name: string): boolean {
  return /^strand\s*\d+$/i.test(name.trim());
}
