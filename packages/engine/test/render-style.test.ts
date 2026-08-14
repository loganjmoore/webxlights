import { describe, expect, it } from "vitest";
import { applyRenderStyle, RENDER_STYLES } from "../src/renderStyle";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { computeSingleLine } from "../src/models/line";
import { renderRowAtMs } from "../src/renderFrame";
import { DEFAULT_PALETTE } from "../src/color";

const MATRIX = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 5 });

describe("Render Style (manual: Sequencer > Layers > Layer Settings > Render Style)", () => {
  it("leaves Default alone, including the object identity", () => {
    expect(applyRenderStyle(MATRIX, "Default")).toBe(MATRIX);
    expect(applyRenderStyle(MATRIX, undefined)).toBe(MATRIX);
  });

  it("Single Line lays every node end to end on one row", () => {
    const styled = applyRenderStyle(MATRIX, "Single Line");
    expect(styled.height).toBe(1);
    expect(styled.width).toBe(20);
    expect(styled.nodes.map((n) => n.bufX)).toEqual([...Array(20).keys()]);
    expect(styled.nodes.every((n) => n.bufY === 0)).toBe(true);
  });

  it("As Pixel points every node at the same single cell", () => {
    const styled = applyRenderStyle(MATRIX, "As Pixel");
    expect([styled.width, styled.height]).toEqual([1, 1]);
    expect(styled.nodes.every((n) => n.bufX === 0 && n.bufY === 0)).toBe(true);
  });

  it("Per Preview lays the buffer out the way the model physically stands", () => {
    // A model's wiring order and its shape are different things; this style is the one that
    // makes an effect sweep across the prop rather than along the string.
    const styled = applyRenderStyle(MATRIX, "Per Preview");
    const left = styled.nodes.find((n) => n.screenX === 0)!;
    const right = styled.nodes.find((n) => n.screenX === 3)!;
    expect(left.bufX).toBeLessThan(right.bufX);
  });

  it("Per Strand gives each strand its own row or column", () => {
    const horizontal = applyRenderStyle(MATRIX, "Horizontal Per Strand");
    expect(horizontal.height).toBe(4); // one row per string
    expect(horizontal.width).toBe(5); // as long as the longest strand
    expect(new Set(horizontal.nodes.filter((n) => n.string === 0).map((n) => n.bufY)).size).toBe(1);

    const vertical = applyRenderStyle(MATRIX, "Vertical Per Strand");
    expect(vertical.width).toBe(4);
    expect(vertical.height).toBe(5);
  });

  it("never moves a node in the yard - only which cell it reads", () => {
    // The style changes the buffer, not the layout. A style that shifted screen coordinates
    // would silently rearrange someone's show.
    for (const style of RENDER_STYLES) {
      const styled = applyRenderStyle(MATRIX, style);
      expect(styled.nodes.map((n) => [n.screenX, n.screenY])).toEqual(MATRIX.nodes.map((n) => [n.screenX, n.screenY]));
      expect(styled.nodes.length).toBe(MATRIX.nodes.length);
    }
  });

  it("keeps every node pointing inside its buffer", () => {
    for (const style of RENDER_STYLES) {
      const styled = applyRenderStyle(MATRIX, style);
      for (const node of styled.nodes) {
        expect(node.bufX, style).toBeGreaterThanOrEqual(0);
        expect(node.bufX, style).toBeLessThan(styled.width);
        expect(node.bufY, style).toBeGreaterThanOrEqual(0);
        expect(node.bufY, style).toBeLessThan(styled.height);
      }
    }
  });
});

describe("render styles through the whole pipeline", () => {
  const geometry = computeSingleLine({ strings: 1, nodesPerString: 8 });

  function render(renderStyle: "Default" | "As Pixel"): ReturnType<typeof renderRowAtMs> {
    return renderRowAtMs(
      {
        geometry,
        effects: [
          {
            name: "Bars",
            startMs: 0,
            endMs: 1000,
            params: { paletteRep: 1, cycles: 1, direction: "right", centerPercent: 0, highlight: false },
            layer: { renderStyle },
          },
        ],
      },
      100,
      50,
      1,
      DEFAULT_PALETTE,
    );
  }

  it("As Pixel makes the whole model one colour, Default does not", () => {
    const asPixel = render("As Pixel").map((c) => `${c.r},${c.g},${c.b},${c.a}`);
    expect(new Set(asPixel).size).toBe(1);

    const normal = render("Default").map((c) => `${c.r},${c.g},${c.b},${c.a}`);
    expect(new Set(normal).size).toBeGreaterThan(1);
  });

  it("returns one colour per node whatever the style", () => {
    expect(render("As Pixel")).toHaveLength(8);
    expect(render("Default")).toHaveLength(8);
  });
});
