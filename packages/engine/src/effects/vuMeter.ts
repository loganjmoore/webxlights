import type { RGBA } from "../color";
import { multiColorBlend, rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { bandsForNoteRange } from "../audio";
import { drawShape, type ShapeKind } from "./shape";
import { labelAt, type TimingLabel } from "../timing";
import { audioOf, type FrameContext } from "./types";

// SPEC ch8 "VU Meter": the audio-reactive effect family, and the largest single Type list in
// xLights. Everything it draws comes from the AudioFrame on the render context (audio.ts) - a
// per-frame level plus a log-spaced spectrum analysed once up front from the decoded track - or,
// for the timing-event types, from the marks on a timing track.
//
// The timing-event half was impossible until effects could read a timing track (timing.ts, added
// for the State and Piano effects). It is fourteen of the manual's types, and none of them needed
// anything from this file except the labels.

export type VuMeterType =
  // Spectrum
  | "Spectrogram"
  /**
   * What this app called Spectrogram before the manual's own name was adopted. Kept in the type
   * because sequences already say it and it still renders; kept out of the list below because it
   * shouldn't be offered as a choice any more.
   */
  | "Spectrum"
  | "Spectrogram Peak"
  | "Spectrogram Line"
  | "Volume Bars"
  | "Waveform"
  // Level
  | "On"
  | "Color On"
  | "Level Bar"
  | "Level Color"
  | "Level Pulse"
  | "Level Pulse Color"
  | "Level Jump"
  | "Level Jump 100"
  | "Intensity Wave"
  // Timing track
  | "Pulse"
  | "Timing Event Bar"
  | "Timing Event Bars"
  | "Timing Event Spike"
  | "Timing Event Sweep"
  | "Timing Event Sweep 2"
  | "Timing Event Timed Sweep"
  | "Timing Event Timed Sweep 2"
  | "Timing Event Alternate Timed Sweep"
  | "Timing Event Alternate Timed Sweep 2"
  | "Timing Event Color"
  | "Timing Event Pulse"
  | "Timing Event Pulse Color"
  | "Timing Event Jump"
  | "Timing Event Jump 100"
  // Note range
  | "Note On"
  | "Note Level Pulse"
  | "Note Level Bar"
  // The manual spells these two "Node", not "Note"; kept as written so a search of the manual
  // finds them, and they behave as the note types their descriptions describe.
  | "Node Level Jump"
  | "Node Level Jump 100"
  | "Frame Waveform"
  | "Dominant Frequency Colour"
  | "Dominant Frequency Colour Gradient"
  | "Level Shape";

export const VU_METER_TYPES: VuMeterType[] = [
  "Spectrogram",
  "Spectrogram Peak",
  "Spectrogram Line",
  "Volume Bars",
  "Waveform",
  "On",
  "Color On",
  "Level Bar",
  "Level Color",
  "Level Pulse",
  "Level Pulse Color",
  "Level Jump",
  "Level Jump 100",
  "Intensity Wave",
  "Pulse",
  "Timing Event Bar",
  "Timing Event Bars",
  "Timing Event Spike",
  "Timing Event Sweep",
  "Timing Event Sweep 2",
  "Timing Event Timed Sweep",
  "Timing Event Timed Sweep 2",
  "Timing Event Alternate Timed Sweep",
  "Timing Event Alternate Timed Sweep 2",
  "Timing Event Color",
  "Timing Event Pulse",
  "Timing Event Pulse Color",
  "Timing Event Jump",
  "Timing Event Jump 100",
  "Note On",
  "Note Level Pulse",
  "Note Level Bar",
  "Node Level Jump",
  "Node Level Jump 100",
  "Frame Waveform",
  "Dominant Frequency Colour",
  "Dominant Frequency Colour Gradient",
  "Level Shape",
];

/** Types that read a note range rather than the whole spectrum. */
export const NOTE_RANGE_VU_METER_TYPES = new Set<string>([
  "Note On",
  "Note Level Pulse",
  "Note Level Bar",
  "Node Level Jump",
  "Node Level Jump 100",
  "Dominant Frequency Colour",
  "Dominant Frequency Colour Gradient",
]);

/** Types driven by a timing track rather than by the audio - the props panel warns without one. */
export const TIMING_DRIVEN_VU_METER_TYPES = new Set<string>(
  VU_METER_TYPES.filter((t) => t.startsWith("Timing Event") || t === "Pulse"),
);

export interface VuMeterParams {
  type: VuMeterType;
  bars: number; // 1-32
  gainPct: number; // 0-300, multiplies the analysed level
  sensitivityPct: number; // 0-100, trigger threshold for the pulse and jump types
  /** "Defines the timing track from the sequence against which the effect will be generated." */
  timingTrack: string;
  /**
   * "Start and End Notes are used to set the frequency range" - MIDI note numbers, so 60 is C4.
   * Only the note types and the dominant-frequency types read them.
   */
  startNote: number;
  endNote: number;
  /** "Enabled when the Type attribute is 'Level Shape'." The Shape effect's own shapes. */
  shape: ShapeKind;
  /** "Filled or Unfilled." */
  shapeFilled: boolean;
}

/** How long a jump or pulse takes to fade back to nothing. */
const DECAY_MS = 400;

export function renderVuMeter(buffer: RenderBuffer, palette: RGBA[], params: VuMeterParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W === 0 || H === 0) return;

  const type = params.type;
  const cells = ctx.data?.timing ?? [];
  const timingDriven = TIMING_DRIVEN_VU_METER_TYPES.has(type);

  // No analysed track at all (no audio loaded for the sequence) renders nothing, rather than
  // the "zero level" appearance - a solid bottom-of-palette wash reads as a bug, not as silence.
  // The timing-event types don't need audio at all, and shouldn't be held back by its absence.
  if (!ctx.audio && !timingDriven) return;
  if (timingDriven && cells.length === 0) return;

  const audio = audioOf(ctx);
  const gain = Math.max(0, params.gainPct) / 100;
  const level = Math.min(1, audio.level * gain);
  const bars = Math.max(1, Math.round(params.bars));
  const threshold = Math.max(0, Math.min(1, params.sensitivityPct / 100));
  const atMs = ctx.clock?.atMs ?? 0;

  const swatch = (i: number): RGBA => palette[i % Math.max(1, palette.length)] ?? rgba(255, 255, 255);

  if (timingDriven) {
    renderTimingEvent(buffer, palette, params, cells, atMs, level);
    return;
  }

  switch (type) {
    case "Spectrogram Peak": {
      // "same as Spectrogram but uses last color pallet option to draw a peak line"
      drawBars(buffer, palette, bars, (b) => Math.min(1, bandValue(audio.bands, b, bars) * gain));
      const peak = palette[palette.length - 1] ?? rgba(255, 255, 255);
      const barWidth = W / bars;
      for (let b = 0; b < bars; b++) {
        const y = Math.min(H - 1, Math.round(Math.min(1, bandValue(audio.bands, b, bars) * gain) * (H - 1)));
        for (let x = Math.floor(b * barWidth); x < Math.max(Math.floor(b * barWidth) + 1, Math.floor((b + 1) * barWidth)) && x < W; x++) {
          buffer.setPixel(x, y, peak);
        }
      }
      break;
    }

    case "Spectrogram Line": {
      // "line that represents the audios frequencies levels" - the tops of the bars and nothing
      // underneath, so it reads over whatever is on the layer below.
      for (let x = 0; x < W; x++) {
        const v = Math.min(1, bandValue(audio.bands, Math.floor((x / Math.max(1, W)) * bars), bars) * gain);
        buffer.setPixel(x, Math.min(H - 1, Math.round(v * (H - 1))), multiColorBlend(palette, v, false));
      }
      break;
    }

    case "Volume Bars":
      drawBars(buffer, palette, bars, () => level);
      break;

    case "On": {
      // "will show brightness equivalent to the volume of music"
      buffer.fill({ ...swatch(0), a: Math.round(255 * level) });
      break;
    }

    case "Color On":
      // "will change color (from the palette) as the intensity of the music increases"
      buffer.fill(multiColorBlend(palette, level, false));
      break;

    case "Level Bar": {
      const top = Math.round(level * H);
      for (let y = 0; y < top; y++) {
        const color = multiColorBlend(palette, H > 1 ? y / (H - 1) : 0, false);
        for (let x = 0; x < W; x++) buffer.setPixel(x, y, color);
      }
      break;
    }

    case "Level Pulse": {
      if (level < threshold) return;
      buffer.fill({ ...swatch(0), a: Math.round(255 * level) });
      break;
    }

    case "Level Pulse Color": {
      // "pulses when the audio gets above a certain level and changes colors with each pulse"
      if (level < threshold) return;
      buffer.fill({ ...swatch(countCrossings(ctx, atMs, threshold, gain)), a: Math.round(255 * level) });
      break;
    }

    case "Level Jump":
    case "Level Jump 100": {
      // "The effect will jump to the audio level when the sensitivity level is crossed" - and
      // then fall back, which is the whole character of it. The fall is measured from the last
      // crossing rather than kept as state, so a scrub and an export agree.
      const since = msSinceCrossing(ctx, atMs, threshold, gain);
      if (since === null) return;
      const decay = Math.max(0, 1 - since / DECAY_MS);
      const height = (type === "Level Jump 100" ? 1 : levelAt(ctx, atMs - since, gain)) * decay;
      drawBars(buffer, palette, bars, () => height);
      break;
    }

    case "Level Color":
      buffer.fill(multiColorBlend(palette, level, false));
      break;

    case "Intensity Wave": {
      // brightness follows the level; a travelling sine gives it spatial shape
      const color = swatch(0);
      for (let x = 0; x < W; x++) {
        const wave = 0.5 + 0.5 * Math.sin((x / Math.max(1, W)) * 4 * Math.PI + ctx.positionInEffect01 * 20);
        const alpha = Math.round(255 * level * wave);
        if (alpha <= 0) continue;
        for (let y = 0; y < H; y++) buffer.setPixel(x, y, { ...color, a: alpha });
      }
      break;
    }

    case "Waveform": {
      // spectrum drawn as a centred waveform rather than bars from the floor
      const mid = (H - 1) / 2;
      for (let x = 0; x < W; x++) {
        const v = Math.min(1, bandValue(audio.bands, Math.floor((x / Math.max(1, W)) * bars), bars) * gain);
        const half = v * mid;
        const color = multiColorBlend(palette, v, false);
        for (let y = Math.round(mid - half); y <= Math.round(mid + half); y++) buffer.setPixel(x, y, color);
      }
      break;
    }

    case "Level Shape": {
      // "display the selected shape with a size that adjusts based on the audio level" - drawn
      // by the Shape effect's own geometry rather than a second set, so the two can't disagree
      // about what a candy cane looks like.
      const size = (Math.min(W, H) / 2) * level;
      if (size < 1) return;
      drawShape(buffer, params.shape, (W - 1) / 2, (H - 1) / 2, size, 1, swatch(0), {
        filled: params.shapeFilled,
      });
      break;
    }

    case "Frame Waveform": {
      // "Displays the audio waveform only using the current frame of audio" - the wave itself,
      // from the envelope the analysis keeps per frame (audio.ts), rather than the frame's level
      // drawn as a symmetrical band. A wave is asymmetric, and that asymmetry is most of what
      // makes it look like audio rather than a bar.
      const envelope = audio.waveform;
      const mid = (H - 1) / 2;
      if (!envelope || envelope.length < 2) {
        // No envelope (a hand-built series, or audio analysed before this was kept): the level is
        // the honest fallback, and it still moves with the track.
        const half = level * mid;
        const color = multiColorBlend(palette, level, false);
        for (let x = 0; x < W; x++) {
          for (let y = Math.round(mid - half); y <= Math.round(mid + half); y++) buffer.setPixel(x, y, color);
        }
        break;
      }

      const buckets = Math.floor(envelope.length / 2);
      for (let x = 0; x < W; x++) {
        const b = Math.min(buckets - 1, Math.floor((x / Math.max(1, W)) * buckets));
        const lo = Math.max(-1, Math.min(1, (envelope[b * 2] ?? 0) * gain));
        const hi = Math.max(-1, Math.min(1, (envelope[b * 2 + 1] ?? 0) * gain));
        const yLo = Math.round(mid + lo * mid);
        const yHi = Math.round(mid + hi * mid);
        const color = multiColorBlend(palette, Math.min(1, Math.max(Math.abs(lo), Math.abs(hi))), false);
        for (let y = Math.min(yLo, yHi); y <= Math.max(yLo, yHi); y++) buffer.setPixel(x, y, color);
      }
      break;
    }

    case "Note On":
    case "Note Level Pulse":
    case "Note Level Bar":
    case "Node Level Jump":
    case "Node Level Jump 100":
    case "Dominant Frequency Colour":
    case "Dominant Frequency Colour Gradient": {
      renderNoteRange(buffer, palette, params, ctx, gain, threshold);
      break;
    }

    // "Spectrogram", and the "Spectrum" this app called it before the manual's name was adopted:
    // sequences already say that, so it still renders rather than becoming an unknown type.
    default:
      drawBars(buffer, palette, bars, (b) => Math.min(1, bandValue(audio.bands, b, bars) * gain));
      break;
  }
}

/**
 * The types given a *note range* rather than the whole spectrum.
 *
 * A note is a frequency and a band is a range of frequencies, so the range has to be resolved
 * against the layout the analysis chose (audio.ts). Where that layout isn't recorded - a series
 * built before it was, or a test fixture - these render nothing rather than quietly widening to
 * the whole spectrum, which would look like they were working.
 */
function renderNoteRange(
  buffer: RenderBuffer,
  palette: RGBA[],
  params: VuMeterParams,
  ctx: FrameContext,
  gain: number,
  threshold: number,
): void {
  const { width: W, height: H } = buffer;
  const series = ctx.audioBandEdgesHz ? { frameMs: 0, bandCount: 0, frames: [], bandEdgesHz: [...ctx.audioBandEdgesHz] } : undefined;
  const range = bandsForNoteRange(series, params.startNote, params.endNote);
  if (!range) return;

  const [from, to] = range;
  const bands = audioOf(ctx).bands;
  const inRange = bands.slice(from, to);
  if (inRange.length === 0) return;

  const noteLevel = Math.min(1, (inRange.reduce((a, b) => a + b, 0) / inRange.length) * gain);
  const swatch = (i: number): RGBA => palette[i % Math.max(1, palette.length)] ?? rgba(255, 255, 255);

  switch (params.type) {
    case "Note On":
      // "will show brightness based on the note range intensity"
      buffer.fill({ ...swatch(0), a: Math.round(255 * noteLevel) });
      break;

    case "Note Level Pulse": {
      // "will turn on a color when the note range crosses the sensitivity level and then quickly
      // fade out"
      if (noteLevel < threshold) return;
      buffer.fill({ ...swatch(0), a: Math.round(255 * noteLevel) });
      break;
    }

    case "Note Level Bar": {
      // "Sweeps a vertical bar across when the note range crosses the sensitivity." The sweep is
      // driven by how far past the threshold the range is, so a louder passage sweeps further.
      if (noteLevel < threshold) return;
      const span = Math.max(0.0001, 1 - threshold);
      const x = Math.min(W - 1, Math.round(((noteLevel - threshold) / span) * (W - 1)));
      for (let y = 0; y < H; y++) buffer.setPixel(x, y, swatch(0));
      break;
    }

    case "Node Level Jump":
    case "Node Level Jump 100": {
      if (noteLevel < threshold) return;
      drawBars(buffer, palette, Math.max(1, Math.round(params.bars)), () =>
        params.type === "Node Level Jump 100" ? 1 : noteLevel,
      );
      break;
    }

    case "Dominant Frequency Colour":
    case "Dominant Frequency Colour Gradient": {
      // "chooses the colour based on the dominant frequency" - the loudest band inside the range,
      // placed across the palette by where it sits in that range.
      let best = 0;
      let bestValue = -1;
      inRange.forEach((v, i) => {
        if (v > bestValue) {
          bestValue = v;
          best = i;
        }
      });
      if (bestValue <= 0) return;
      const position = inRange.length > 1 ? best / (inRange.length - 1) : 0;
      const color =
        params.type === "Dominant Frequency Colour Gradient"
          ? multiColorBlend(palette, position, false)
          : swatch(Math.round(position * Math.max(0, palette.length - 1)));
      buffer.fill(color);
      break;
    }

    default:
      break;
  }
}

/** The timing-mark-driven half. Split out because it shares one set of facts about the marks. */
function renderTimingEvent(
  buffer: RenderBuffer,
  palette: RGBA[],
  params: VuMeterParams,
  cells: readonly TimingLabel[],
  atMs: number,
  level: number,
): void {
  const { width: W, height: H } = buffer;
  const index = cellIndexAt(cells, atMs);
  if (index < 0) return; // between marks: nothing is happening
  const cell = cells[index]!;
  const swatch = (i: number): RGBA => palette[i % Math.max(1, palette.length)] ?? rgba(255, 255, 255);

  const sinceMark = atMs - cell.startMs;
  const through = cell.endMs > cell.startMs ? Math.min(1, sinceMark / (cell.endMs - cell.startMs)) : 0;
  const bars = Math.max(1, Math.round(params.bars));
  const barWidth = Math.max(1, Math.round(W / bars));

  const column = (x0: number, color: RGBA, width = barWidth): void => {
    for (let x = Math.round(x0); x < Math.round(x0) + width && x < W; x++) {
      if (x < 0) continue;
      for (let y = 0; y < H; y++) buffer.setPixel(x, y, color);
    }
  };

  switch (params.type) {
    case "Timing Event Bar":
      // "Scrolls a vertical bar across with each timing mark" - one step per mark.
      column((index % bars) * barWidth, swatch(index));
      break;

    case "Timing Event Bars":
      // "Display multiple bars that shift with each timing mark."
      for (let b = 0; b <= index % bars; b++) column(b * barWidth, swatch(b));
      break;

    case "Timing Event Spike":
      // "Sweeps a vertical bar across with each timing mark. Single Color."
      column(through * (W - barWidth), swatch(0));
      break;

    case "Timing Event Sweep":
      // "...Blends All the color pallet options."
      column(through * (W - barWidth), multiColorBlend(palette, through, false));
      break;

    case "Timing Event Sweep 2": {
      // "...Sliced bar based by the color pallet options."
      const x0 = through * (W - barWidth);
      for (let i = 0; i < barWidth; i++) column(x0 + i, swatch(i), 1);
      break;
    }

    case "Timing Event Timed Sweep":
    case "Timing Event Timed Sweep 2":
    case "Timing Event Alternate Timed Sweep":
    case "Timing Event Alternate Timed Sweep 2": {
      // "Speed is based on timing mark spacing" - the sweep crosses in exactly one cell, so a
      // fast passage sweeps fast. The alternating pair "bounce back and forth", which is the same
      // sweep with its direction taken from whether the mark is odd or even.
      const alternate = params.type.startsWith("Timing Event Alternate");
      const backwards = alternate && index % 2 === 1;
      const position = backwards ? 1 - through : through;
      const x0 = position * (W - barWidth);
      if (params.type.endsWith("2")) {
        for (let i = 0; i < barWidth; i++) column(x0 + i, swatch(i), 1);
      } else {
        column(x0, multiColorBlend(palette, position, false));
      }
      break;
    }

    case "Timing Event Color":
      // "will change color (from the palette) triggered on the timing of the Timing Track"
      buffer.fill(swatch(index));
      break;

    case "Pulse":
    case "Timing Event Pulse":
    case "Timing Event Pulse Color": {
      // "Fade In and Out a Color based on the timing marks."
      const fade = Math.max(0, 1 - sinceMark / DECAY_MS);
      if (fade <= 0) return;
      const color = params.type === "Timing Event Pulse Color" ? swatch(index) : swatch(0);
      buffer.fill({ ...color, a: Math.round(255 * fade) });
      break;
    }

    case "Timing Event Jump":
    case "Timing Event Jump 100": {
      // "will cause a jump at each event... based on the audio level", or to the full height.
      const decay = Math.max(0, 1 - sinceMark / DECAY_MS);
      const height = (params.type === "Timing Event Jump 100" ? 1 : level) * decay;
      drawBars(buffer, palette, bars, () => height);
      break;
    }

    default:
      break;
  }
}

/** Which timing cell contains a moment, or -1 between them. */
function cellIndexAt(cells: readonly TimingLabel[], atMs: number): number {
  const cell = labelAt(cells, atMs);
  return cell ? cells.indexOf(cell) : -1;
}

function levelAt(ctx: FrameContext, atMs: number, gain: number): number {
  const frame = ctx.audioAt?.(atMs) ?? ctx.audio;
  return Math.min(1, (frame?.level ?? 0) * gain);
}

/**
 * How long since the level last crossed the threshold from below, or null if it hasn't recently.
 *
 * Looked up rather than remembered: an effect that kept "when did it last fire" as state would
 * give a different answer when scrubbed than when exported, and the two paths have to agree.
 */
function msSinceCrossing(ctx: FrameContext, atMs: number, threshold: number, gain: number): number | null {
  if (!ctx.audioAt || !ctx.clock) return levelAt(ctx, atMs, gain) >= threshold ? 0 : null;
  const step = Math.max(1, ctx.clock.frameMs);
  for (let back = 0; back <= DECAY_MS; back += step) {
    const now = levelAt(ctx, atMs - back, gain);
    const before = levelAt(ctx, atMs - back - step, gain);
    if (now >= threshold && before < threshold) return back;
  }
  return null;
}

/** How many times the level has crossed the threshold - what "changes colour each pulse" counts. */
function countCrossings(ctx: FrameContext, atMs: number, threshold: number, gain: number): number {
  if (!ctx.audioAt || !ctx.clock) return 0;
  const step = Math.max(1, ctx.clock.frameMs);
  let crossings = 0;
  for (let t = ctx.clock.startMs + step; t <= atMs; t += step) {
    if (levelAt(ctx, t, gain) >= threshold && levelAt(ctx, t - step, gain) < threshold) crossings++;
  }
  return crossings;
}

// Resample the analysed band array onto the requested bar count.
function bandValue(bands: number[], bar: number, bars: number): number {
  if (bands.length === 0) return 0;
  const idx = Math.min(bands.length - 1, Math.floor((bar / Math.max(1, bars)) * bands.length));
  return bands[Math.max(0, idx)]!;
}

function drawBars(buffer: RenderBuffer, palette: RGBA[], bars: number, heightOf: (bar: number) => number): void {
  const { width: W, height: H } = buffer;
  const barWidth = W / bars;
  for (let b = 0; b < bars; b++) {
    const top = Math.round(heightOf(b) * H);
    if (top <= 0) continue;
    const x0 = Math.floor(b * barWidth);
    const x1 = Math.max(x0 + 1, Math.floor((b + 1) * barWidth));
    const color = multiColorBlend(palette, bars > 1 ? b / (bars - 1) : 0, false);
    for (let x = x0; x < x1 && x < W; x++) {
      for (let y = 0; y < top && y < H; y++) buffer.setPixel(x, y, color);
    }
  }
}
