import raw from "../../../../../tools/sequence-corpus/priors.json";

// What 357 community xLights sequences do, measured (docs/MAGIC-SEQUENCE.md section 3). Bundled
// at build time: aggregate statistics only, no sequence can be rebuilt from them. Effect names are
// xLights' own ("Snowstorm", "Tendril"); engineEffectName() in xsqEffectSettings.ts maps them.

export interface Quantiles { p10?: number; p25: number; p50: number; p75: number; p90?: number; p99?: number }
/** effect name -> share, summing to about 1 over the listed effects. */
export type Shares = Record<string, number>;
export type ParameterPreset = { type: "number" } & Quantiles | { type: "choice"; shares: Shares };

export interface RolePriors {
  songs: number;
  effects: number;
  seconds: number;
  effectShareBySeconds: Shares;
  effectShareByCount: Shares;
  bufferStyle: Shares;
  /** Share of the song a prop of this role is lit, over props. */
  coverage: Quantiles;
}

export interface Priors {
  generatedAt: string;
  corpus: { sequences: number; bpm: Quantiles; effectsPerMinute: Quantiles; durationS: Quantiles };
  effectShareByCount: Shares;
  effectShareBySeconds: Shares;
  targetKind: Shares;
  roles: Record<string, RolePriors>;
  /** How much more a role uses an effect than the corpus does; > 1.5 means "belongs here". */
  roleLift: Record<string, Shares>;
  durationMsByEffect: Record<string, Quantiles>;
  durationBeatsByEffect: Record<string, Quantiles>;
  layers: { perElement: Shares; layerIndexByEffect: Record<string, Shares>; method: Shares };
  transitions: { in: Shares; out: Shares; fadeInShare: number; fadeOutShare: number };
  palette: { distinctColorsPerSequence: Quantiles; size: Quantiles; sizeShare: Shares; topColors: Shares; sizeByEffect: Record<string, number> };
  timing: { startOnAnyTimingMark: number; startOnBeat: number; startOnHalfBeat: number; startOnBar: number };
  structure: {
    activityByTenthOfSong: number[];
    litShareQuietPhrase: Quantiles;
    litShareBusyPhrase: Quantiles;
    busyOverQuietPhrase: Quantiles;
    concurrentEffectTypes: Quantiles;
    bigHitsPerMinute: Quantiles;
    bigHitEffects: Shares;
    sameEffectShareAtSharedStarts: Quantiles;
  };
  intensity: {
    songs: number;
    activeShareOfProps: Record<"low" | "mid" | "high", Quantiles>;
    durationBeats: Record<"low" | "mid" | "high", Quantiles>;
    effectShare: Record<"low" | "mid" | "high", Shares>;
    highVsLowLift: Shares;
    /** "role|low" etc. -> effect shares in that third of the song. */
    byRole: Record<string, Shares>;
  };
  nextEffect: Record<string, Shares>;
  style: {
    signatureEffectShare: Quantiles;
    distinctEffectsCovering90pct: Quantiles;
    identicalRepeatRunLength: Quantiles;
    layersByRole: Record<string, { p50: number; p90: number }>;
    beatAlignmentPerSong: Quantiles;
    beatAlignmentByTempo: Record<string, Quantiles>;
  };
  /** effect -> xLights key -> cycles per beat of effect length. */
  cyclesPerBeat: Record<string, Record<string, Quantiles>>;
  durationBeatsByTempo: Record<string, Quantiles>;
  /** effect -> xLights key -> median or modal choice. */
  parameterPresets: Record<string, Record<string, ParameterPreset>>;
}

export const priors = raw as unknown as Priors;
