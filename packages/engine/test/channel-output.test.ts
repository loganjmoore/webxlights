import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import {
  CHANNEL_COLORS,
  channelBlockBytes,
  channelColorsFrom,
  channelsPerNodeFor,
  defaultChannelColorFrom,
  singleChannelValue,
} from "../src/models/channelOutput";

describe("how many bytes a model puts on the wire per node", () => {
  it("gives a Channel Block one byte a channel, and everything else three", () => {
    // A 24-channel relay board exported at three bytes a channel claims 72, so every model after
    // it on the controller is shifted by 48 - which lights the wrong props, silently.
    expect(channelsPerNodeFor("Channel Block")).toBe(1);
    expect(channelsPerNodeFor("Matrix")).toBe(3);
    expect(channelsPerNodeFor("Tree")).toBe(3);
  });
});

describe("what a single-channel output takes from a pixel", () => {
  it("takes only the named channel", () => {
    // "If set to 'Red' only the Red channel values will be use to set the output channel value."
    const purple = rgba(200, 0, 120, 255);
    expect(singleChannelValue(purple, "Red")).toBe(200);
    expect(singleChannelValue(purple, "Green")).toBe(0);
    expect(singleChannelValue(purple, "Blue")).toBe(120);
  });

  it("takes the brightest of the three for White, not their average", () => {
    // "If set to 'White' all three RGB channel values will be use." An average would put a pure
    // red effect out at a third power, which reads as a relay that never quite closes.
    expect(singleChannelValue(rgba(255, 0, 0, 255), "White")).toBe(255);
    expect(singleChannelValue(rgba(255, 255, 255, 255), "White")).toBe(255);
    expect(singleChannelValue(rgba(90, 30, 10, 255), "White")).toBe(90);
  });

  it("treats a transparent pixel as off", () => {
    // Alpha is coverage rather than brightness, but a transparent pixel means no effect is
    // lighting this node - so it has to reach the wire as off.
    expect(singleChannelValue(rgba(255, 255, 255, 0), "White")).toBe(0);
    expect(singleChannelValue(rgba(255, 0, 0, 128), "Red")).toBe(128);
  });
});

describe("a channel block's bytes", () => {
  it("emits one byte per node, in node order", () => {
    const bytes = channelBlockBytes([rgba(255, 0, 0, 255), rgba(0, 0, 0, 255), rgba(0, 128, 0, 255)]);
    expect(bytes).toHaveLength(3);
    expect([...bytes]).toEqual([255, 0, 128]);
  });

  it("uses each channel's own colour where one is named", () => {
    const purple = rgba(200, 0, 120, 255);
    expect([...channelBlockBytes([purple, purple], ["Red", "Blue"])]).toEqual([200, 120]);
  });

  it("falls back to the model's default for channels with no colour of their own", () => {
    // xLights' "Indiv Colors" only names the ones that differ, so the list is routinely shorter
    // than the channel count.
    const purple = rgba(200, 0, 120, 255);
    expect([...channelBlockBytes([purple, purple, purple], ["Blue"], "Red")]).toEqual([120, 200, 200]);
  });

  it("copes with no channels at all", () => {
    expect(channelBlockBytes([])).toHaveLength(0);
  });
});

describe("reading the colours off a model's attributes", () => {
  it("reads a list, whatever case it was written in", () => {
    expect(channelColorsFrom({ ChannelColors: "Red, green ,BLUE" })).toEqual(["Red", "Green", "Blue"]);
  });

  it("treats an unknown colour as White rather than dropping the channel", () => {
    // Dropping it would shift every channel after it along by one, which is the same silent
    // mis-addressing this whole module exists to avoid.
    expect(channelColorsFrom({ ChannelColors: "Red,Chartreuse,Blue" })).toEqual(["Red", "White", "Blue"]);
  });

  it("returns nothing for a model that names none", () => {
    expect(channelColorsFrom({})).toEqual([]);
    expect(channelColorsFrom(null)).toEqual([]);
  });

  it("reads the model-wide default, defaulting to White", () => {
    expect(defaultChannelColorFrom({ ChannelColor: "Green" })).toBe("Green");
    expect(defaultChannelColorFrom({ ChannelColor: "nonsense" })).toBe("White");
    expect(defaultChannelColorFrom(undefined)).toBe("White");
  });

  it("knows the four colours xLights offers", () => {
    expect(CHANNEL_COLORS).toEqual(["White", "Red", "Green", "Blue"]);
  });
});
