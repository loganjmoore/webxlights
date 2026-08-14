import type { RGBA } from "../color";

// How many bytes a model puts on the wire per node, and which of a rendered pixel's channels
// those bytes come from.
//
// Almost every model is three bytes a node - an RGB pixel. A **Channel Block** isn't: the manual
// describes it as a way to "model generic channel to be used or AC Lights, relays, smoke
// machines", where each channel drives one device. One device, one byte.
//
// Getting that wrong isn't cosmetic. A 24-channel relay board exported at three bytes a channel
// claims 72 channels, so every model after it on the controller is shifted by 48 - which lights
// the wrong props, and does it silently.

export type ChannelColor = "White" | "Red" | "Green" | "Blue";

export const CHANNEL_COLORS: ChannelColor[] = ["White", "Red", "Green", "Blue"];

/** Bytes on the wire per node, for a model of this DisplayAs. */
export function channelsPerNodeFor(displayAs: string): number {
  return displayAs === "Channel Block" ? 1 : 3;
}

/**
 * The value a single-channel output takes from a rendered pixel.
 *
 * The manual's own rule: "if set to 'White' all three RGB channel values will be use to set the
 * output channel value. If set to 'Red' only the Red channel values will be use."
 *
 * White takes the brightest of the three rather than their average, because the sequencer shows
 * these channels lit by whatever effect is on them - and an effect drawn in pure red would come
 * out at a third power under an average, which reads as a relay that never quite closes.
 */
export function singleChannelValue(color: RGBA, channelColor: ChannelColor): number {
  const value =
    channelColor === "Red" ? color.r : channelColor === "Green" ? color.g : channelColor === "Blue" ? color.b : Math.max(color.r, color.g, color.b);
  // Alpha is coverage, not brightness, but a transparent pixel means "this effect isn't lighting
  // this node" - so it has to reach the wire as off rather than as whatever colour was underneath.
  return Math.round((value * color.a) / 255);
}

/**
 * Turns rendered node colours into the bytes a Channel Block puts on the wire: one per channel.
 *
 * `channelColors` is per channel and may be shorter than the node list - xLights' "Indiv Colors"
 * only names the ones that differ - so anything unnamed takes the model's default.
 */
export function channelBlockBytes(colors: RGBA[], channelColors: ChannelColor[] = [], fallback: ChannelColor = "White"): Uint8Array {
  const bytes = new Uint8Array(colors.length);
  colors.forEach((color, i) => {
    bytes[i] = singleChannelValue(color, channelColors[i] ?? fallback);
  });
  return bytes;
}

/** Reads the per-channel colour list a model stores, tolerating a bag that has none. */
export function channelColorsFrom(attrs: Record<string, string> | null | undefined): ChannelColor[] {
  const raw = (attrs ?? {})["ChannelColors"] ?? "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (CHANNEL_COLORS.find((c) => c.toLowerCase() === part.toLowerCase()) ?? "White") as ChannelColor);
}

export function defaultChannelColorFrom(attrs: Record<string, string> | null | undefined): ChannelColor {
  const raw = ((attrs ?? {})["ChannelColor"] ?? "White").trim();
  return CHANNEL_COLORS.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? "White";
}
