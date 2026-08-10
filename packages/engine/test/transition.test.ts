import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { applyFadeTransition } from "../src/transition";

describe("Fade transition (SPEC ch9 layer transitions)", () => {
  it("fades in from 0 alpha at effect start to full at the end of the in-duration", () => {
    const bufAtStart = new RenderBuffer(1, 1);
    bufAtStart.fill(rgba(255, 0, 0, 255));
    applyFadeTransition(bufAtStart, { startMs: 0, endMs: 1000 }, 0, { inDurationMs: 200 });
    expect(bufAtStart.getPixel(0, 0).a).toBe(0);

    const bufAfterFadeIn = new RenderBuffer(1, 1);
    bufAfterFadeIn.fill(rgba(255, 0, 0, 255));
    applyFadeTransition(bufAfterFadeIn, { startMs: 0, endMs: 1000 }, 200, { inDurationMs: 200 });
    expect(bufAfterFadeIn.getPixel(0, 0).a).toBe(255);
  });

  it("fades out toward the effect's end", () => {
    const bufBeforeFadeOut = new RenderBuffer(1, 1);
    bufBeforeFadeOut.fill(rgba(255, 0, 0, 255));
    applyFadeTransition(bufBeforeFadeOut, { startMs: 0, endMs: 1000 }, 700, { outDurationMs: 200 });
    expect(bufBeforeFadeOut.getPixel(0, 0).a).toBe(255);

    const bufAtEnd = new RenderBuffer(1, 1);
    bufAtEnd.fill(rgba(255, 0, 0, 255));
    applyFadeTransition(bufAtEnd, { startMs: 0, endMs: 1000 }, 1000, { outDurationMs: 200 });
    expect(bufAtEnd.getPixel(0, 0).a).toBe(0);
  });

  it("does nothing when no transition durations are set", () => {
    const buf = new RenderBuffer(1, 1);
    buf.fill(rgba(255, 0, 0, 255));
    applyFadeTransition(buf, { startMs: 0, endMs: 1000 }, 500, {});
    expect(buf.getPixel(0, 0)).toEqual(rgba(255, 0, 0, 255));
  });

  it("skips already-transparent pixels (nothing to fade)", () => {
    const buf = new RenderBuffer(1, 1); // default transparent
    applyFadeTransition(buf, { startMs: 0, endMs: 1000 }, 0, { inDurationMs: 200 });
    expect(buf.getPixel(0, 0).a).toBe(0);
  });
});
