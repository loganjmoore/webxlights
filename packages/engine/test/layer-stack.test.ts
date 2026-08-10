import { describe, expect, it } from "vitest";
import { rgba } from "../src/color";
import { renderLayerStack } from "../src/layerStack";

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

  it("throws when given more than the M3 cap of 5 layers", () => {
    const layers = Array.from({ length: 6 }, () => ({
      render: (buf: import("../src/renderBuffer").RenderBuffer) => buf.fill(rgba(1, 1, 1)),
      blendMode: "Normal" as const,
      effectMixThreshold: 0,
    }));
    expect(() => renderLayerStack(1, 1, layers)).toThrow();
  });
});
