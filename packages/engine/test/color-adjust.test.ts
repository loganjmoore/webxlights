import { describe, expect, it } from "vitest";
import { adjustChannel, adjustsAnything, applyColorAdjust, sparkleAt } from "../src/colorAdjust";
import { RenderBuffer } from "../src/renderBuffer";

function litBuffer(width: number, height: number, color = { r: 100, g: 100, b: 100, a: 255 }): RenderBuffer {
  const buffer = new RenderBuffer(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) buffer.setPixel(x, y, { ...color });
  return buffer;
}

describe("whether an adjustment does anything", () => {
  it("is false for nothing set, so an untouched effect skips the pass", () => {
    expect(adjustsAnything(undefined)).toBe(false);
    expect(adjustsAnything({})).toBe(false);
    expect(adjustsAnything({ sparkles: 0, brightness: 0, contrast: 0 })).toBe(false);
  });

  it("is true for any slider moved, including a negative brightness", () => {
    expect(adjustsAnything({ sparkles: 5 })).toBe(true);
    expect(adjustsAnything({ brightness: -30 })).toBe(true);
    expect(adjustsAnything({ contrast: 20 })).toBe(true);
  });
});

describe("brightness and contrast on a channel", () => {
  it("leaves a channel alone at zero", () => {
    expect(adjustChannel(100, 0, 0)).toBe(100);
  });

  it("brightens and dims", () => {
    expect(adjustChannel(100, 50, 0)).toBe(150);
    expect(adjustChannel(100, -50, 0)).toBe(50);
  });

  it("pushes contrast away from the middle in both directions", () => {
    expect(adjustChannel(200, 0, 25)).toBeGreaterThan(200);
    expect(adjustChannel(50, 0, 25)).toBeLessThan(50);
  });

  it("leaves mid-grey where it is, whatever the contrast", () => {
    expect(adjustChannel(128, 0, 100)).toBe(128);
  });

  it("never leaves the channel range", () => {
    expect(adjustChannel(250, 100, 100)).toBe(255);
    expect(adjustChannel(5, -100, 100)).toBe(0);
  });
});

describe("sparkles", () => {
  it("are off at zero", () => {
    for (let x = 0; x < 50; x++) expect(sparkleAt(x, 0, 0, 0)).toBe(false);
  });

  it("light more pixels as the slider goes up", () => {
    const countAt = (pct: number) => {
      let n = 0;
      for (let x = 0; x < 200; x++) for (let y = 0; y < 200; y++) if (sparkleAt(x, y, 0, pct)) n++;
      return n;
    };
    expect(countAt(50)).toBeGreaterThan(countAt(5));
    expect(countAt(5)).toBeGreaterThan(0);
  });

  it("are the same every time the same pixel and frame are asked about", () => {
    // The determinism rule the whole render engine turns on: an effect has to render identically
    // when scrubbed and when exported. A sparkle drawn from a random source would twinkle
    // differently in the exported file than it did on screen, and nobody would find out until the
    // show was running.
    for (let i = 0; i < 100; i++) {
      const x = i % 13;
      const y = (i * 7) % 11;
      expect(sparkleAt(x, y, 42, 30)).toBe(sparkleAt(x, y, 42, 30));
    }
  });

  it("move from frame to frame rather than sitting still", () => {
    const onFrame = (frame: number) => {
      const lit: string[] = [];
      for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) if (sparkleAt(x, y, frame, 30)) lit.push(`${x},${y}`);
      return lit.join("|");
    };
    expect(onFrame(0)).not.toBe(onFrame(1));
  });

  it("doesn't fall into rows or columns", () => {
    // A weak hash lights whole lines at once, which reads as a grid rather than as sparkle.
    const perRow = new Map<number, number>();
    for (let y = 0; y < 60; y++) {
      let n = 0;
      for (let x = 0; x < 60; x++) if (sparkleAt(x, y, 3, 40)) n++;
      perRow.set(y, n);
    }
    const counts = [...perRow.values()];
    expect(Math.max(...counts)).toBeLessThan(60);
  });
});

describe("applying the panel to a buffer", () => {
  it("brightens every lit pixel", () => {
    const buffer = litBuffer(4, 4);
    applyColorAdjust(buffer, { brightness: 50 }, 0);
    expect(buffer.getPixel(0, 0)).toEqual({ r: 150, g: 150, b: 150, a: 255 });
  });

  it("leaves unlit pixels dark", () => {
    // A sparkle on an unlit pixel would light one the effect deliberately left dark, which turns a
    // chase into a field of static.
    const buffer = new RenderBuffer(8, 8);
    applyColorAdjust(buffer, { sparkles: 100, brightness: 100 }, 0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(buffer.getPixel(x, y).a).toBe(0);
  });

  it("paints sparkles in the chosen colour", () => {
    const buffer = litBuffer(30, 30, { r: 10, g: 10, b: 10, a: 255 });
    applyColorAdjust(buffer, { sparkles: 60, sparkleColor: { r: 255, g: 0, b: 0 } }, 0);
    let reds = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (buffer.getPixel(x, y).r === 255) reds++;
    expect(reds).toBeGreaterThan(0);
  });

  it("keeps each pixel's own alpha, so a partly-revealed frame stays partly revealed", () => {
    const buffer = litBuffer(4, 4, { r: 100, g: 100, b: 100, a: 120 });
    applyColorAdjust(buffer, { brightness: 50, sparkles: 100 }, 0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(buffer.getPixel(x, y).a).toBe(120);
  });

  it("changes nothing when no slider has been moved", () => {
    const buffer = litBuffer(4, 4);
    applyColorAdjust(buffer, {}, 0);
    expect(buffer.getPixel(0, 0)).toEqual({ r: 100, g: 100, b: 100, a: 255 });
  });
});
