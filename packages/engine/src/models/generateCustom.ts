// xLights' Tools > Generate Custom Model: build a Custom model from a picture of the prop.
//
// A Custom model is a grid of node numbers - the format `parseCustomModelGrid` reads. Making one
// by hand for anything with more than a dozen nodes is tedious enough that people don't, and the
// props that most need one (a hand-made snowflake, a wire-frame reindeer) are exactly the ones
// with no library entry.
//
// This takes the picture's bright pixels as node positions. It is DOM-free on purpose - it is
// handed raw RGBA and a size, so the same code runs under test as in the browser.

export interface GeneratedModel {
  /** The `CustomModel` attribute value: rows of comma-separated node numbers, rows separated by ";". */
  grid: string;
  width: number;
  height: number;
  nodeCount: number;
}

export interface GenerateOptions {
  /** 0-255. A pixel at or above this brightness becomes a node. */
  threshold: number;
  /** The grid's width in cells. Height follows from the picture's shape. */
  columns: number;
  /**
   * How nodes are numbered once found. xLights' own wiring choices, and they matter: the number
   * *is* the channel order, so getting it wrong lights the prop in the wrong sequence.
   */
  order: "rows" | "rowsZigZag" | "columns" | "columnsZigZag";
}

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = { threshold: 128, columns: 32, order: "rows" };

/** Brightness of a pixel, in the same terms the threshold is given in. */
function brightnessAt(rgba: ArrayLike<number>, index: number): number {
  const alpha = rgba[index + 3] ?? 255;
  // A transparent pixel is never a node, whatever colour it nominally holds - a PNG cut-out is
  // the most likely input here, and its background is transparent rather than black.
  if (alpha < 128) return 0;
  return Math.max(rgba[index] ?? 0, rgba[index + 1] ?? 0, rgba[index + 2] ?? 0);
}

/**
 * Turns a picture into a Custom model grid.
 *
 * The picture is sampled down to `columns` wide, keeping its shape: each grid cell takes the
 * *brightest* pixel of the block it covers rather than their average, because a single-pixel wire
 * frame averaged over a block disappears - which is exactly the kind of prop this is for.
 */
export function generateCustomModel(
  rgba: ArrayLike<number>,
  imageWidth: number,
  imageHeight: number,
  options: GenerateOptions = DEFAULT_GENERATE_OPTIONS,
): GeneratedModel {
  const columns = Math.max(1, Math.min(200, Math.trunc(options.columns)));
  if (imageWidth <= 0 || imageHeight <= 0) return { grid: "", width: 0, height: 0, nodeCount: 0 };

  const rows = Math.max(1, Math.round((imageHeight / imageWidth) * columns));
  const cellW = imageWidth / columns;
  const cellH = imageHeight / rows;
  const threshold = Math.max(1, Math.min(255, options.threshold));

  // `true` where a node goes. Built first so the numbering pass can walk it in whatever order the
  // wiring asks for without re-sampling the picture.
  const lit: boolean[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < columns; col++) {
      let brightest = 0;
      const x0 = Math.floor(col * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((col + 1) * cellW));
      const y0 = Math.floor(row * cellH);
      const y1 = Math.max(y0 + 1, Math.floor((row + 1) * cellH));
      for (let y = y0; y < y1 && y < imageHeight; y++) {
        for (let x = x0; x < x1 && x < imageWidth; x++) {
          brightest = Math.max(brightest, brightnessAt(rgba, (y * imageWidth + x) * 4));
        }
      }
      line.push(brightest >= threshold);
    }
    lit.push(line);
  }

  const numbers: number[][] = lit.map((line) => line.map(() => 0));
  let next = 1;
  for (const { row, col } of wiringOrder(rows, columns, options.order)) {
    if (lit[row]![col]) numbers[row]![col] = next++;
  }

  return {
    // Empty cells are written as "" - the format's own way of saying "no node here", which is what
    // lets a Custom model be any shape rather than a filled rectangle.
    grid: numbers.map((line) => line.map((n) => (n === 0 ? "" : String(n))).join(",")).join(";"),
    width: columns,
    height: rows,
    nodeCount: next - 1,
  };
}

/**
 * The order cells are numbered in.
 *
 * The number *is* the channel order, so this is wiring rather than presentation: a prop numbered
 * left-to-right on every row but actually wired back and forth will chase backwards on alternate
 * rows, which looks like a broken effect rather than a mis-numbered model.
 */
function* wiringOrder(rows: number, columns: number, order: GenerateOptions["order"]): Generator<{ row: number; col: number }> {
  const byColumns = order === "columns" || order === "columnsZigZag";
  const zigZag = order === "rowsZigZag" || order === "columnsZigZag";

  if (byColumns) {
    for (let col = 0; col < columns; col++) {
      const reversed = zigZag && col % 2 === 1;
      for (let i = 0; i < rows; i++) yield { row: reversed ? rows - 1 - i : i, col };
    }
    return;
  }
  for (let row = 0; row < rows; row++) {
    const reversed = zigZag && row % 2 === 1;
    for (let i = 0; i < columns; i++) yield { row, col: reversed ? columns - 1 - i : i };
  }
}
