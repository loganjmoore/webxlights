import type { SequenceEffect } from "./api";

// xLights' Effect Presets (manual: Sequencer > Effect Presets). A preset saves an effect's whole
// configuration so it can be dropped somewhere else later "without recreating them from scratch",
// and presets are organised into groups - the manual's own examples are "Spirals" and "Bars".
//
// What a preset stores is everything about an effect *except* where it is: its name, params,
// palette (colour curves included), blend mode, mix, transition and layer settings, plus how long
// it ran for. Applying it puts that configuration at a new place and time.
//
// Times are stored as a *duration* rather than as start and end. A preset saved from an effect at
// 12.4s isn't about 12.4s - it is about what that effect looked like - and keeping the absolute
// times would mean every apply had to subtract them back out, with the first frame of the preset
// depending on where it happened to be saved from.

export interface EffectPreset {
  name: string;
  /** The manual's own organisation: presets live in named groups. */
  group: string;
  durationMs: number;
  /** Everything about the effect except its identity and where it sits. */
  // Layer is a *position*, like the times: which layer an effect sits on says nothing about how
  // it looks, and a preset that carried one would move an effect to another layer on being
  // applied - which is not something anyone saving "my warm twinkle" is asking for.
  settings: Omit<SequenceEffect, "id" | "startMs" | "endMs" | "layerIndex">;
}

export const PRESET_FILE_SUFFIX = ".xpreset";
const DEFAULT_GROUP = "Presets";

/** Captures an effect as a preset. */
export function presetFromEffect(effect: SequenceEffect, name: string, group = DEFAULT_GROUP): EffectPreset {
  // Deep-cloned, because a preset that shared a params object with the effect it came from would
  // change every time that effect was edited - and would then apply differently tomorrow.
  const clone = JSON.parse(JSON.stringify(effect)) as SequenceEffect;
  const { startMs, endMs } = clone;
  // The identity and the position are exactly what a preset isn't about, so they are dropped
  // rather than carried and subtracted back out at every apply.
  const settings: EffectPreset["settings"] = { ...clone } as EffectPreset["settings"];
  delete (settings as Partial<SequenceEffect>).id;
  delete (settings as Partial<SequenceEffect>).startMs;
  delete (settings as Partial<SequenceEffect>).endMs;
  delete (settings as Partial<SequenceEffect>).layerIndex;
  return {
    name,
    group: group.trim() || DEFAULT_GROUP,
    durationMs: Math.max(1, endMs - startMs),
    settings,
  };
}

/** Builds the effect a preset describes, at a given moment. */
export function effectFromPreset(preset: EffectPreset, id: string, atMs: number): SequenceEffect {
  const settings = JSON.parse(JSON.stringify(preset.settings)) as EffectPreset["settings"];
  return { ...settings, id, startMs: atMs, endMs: atMs + Math.max(1, preset.durationMs) };
}

/** Presets by group, in the manual's own arrangement, each group's presets sorted by name. */
export function groupPresets(presets: EffectPreset[]): Array<{ group: string; presets: EffectPreset[] }> {
  const byGroup = new Map<string, EffectPreset[]>();
  for (const preset of presets) {
    const list = byGroup.get(preset.group) ?? [];
    list.push(preset);
    byGroup.set(preset.group, list);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => ({ group, presets: [...list].sort((a, b) => a.name.localeCompare(b.name)) }));
}

/**
 * Reads a `.xpreset` file.
 *
 * The manual's own behaviour on import is that "a preset will be created under the highlighted
 * group with the name of the selected file", so the caller supplies both - what is in the file is
 * the effect configuration, not where it should be filed.
 *
 * Returns null rather than throwing for anything that isn't a preset: a file picker is exactly
 * where a user reaches for the wrong file, and a thrown error there would take the tab down.
 */
export function parsePresetFile(text: string, name: string, group: string): EffectPreset | null {
  try {
    const parsed = JSON.parse(text) as Partial<EffectPreset>;
    if (!parsed || typeof parsed !== "object") return null;
    const settings = parsed.settings;
    // An effect with no name has nothing to render, which is the one field worth insisting on.
    if (!settings || typeof settings !== "object" || typeof settings.name !== "string") return null;
    return {
      name,
      group: group.trim() || DEFAULT_GROUP,
      durationMs: Math.max(1, Number(parsed.durationMs) || 1000),
      settings: { ...settings, params: settings.params ?? {} },
    };
  } catch {
    return null;
  }
}

export function presetFileContents(preset: EffectPreset): string {
  // The group and the file's own name are how it is *filed*, not what it is, and the manual has
  // the importer supply both - so they are deliberately left out of the file.
  return JSON.stringify({ durationMs: preset.durationMs, settings: preset.settings }, null, 2);
}

/** A filename safe on every platform, since the preset's name is free text. */
export function presetFileName(preset: EffectPreset): string {
  const safe = preset.name.replace(/[^a-z0-9._ -]/gi, "_").trim();
  // A name made entirely of punctuation sanitises to a row of underscores, which is a filename
  // that tells you nothing about what you just downloaded.
  const named = /[a-z0-9]/i.test(safe) ? safe : "preset";
  return `${named}${PRESET_FILE_SUFFIX}`;
}
