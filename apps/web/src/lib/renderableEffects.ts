import { labelsFromTrack, toRenderPalette, type EffectData, type StateEntry, type TimingLabel } from "@webxlights/engine";
import type { ModelRecord, SequenceEffect, TimingTrack } from "./api";

// Turning this app's stored effects into what the engine renders.
//
// Every render path used to do the same one-liner - copy the effect, resolve its palette - inline,
// which was fine while the palette was the only thing needing resolving. It isn't any more: the
// label-driven effects (State, Piano) are rendered from the *sequence's timing tracks* and the
// *model's state definitions*, neither of which a row knows about, and an export that resolved
// them differently from the preview would put a different show in the yard than on the screen.
// So there is now one place that does it, and every path goes through it.

export interface EffectSourceData {
  /** The sequence's timing tracks - an effect names the one that drives it. */
  timingTracks?: TimingTrack[];
  /** The model this row belongs to, for its own state definitions. */
  model?: Pick<ModelRecord, "states"> | null;
}

function labelsByTrackName(tracks: TimingTrack[] | undefined): Map<string, TimingLabel[]> {
  const out = new Map<string, TimingLabel[]>();
  for (const track of tracks ?? []) out.set(track.name, labelsFromTrack(track.marks, track.labels));
  return out;
}

function entriesFor(model: EffectSourceData["model"], definitionName: unknown): StateEntry[] | undefined {
  const definitions = model?.states ?? [];
  if (definitions.length === 0) return undefined;
  const wanted = typeof definitionName === "string" ? definitionName.trim() : "";
  // With one definition and none named, that one is what "the model's states" means - naming it
  // would be ceremony. With several, the effect has to say which, or it would silently render
  // whichever happened to be first.
  const found = wanted ? definitions.find((d) => d.name === wanted) : definitions.length === 1 ? definitions[0] : undefined;
  return found?.entries;
}

/**
 * Resolves the palette and the label-driven data for a row's effects.
 *
 * `data` is left off entirely for effects that don't need it, so nothing else in the pipeline
 * changes shape for a feature it doesn't use.
 */
export function toRenderableEffects(effects: SequenceEffect[], source: EffectSourceData = {}) {
  const labels = labelsByTrackName(source.timingTracks);

  return effects.map((effect) => {
    const trackName = effect.params.timingTrack;
    const timing = typeof trackName === "string" && trackName ? labels.get(trackName) : undefined;
    const states = entriesFor(source.model, effect.params.stateDefinition);
    const data: EffectData | undefined = timing || states ? { timing, states } : undefined;
    return { ...effect, palette: toRenderPalette(effect.palette), ...(data ? { data } : {}) };
  });
}
