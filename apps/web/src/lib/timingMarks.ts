// Inserting and removing timing marks without losing the labels.
//
// A timing track's labels are positional - `labels[i]` belongs to `marks[i]` - which is how the
// lyric and phrase tracks arrive from a .pgo import and what the State and Piano effects read. So
// every edit to the marks has to move the labels the same way, and the failure when it doesn't is
// silent: the words come out one phrase late and nothing anywhere reports an error.
//
// It lives here rather than inside the store because it is arithmetic, and because subdividing a
// labelled track adds dozens of marks at once - which is exactly the case where an off-by-one in
// the label list would go unnoticed.

export interface MarkTrack {
  marks: number[];
  labels?: string[];
}

/**
 * A track with marks added, in order, each carrying an empty label.
 *
 * Marks the track already has are dropped rather than duplicated, so dividing the same region
 * twice is a no-op the second time instead of a track with two marks on one millisecond.
 *
 * New marks get a blank label rather than inheriting the one they were cut out of: a subdivision
 * of "Chorus" is not four more Choruses, and a blank is something you can see needs filling in.
 */
export function withMarksAdded(track: MarkTrack, msList: readonly number[]): MarkTrack {
  const existing = new Set(track.marks);
  const fresh = [...new Set(msList)].filter((ms) => !existing.has(ms));
  if (fresh.length === 0) return track;

  const entries = track.marks.map((mark, i) => ({ mark, label: track.labels?.[i] ?? "" }));
  for (const ms of fresh) entries.push({ mark: ms, label: "" });
  entries.sort((a, b) => a.mark - b.mark);

  // Labels stay absent on a track that never had them: adding a column of empty strings to every
  // beat track would make every one of them look like a lyric track that had been cleared.
  return track.labels
    ? { marks: entries.map((e) => e.mark), labels: entries.map((e) => e.label) }
    : { marks: entries.map((e) => e.mark) };
}

/** A track with one mark removed, and its label with it. */
export function withMarkRemoved(track: MarkTrack, ms: number): MarkTrack {
  const index = track.marks.indexOf(ms);
  if (index < 0) return track;
  return track.labels
    ? { marks: track.marks.filter((_, i) => i !== index), labels: track.labels.filter((_, i) => i !== index) }
    : { marks: track.marks.filter((_, i) => i !== index) };
}

/**
 * A track with one mark's label set.
 *
 * Fills the list out to the full length first, so a track that only had a label on its third mark
 * doesn't end up with the fourth one's label at index 0.
 */
export function withLabelSet(track: MarkTrack, index: number, label: string): MarkTrack {
  if (index < 0 || index >= track.marks.length) return track;
  const labels = track.marks.map((_, i) => track.labels?.[i] ?? "");
  labels[index] = label;
  return { marks: [...track.marks], labels };
}
