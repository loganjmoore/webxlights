import { describe, expect, it } from "vitest";
import { rgba, type RGBA } from "../src/color";
import { MAX_LAYERS, renderLayerStack, renderLayerStackToNodes } from "../src/layerStack";
import type { ModelGeometry } from "../src/models/types";

describe("Layer stack (SPEC ch9 §5, bottom-to-top composite)", () => {
  it("a single layer just renders through", () => {
    const result = renderLayerStack(2, 2, [
      { render: (buf) => buf.fill(rgba(255, 0, 0)), blendMode: "Normal", effectMixThreshold: 0 },
    ]);
    expect(result.getPixel(0, 0)).toEqual(rgba(255, 0, 0, 255));
  });

  it("Additive stacks two layers' brightness", () => {
    const result = renderLayerStack(1, 1, [
      { render: (buf) => buf.fill(rgba(100, 0, 0)), blendMode: "Normal", effectMixThreshold: 0 },
      { render: (buf) => buf.fill(rgba(50, 0, 0)), blendMode: "Additive", effectMixThreshold: 0 },
    ]);
    expect(result.getPixel(0, 0)).toEqual(rgba(150, 0, 0, 255));
  });

  it("stacks well past the five layers this once capped at", () => {
    // The manual: "each model may have a up to 200 layers of effects." Five was the original
    // milestone's number, and low enough to be reached by an imported sequence rather than only
    // by someone being unreasonable.
    const layers = Array.from({ length: 60 }, () => ({
      render: (buf: import("../src/renderBuffer").RenderBuffer) => buf.fill(rgba(1, 1, 1)),
      blendMode: "Additive" as const,
      effectMixThreshold: 0,
    }));
    expect(() => renderLayerStack(1, 1, layers)).not.toThrow();
    expect(renderLayerStack(1, 1, layers).getPixel(0, 0).r).toBe(60);
  });

  it("still refuses more layers than the manual allows", () => {
    const layers = Array.from({ length: MAX_LAYERS + 1 }, () => ({
      render: (buf: import("../src/renderBuffer").RenderBuffer) => buf.fill(rgba(1, 1, 1)),
      blendMode: "Normal" as const,
      effectMixThreshold: 0,
    }));
    expect(() => renderLayerStack(1, 1, layers)).toThrow();
  });
});

describe("Canvas mode", () => {
  const geometry: ModelGeometry = {
    width: 2,
    height: 1,
    nodes: [
      { bufX: 0, bufY: 0, screenX: 0, screenY: 0, string: 0, indexInString: 0 },
      { bufX: 1, bufY: 0, screenX: 1, screenY: 0, string: 0, indexInString: 1 },
    ],
  };
  const RED = rgba(255, 0, 0, 255);
  const BLUE = rgba(0, 0, 255, 255);

  it("hands a Canvas layer what the layers underneath it drew", () => {
    // This is the whole mechanism behind Kaleidoscope, Warp and Adjust: an ordinary layer's
    // buffer starts empty, so an effect that modifies what is below it has nothing to work on
    // unless the stack seeds the buffer first.
    let seen: RGBA | null = null;
    renderLayerStackToNodes(2, [
      { geometry, blendMode: "Normal", effectMixThreshold: 0, render: (b) => b.fill(RED) },
      {
        geometry,
        blendMode: "Canvas",
        effectMixThreshold: 0,
        render: (b) => {
          seen = b.getPixel(0, 0);
        },
      },
    ]);
    expect(seen).toEqual(RED);
  });

  it("takes a Canvas layer's output whole, including where it cleared a pixel", () => {
    // A Normal blend would have kept the background wherever the canvas effect erased something,
    // which would make every "reveal"-style effect a no-op.
    const colors = renderLayerStackToNodes(2, [
      { geometry, blendMode: "Normal", effectMixThreshold: 0, render: (b) => b.fill(RED) },
      {
        geometry,
        blendMode: "Canvas",
        effectMixThreshold: 0,
        render: (b) => {
          b.setPixel(0, 0, BLUE);
          b.setPixel(1, 0, rgba(0, 0, 0, 0));
        },
      },
    ]);
    expect(colors[0]).toEqual(BLUE);
    expect(colors[1]).toEqual(rgba(0, 0, 0, 0));
  });

  it("gives an ordinary layer a blank buffer, as before", () => {
    let seen: RGBA | null = null;
    renderLayerStackToNodes(2, [
      { geometry, blendMode: "Normal", effectMixThreshold: 0, render: (b) => b.fill(RED) },
      {
        geometry,
        blendMode: "Normal",
        effectMixThreshold: 0,
        render: (b) => {
          seen = b.getPixel(0, 0);
        },
      },
    ]);
    expect(seen).toEqual(rgba(0, 0, 0, 0));
  });
});
