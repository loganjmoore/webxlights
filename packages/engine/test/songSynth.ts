import { mulberry32 } from "../src/rng";

// Synthetic songs, built in the test so every expectation is exact: the beats are where the
// generator put them and the sections are as long as the spec says. A real recording's beats are
// a judgement call, which is not what these tests are for.

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const triad = (root: number, minor = false): number[] => [root, root + (minor ? 3 : 4), root + 7].map(midiHz);

export type Groove = "kick-hat" | "full";
export interface Part {
  bars: number;
  /** One chord per bar, cycling. Omit for drums only. */
  chords?: number[][];
  /** Pad level. */
  pad?: number;
  groove?: Groove;
  /** Overall drum level. */
  drums?: number;
}

export function render(sampleRate: number, bpm: number, parts: Part[], beatsPerBar = 4, seed = 7): Float32Array {
  const beatSamples = (sampleRate * 60) / bpm;
  const totalBars = parts.reduce((n, p) => n + p.bars, 0);
  const out = new Float32Array(Math.ceil(totalBars * beatsPerBar * beatSamples));
  const rand = mulberry32(seed);
  const add = (at: number, length: number, f: (t: number, n: number) => number): void => {
    const start = Math.round(at);
    for (let n = 0; n < length && start + n < out.length; n++) out[start + n]! += f(n / sampleRate, n);
  };

  let bar = 0;
  for (const part of parts) {
    for (let b = 0; b < part.bars; b++, bar++) {
      const barStart = bar * beatsPerBar * beatSamples;
      const chord = part.chords?.[b % part.chords.length];
      if (chord) {
        const pad = part.pad ?? 0.2;
        const length = Math.round(beatsPerBar * beatSamples);
        const fade = Math.round(sampleRate * 0.03);
        add(barStart, length, (t, n) => {
          // a short fade at each end so a chord change is a change of notes, not a click
          const env = Math.min(1, n / fade, (length - n) / fade);
          let s = 0;
          for (const f of chord) s += Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t);
          return (pad * env * s) / chord.length;
        });
      }
      if (!part.groove) continue;
      const level = part.drums ?? 1;
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const at = barStart + beat * beatSamples;
        let phase = 0;
        add(at, Math.round(sampleRate * 0.2), (t) => {
          phase += (2 * Math.PI * (50 + 90 * Math.exp(-t / 0.03))) / sampleRate;
          return level * (beat === 0 ? 0.9 : 0.7) * Math.sin(phase) * Math.exp(-t / 0.06);
        });
        if (part.groove === "full" && beatsPerBar === 4 && beat % 2 === 1) {
          add(at, Math.round(sampleRate * 0.2), (t) => {
            const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04);
            return level * 0.4 * (body + (rand() * 2 - 1) * Math.exp(-t / 0.05));
          });
        }
        for (const eighth of [0, 0.5]) {
          let prev = 0;
          add(at + eighth * beatSamples, Math.round(sampleRate * 0.06), (t) => {
            const white = rand() * 2 - 1;
            const hp = white - prev; // differencing: pushes the noise up the spectrum
            prev = white;
            return level * 0.25 * hp * Math.exp(-t / 0.015);
          });
        }
      }
    }
  }
  return out;
}
