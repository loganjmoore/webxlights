import type { RenderBuffer } from "./renderBuffer";

// The rest of the Colour panel (manual: Sequencer > Changing An Effect > Changing Color Settings).
//
// "From the Color window, you can change the Colors that apply to the effect, as well as the
// Sparkles, Brightness and Contrast values." / "Use the Sparkles slider to increase the sparkles
// for the effect." / "The Sparkles color can be changed with the color picker on the right side."
// / "Use the Brightness slider to increase or decrease the brightness of the effect."
//
// Three controls that apply to *every* effect, which is why they live beside the palette rather
// than in any effect's own parameters - the same reasoning as the layer settings.
//
// Applied after the effect has drawn and before the transition reveals it, so a fade in fades what
// the sliders produced rather than the sliders brightening a partly-revealed frame back up.

export interface ColorAdjust {
  /** 0-100. How many pixels twinkle. */
  sparkles?: number;
  /** The sparkle colour ("can be changed with the color picker on the right side"). White default. */
  sparkleColor?: { r: number; g: number; b: number };
  /** -100..100, 0 being untouched. */
  brightness?: number;
  /** 0-100, 0 being untouched. */
  contrast?: number;
}

/** Whether an adjustment would change anything, so an untouched effect skips the whole pass. */
export function adjustsAnything(adjust: ColorAdjust | undefined): boolean {
  if (!adjust) return false;
  return (adjust.sparkles ?? 0) > 0 || (adjust.brightness ?? 0) !== 0 || (adjust.contrast ?? 0) > 0;
}

/**
 * Whether a pixel sparkles on a given frame.
 *
 * Deterministic in (x, y, frame) rather than drawn from a random source, and that is the whole of
 * the design. An effect must render identically when scrubbed and when exported, so a sparkle that
 * remembered a seed - or asked for a random number - would twinkle differently in the file than it
 * did on screen, and nobody would find out until the show was running.
 *
 * A cheap integer hash: mixed enough that the lit pixels don't fall into visible rows or diagonals,
 * and stable enough that the same pixel on the same frame always gives the same answer.
 */
export function sparkleAt(x: number, y: number, frame: number, sparklesPct: number): boolean {
  if (sparklesPct <= 0) return false;
  let h = (x * 374761393 + y * 668265263 + frame * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  // The percentage is the share of pixels lit at any moment. Scaled down: at 100 every pixel would
  // be white every frame, which is a white rectangle rather than sparkles - xLights' slider is a
  // density, not a fraction of the whole.
  return h % 1000 < Math.min(100, sparklesPct) * 3;
}

/** Brightness and contrast on one channel, in 0-255. */
export function adjustChannel(value: number, brightness: number, contrast: number): number {
  // Contrast first, so brightening a flattened image doesn't get flattened again afterwards.
  let v = value;
  if (contrast > 0) {
    // Pushed away from mid-grey. At 100 the channel goes fully to one end or the other, which is
    // what the slider's top means.
    const factor = 1 + contrast / 25;
    v = 128 + (v - 128) * factor;
  }
  if (brightness !== 0) v *= 1 + brightness / 100;
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Applies the panel's three sliders to a rendered buffer.
 *
 * `frame` is the frame number rather than a time, so the sparkle pattern advances once per frame
 * however the buffer is being rendered - scrubbing at 200fps and exporting at 20fps would
 * otherwise twinkle at different rates.
 */
export function applyColorAdjust(buffer: RenderBuffer, adjust: ColorAdjust | undefined, frame: number): void {
  if (!adjustsAnything(adjust)) return;
  const sparkles = adjust!.sparkles ?? 0;
  const brightness = adjust!.brightness ?? 0;
  const contrast = adjust!.contrast ?? 0;
  const sparkleColor = adjust!.sparkleColor ?? { r: 255, g: 255, b: 255 };

  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const pixel = buffer.getPixel(x, y);
      // Sparkles land on lit pixels only. A sparkle on an unlit one would light a pixel the effect
      // deliberately left dark, which turns a chase into a field of static.
      if (pixel.a === 0) continue;

      if (brightness !== 0 || contrast > 0) {
        buffer.setPixel(x, y, {
          r: adjustChannel(pixel.r, brightness, contrast),
          g: adjustChannel(pixel.g, brightness, contrast),
          b: adjustChannel(pixel.b, brightness, contrast),
          a: pixel.a,
        });
      }

      if (sparkleAt(x, y, frame, sparkles)) {
        buffer.setPixel(x, y, { r: sparkleColor.r, g: sparkleColor.g, b: sparkleColor.b, a: pixel.a });
      }
    }
  }
}
