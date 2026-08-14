// Labelled timing cells - the bridge between a sequence's timing tracks and the effects that are
// driven by them.
//
// Most effects are driven entirely by their own parameters and the playhead. Three of xLights'
// are not: State, Piano and Faces read *words the sequencer typed onto a timing track* and turn
// them into what the prop does - a phoneme, a state name, a piano key. The manual is explicit
// about the mechanism for each: "expand the view so that you can see the labels of the timing
// track and change the labels to match the required keys".
//
// A timing track is stored as marks plus an optional label per mark. A *cell* is the span between
// one mark and the next, and its label is the one authored at the opening mark - which is why the
// label belongs to the mark's authored index, not to its position after sorting.

export interface TimingLabel {
  startMs: number;
  endMs: number;
  label: string;
}

/**
 * Builds the labelled cells of a timing track.
 *
 * Marks are paired with their labels *before* sorting, because a label belongs to the mark it was
 * authored against; sorting first would hand a label to whichever mark happened to land at that
 * index. Cells with no label are dropped - there is nothing for a label-driven effect to do with
 * a bare timing mark, and keeping them would make "the cell at the playhead" mean an empty state.
 */
export function labelsFromTrack(marks: readonly number[], labels?: readonly string[]): TimingLabel[] {
  const paired = marks.map((ms, i) => ({ ms, label: (labels?.[i] ?? "").trim() }));
  paired.sort((a, b) => a.ms - b.ms);

  const out: TimingLabel[] = [];
  for (let i = 0; i < paired.length - 1; i++) {
    const cell = paired[i]!;
    if (!cell.label) continue;
    out.push({ startMs: cell.ms, endMs: paired[i + 1]!.ms, label: cell.label });
  }
  return out;
}

/** The cell containing `atMs`, or undefined between labelled cells. */
export function labelAt(labels: readonly TimingLabel[], atMs: number): TimingLabel | undefined {
  return labels.find((l) => atMs >= l.startMs && atMs < l.endMs);
}

/** The cells that overlap a span at all - a cell straddling the effect's start still counts. */
export function labelsWithin(labels: readonly TimingLabel[], startMs: number, endMs: number): TimingLabel[] {
  return labels.filter((l) => l.endMs > startMs && l.startMs < endMs);
}

/**
 * Splits one label into the several things it names.
 *
 * Both label-driven effects allow it and say so: Piano's "you can also specify multiple values in
 * one label and accordingly multiple keys will be depressed... keys are separated by space, comma
 * or colons", and State's seven-segment example, where the number 123 is written as "100,20,3".
 */
export function splitLabel(label: string): string[] {
  return label
    .split(/[\s,:]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
