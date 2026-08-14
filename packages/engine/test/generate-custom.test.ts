import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATE_OPTIONS, generateCustomModel } from "../src/models/generateCustom";
import { parseCustomModelGrid } from "../src/models/custom";

// A tiny picture, written as characters so the shape is visible in the test itself.
function picture(rows: string[]): { rgba: number[]; width: number; height: number } {
  const width = rows[0]!.length;
  const height = rows.length;
  const rgba: number[] = [];
  for (const row of rows) {
    for (const ch of row) {
      // "#" is a bright opaque pixel, "." a dark one, " " a transparent one.
      if (ch === "#") rgba.push(255, 255, 255, 255);
      else if (ch === ".") rgba.push(10, 10, 10, 255);
      else rgba.push(255, 255, 255, 0);
    }
  }
  return { rgba, width, height };
}

describe("generating a Custom model from a picture", () => {
  it("puts a node where the picture is bright and nothing where it isn't", () => {
    const { rgba, width, height } = picture(["#.", ".#"]);
    const model = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2 });
    expect(model.grid).toBe("1,;,2");
    expect(model.nodeCount).toBe(2);
  });

  it("produces a grid the engine can read straight back", () => {
    // The whole point of the format: what this writes has to be what parseCustomModelGrid reads.
    const { rgba, width, height } = picture(["#.#", ".#.", "#.#"]);
    const model = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 3 });
    const geo = parseCustomModelGrid(model.grid);
    expect(geo).not.toBeNull();
    expect(geo!.nodes).toHaveLength(model.nodeCount);
    expect(geo!.width).toBe(3);
  });

  it("treats a transparent pixel as empty, whatever colour it nominally holds", () => {
    // A PNG cut-out is the most likely input here, and its background is transparent rather than
    // black - reading the colour alone would fill the whole grid.
    const { rgba, width, height } = picture(["# ", " #"]);
    expect(generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2 }).nodeCount).toBe(2);
  });

  it("keeps the picture's shape when it samples down", () => {
    const { rgba, width, height } = picture(Array.from({ length: 20 }, () => "#".repeat(40)));
    const model = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 20 });
    expect([model.width, model.height]).toEqual([20, 10]);
  });

  it("takes the brightest pixel of a block, not their average", () => {
    // A single-pixel wire frame averaged over a block disappears - and a wire-frame prop is
    // exactly what this tool is for.
    const rows = Array.from({ length: 8 }, (_, y) => (y === 3 ? "#".repeat(8) : ".".repeat(8)));
    const { rgba, width, height } = picture(rows);
    const model = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2 });
    expect(model.nodeCount).toBeGreaterThan(0);
  });

  it("numbers along rows by default", () => {
    const { rgba, width, height } = picture(["##", "##"]);
    expect(generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2 }).grid).toBe("1,2;3,4");
  });

  it("numbers back and forth for a zig-zag wiring", () => {
    // The number is the channel order, so a prop wired back and forth but numbered straight will
    // chase backwards on alternate rows - which looks like a broken effect, not a numbering bug.
    const { rgba, width, height } = picture(["##", "##"]);
    const model = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2, order: "rowsZigZag" });
    expect(model.grid).toBe("1,2;4,3");
  });

  it("numbers down columns when asked", () => {
    const { rgba, width, height } = picture(["##", "##"]);
    expect(generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2, order: "columns" }).grid).toBe("1,3;2,4");
    expect(generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2, order: "columnsZigZag" }).grid).toBe("1,4;2,3");
  });

  it("finds fewer nodes as the threshold rises", () => {
    const { rgba, width, height } = picture(["#.", ".#"]);
    const dim = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2, threshold: 5 });
    const strict = generateCustomModel(rgba, width, height, { ...DEFAULT_GENERATE_OPTIONS, columns: 2, threshold: 250 });
    expect(dim.nodeCount).toBeGreaterThan(strict.nodeCount);
  });

  it("returns nothing for a picture with no size, rather than dividing by it", () => {
    expect(generateCustomModel([], 0, 0).nodeCount).toBe(0);
  });
});
