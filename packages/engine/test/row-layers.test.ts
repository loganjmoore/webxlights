import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { MAX_LAYERS } from "../src/layerStack";
import { createRowSequencer, renderRowAtMs, type RenderableEffect } from "../src/renderFrame";

// Effect layers on one row (manual: Sequencer > Layers). "Each model may have a up to 200 layers
// of effects", and "each layer can be blended with the layer below it".
//
// Simultaneous effects on a row *are* the layers - which is why the cap and the order matter here
// and not only in layerStack.ts.

const geometry = computeVerticalMatrixTopLeft({ strings: 2, nodesPerString: 2 });
const RED = rgba(255, 0, 0, 255);
const onParams = { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false };

function on(startMs: number, endMs: number, extra: Partial<RenderableEffect> = {}): RenderableEffect {
  return { name: "On", startMs, endMs, params: onParams, ...extra };
}

// Additive rather than Normal: a Normal layer is a fully opaque overwrite, so the topmost one
// would hide the base whether or not the base survived the cap - which tests nothing.
const overCap = Array.from({ length: MAX_LAYERS + 5 }, () => on(0, 1000, { blendMode: "Additive", palette: [rgba(1, 0, 0, 255)] }));

describe("a row with more layers than the cap", () => {

  it("keeps the bottom of the stack rather than the top", () => {
    // The bug this replaced: keeping the *last* N discarded the base everything else blends onto,
    // so a row over the limit rendered as if its background had never been drawn. Dropping from
    // the top instead leaves the picture recognisable.
    //
    // Checked by making the bottom layer the only one that draws anything distinctive: if the
    // bottom survived, its colour is there.
    const stack = [on(0, 1000, { palette: [rgba(0, 255, 0, 255)] }), ...overCap];
    const colors = renderRowAtMs({ geometry, effects: stack }, 500, 50, 1, [RED]);
    expect(colors[0]!.g).toBeGreaterThan(0);
  });

  it("renders rather than throwing", () => {
    expect(() => renderRowAtMs({ geometry, effects: overCap }, 500, 50, 1, [RED])).not.toThrow();
  });
});

describe("the two render paths agree about layers", () => {
  it("picks the same layers when a row is over the cap", () => {
    // The recurring hazard in this engine: scrubbing and exporting are separate code paths, and a
    // file that doesn't match the preview is the worst kind of bug here - it only shows up when
    // the show is running.
    const stack = [on(0, 1000, { palette: [rgba(0, 255, 0, 255)] }), ...overCap];
    const scrubbed = renderRowAtMs({ geometry, effects: stack }, 0, 50, 1, [RED]);

    const sequencer = createRowSequencer({ geometry, effects: stack }, 50, 1, [RED]);
    const swept = sequencer.renderFrameAt(0);

    expect(swept).toEqual(scrubbed);
  });
});

describe("layers well past the old cap of five", () => {
  it("all contribute", () => {
    // Five was the original milestone's number and low enough to be reached by an imported
    // sequence. Twenty additive layers should be brighter than two.
    const twenty = Array.from({ length: 20 }, () => on(0, 1000, { blendMode: "Additive", palette: [rgba(10, 0, 0, 255)] }));
    const two = twenty.slice(0, 2);
    const bright = renderRowAtMs({ geometry, effects: twenty }, 500, 50, 1, [RED]);
    const dim = renderRowAtMs({ geometry, effects: two }, 500, 50, 1, [RED]);
    expect(bright[0]!.r).toBeGreaterThan(dim[0]!.r);
  });
});

describe("layer order decides the composite, not array order", () => {
  it("puts a higher layer on top however the effects are ordered in the row", () => {
    // "Each layer can be blended with the layer below it." Which layer is below is the layer
    // *number* - an effect added later sits wherever its layer says, not automatically on top.
    const green = on(0, 1000, { palette: [rgba(0, 255, 0, 255)], layerIndex: 1 });
    const red = on(0, 1000, { palette: [rgba(255, 0, 0, 255)], layerIndex: 0 });

    // Array order green-then-red; layer order says red is below, so green wins.
    const colors = renderRowAtMs({ geometry, effects: [green, red] }, 500, 50, 1, [RED]);
    expect(colors[0]!.g).toBe(255);
    expect(colors[0]!.r).toBe(0);
  });

  it("keeps two effects on the same layer in their authored order", () => {
    const first = on(0, 1000, { palette: [rgba(255, 0, 0, 255)], layerIndex: 0 });
    const second = on(0, 1000, { palette: [rgba(0, 0, 255, 255)], layerIndex: 0 });
    const colors = renderRowAtMs({ geometry, effects: [first, second] }, 500, 50, 1, [RED]);
    expect(colors[0]!.b).toBe(255);
  });

  it("renders the same through both paths", () => {
    // The standing hazard: scrubbing and the sequential export sweep are separate code paths.
    const stack = [
      on(0, 1000, { palette: [rgba(0, 255, 0, 255)], layerIndex: 2 }),
      on(0, 1000, { palette: [rgba(255, 0, 0, 255)], layerIndex: 0 }),
    ];
    const scrubbed = renderRowAtMs({ geometry, effects: stack }, 0, 50, 1, [RED]);
    const swept = createRowSequencer({ geometry, effects: stack }, 50, 1, [RED]).renderFrameAt(0);
    expect(swept).toEqual(scrubbed);
  });
});
