import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { RenderBuffer } from "../src/renderBuffer";
import { renderMorph, type MorphParams } from "../src/effects/morph";
import { defaultParamsFor } from "../src/effects/schema";

const RED = rgba(255, 0, 0, 255);
const BLUE = rgba(0, 0, 255, 255);

function params(overrides: Partial<MorphParams> = {}): MorphParams {
  return { ...(defaultParamsFor("Morph") as unknown as MorphParams), ...overrides };
}

function render(p: MorphParams, position01: number, palette = [RED, BLUE], size = 16): RenderBuffer {
  const b = new RenderBuffer(size, size);
  renderMorph(b, palette, p, { frameIndexInEffect: Math.round(position01 * 20), positionInEffect01: position01, seed: 1 });
  return b;
}

function litCount(b: RenderBuffer): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}

function topmostLitRow(b: RenderBuffer): number {
  for (let y = b.height - 1; y >= 0; y--) for (let x = 0; x < b.width; x++) if (b.getPixel(x, y).a > 0) return y;
  return -1;
}

describe("Morph (manual: a movement across a model with a head and a tail)", () => {
  it("sweeps: the ground it has covered grows as the effect runs", () => {
    const p = params();
    const early = litCount(render(p, 0.2));
    const late = litCount(render(p, 0.9));
    expect(late).toBeGreaterThan(early);
  });

  it("travels from the start line to the end line", () => {
    // Defaults run bottom (y=0) to top (y=100), so the leading edge climbs the model.
    const p = params();
    expect(topmostLitRow(render(p, 0.9))).toBeGreaterThan(topmostLitRow(render(p, 0.3)));
  });

  it("swapping start and end reverses the direction of travel", () => {
    const forward = render(params(), 0.3);
    const swapped = render(params({ swapStartEnd: true }), 0.3);
    // Forward starts at the bottom and has barely climbed; swapped starts at the top, so its
    // covered ground reaches much higher at the same moment.
    expect(topmostLitRow(swapped)).toBeGreaterThan(topmostLitRow(forward));
  });

  it("paints the head in the first palette colour and the tail behind it in the second", () => {
    const b = render(params({ headLength: 20 }), 0.9);
    const head = topmostLitRow(b);
    expect(b.getPixel(0, head)).toEqual(RED);
    // Behind it, the body is the second colour - "two colors apply the first to the head and
    // second to the tail".
    expect(b.getPixel(0, 0)).toEqual(BLUE);
  });

  it("Head Duration ends the head, after which the leading edge joins the body colours", () => {
    // "Defines how long the head will show during the morph before it changes to the body
    // colors" - at 10%, by the time the morph is 90% through there is no head left.
    const b = render(params({ headLength: 20, headDuration: 10 }), 0.9);
    const head = topmostLitRow(b);
    expect(b.getPixel(0, head)).toEqual(BLUE);
  });

  it("spreads three or more colours across the tail rather than banding them", () => {
    const GREEN = rgba(0, 255, 0, 255);
    const b = render(params({ headLength: 5 }), 0.95, [RED, BLUE, GREEN]);
    // Blue at the near end of the tail, green at the far end, and a mix in between - which a
    // palette split into hard bands would never produce.
    const middle = b.getPixel(0, Math.floor(topmostLitRow(b) / 2));
    expect(middle.g).toBeGreaterThan(0);
    expect(middle.b).toBeGreaterThan(0);
  });

  it("a single colour is used for the whole morph", () => {
    const b = render(params(), 0.8, [RED]);
    for (let y = 0; y <= topmostLitRow(b); y++) {
      const p = b.getPixel(0, y);
      if (p.a > 0) expect(p).toEqual(RED);
    }
  });

  it("acceleration makes the movement non-linear rather than only faster or slower", () => {
    // Positive acceleration starts slow, so at the halfway mark it has covered less ground than
    // a constant-speed morph; negative starts fast and has covered more. A change that only
    // scaled the speed couldn't do both.
    const middle = (accel: number) => litCount(render(params({ acceleration: accel }), 0.5));
    expect(middle(6)).toBeLessThan(middle(0));
    expect(middle(-6)).toBeGreaterThan(middle(0));
  });

  it("Repeat Count runs the whole morph again inside the effect", () => {
    const twice = params({ repeatCount: 2 });
    // Just past halfway the second run has only just begun, so it has covered less ground than
    // a single run has by the same point.
    expect(litCount(render(twice, 0.55))).toBeLessThan(litCount(render(params(), 0.55)));
    // ...and it still finishes covered, so the repeat completes rather than being cut off.
    expect(litCount(render(twice, 0.99))).toBeGreaterThan(litCount(render(twice, 0.55)));
  });

  it("Repeat Skip steps each repeat along the model", () => {
    const skipped = render(params({ repeatCount: 2, repeatSkip: 4 }), 0.55);
    const notSkipped = render(params({ repeatCount: 2, repeatSkip: 0 }), 0.55);
    let differs = false;
    for (let y = 0; y < skipped.height && !differs; y++) {
      for (let x = 0; x < skipped.width; x++) {
        if (skipped.getPixel(x, y).a !== notSkipped.getPixel(x, y).a) {
          differs = true;
          break;
        }
      }
    }
    expect(differs).toBe(true);
  });

  it("Stagger makes the morph arrive at one end of the line before the other", () => {
    const b = render(params({ stagger: 4 }), 0.4);
    // The near end of the line has been swept and the far end has not, so the covered ground is
    // lopsided - which an un-staggered morph's covered ground never is.
    const leftLit = countColumn(b, 0);
    const rightLit = countColumn(b, b.width - 1);
    expect(leftLit).not.toBe(rightLit);

    const even = render(params({ stagger: 0 }), 0.4);
    expect(countColumn(even, 0)).toBe(countColumn(even, even.width - 1));
  });

  it("Show Head at Start draws the head before the movement begins", () => {
    expect(litCount(render(params({ showHeadAtStart: true }), 0))).toBeGreaterThan(0);
  });

  it("renders nothing into a buffer with no size, rather than throwing", () => {
    expect(() => renderMorph(new RenderBuffer(0, 0), [RED], params(), { frameIndexInEffect: 0, positionInEffect01: 0.5, seed: 1 })).not.toThrow();
  });
});

function countColumn(b: RenderBuffer, x: number): number {
  let n = 0;
  for (let y = 0; y < b.height; y++) if (b.getPixel(x, y).a > 0) n++;
  return n;
}
