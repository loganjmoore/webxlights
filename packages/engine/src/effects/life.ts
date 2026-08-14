import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";

export interface LifeParams {
  cellsToStart: number; // % of the grid seeded alive
  type: number; // 0-3, rule variant
  speed: number; // generations per second-ish
}

export interface LifeState {
  cells: Uint8Array;
  width: number;
  height: number;
  generation: number;
  /** Fractional generations owed, so a slow speed advances less than one step per frame. */
  carry: number;
}

// Manual "Life": Conway's Game of Life, with the manual quoting the four rules verbatim from
// Wikipedia. Those rules are what this implements for Type 0; the other three types vary the
// birth and survival counts, which is what xLights' "Four values can be selected" offers.
//
// The grid wraps at the edges. An unwrapped grid on a model-sized buffer is nearly all edge -
// a 16x50 mega tree has more boundary cells than interior ones - so gliders would die at the
// walls within a second or two and the effect would settle into nothing.
const RULES: Array<{ born: number[]; survive: number[] }> = [
  { born: [3], survive: [2, 3] }, // Conway
  { born: [3, 6], survive: [2, 3] }, // HighLife - has a replicator, so it keeps moving
  { born: [3], survive: [1, 2, 3, 4, 5] }, // Maze
  { born: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] }, // Day & Night
];

export function createLifeState(width: number, height: number, params: LifeParams, seed: number): LifeState {
  const rng = mulberry32(seed);
  const cells = new Uint8Array(width * height);
  const density = Math.min(100, Math.max(1, params.cellsToStart)) / 100;
  for (let i = 0; i < cells.length; i++) cells[i] = rng() < density ? 1 : 0;
  return { cells, width, height, generation: 0, carry: 0 };
}

function neighbours(state: LifeState, x: number, y: number): number {
  const { cells, width, height } = state;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (((x + dx) % width) + width) % width;
      const ny = (((y + dy) % height) + height) % height;
      n += cells[ny * width + nx]!;
    }
  }
  return n;
}

export function stepLife(state: LifeState, type: number): void {
  const rule = RULES[Math.max(0, Math.min(RULES.length - 1, Math.trunc(type)))]!;
  const { width, height } = state;
  const next = new Uint8Array(state.cells.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const n = neighbours(state, x, y);
      const alive = state.cells[i] === 1;
      next[i] = (alive ? rule.survive.includes(n) : rule.born.includes(n)) ? 1 : 0;
    }
  }
  state.cells = next;
  state.generation++;
}

export function renderLife(buffer: RenderBuffer, palette: RGBA[], params: LifeParams, state: LifeState): void {
  // Speed is generations per frame, so a low speed holds a generation on screen for several
  // frames rather than skipping the simulation forward.
  state.carry += Math.min(100, Math.max(1, params.speed)) / 25;
  while (state.carry >= 1) {
    stepLife(state, params.type);
    state.carry -= 1;
  }

  const color = palette[state.generation % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (x >= state.width || y >= state.height) continue;
      if (state.cells[y * state.width + x] === 1) buffer.setPixel(x, y, color);
    }
  }
}
