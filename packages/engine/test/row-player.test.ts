import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { createRowPlayer, renderRowAtMs, type RenderableEffect } from "../src/renderFrame";
import type { RGBA } from "../src/color";

// The player exists so live playback stops paying renderRowAtMs's replay-from-start cost per
// frame - but only if it produces the same pixels. These tests pin the equivalence on the frame
// grid, through the interesting transitions: sweeps, repeats within a frame, seeks both ways,
// and the mutation contract composeModel relies on.

const geometry = computeVerticalMatrixTopLeft({ strings: 8, nodesPerString: 10 });
const FRAME_MS = 50;
const SEED = 42;
const PALETTE: RGBA[] = [
  { r: 255, g: 0, b: 0, a: 255 },
  { r: 0, g: 0, b: 255, a: 255 },
];

// A stateful effect is the whole point - Meteors carries physics across frames, which is the
// case where the pure path replays and the player must not diverge.
const effects: RenderableEffect[] = [
  { name: "Meteors", startMs: 1000, endMs: 9000, params: { count: 5, trailLength: 10, speed: 8 } },
  { name: "ColorWash", startMs: 0, endMs: 10_000, params: { cycles: 2 } },
];
const row = { geometry, effects };

describe("createRowPlayer", () => {
  it("matches renderRowAtMs on every frame of a forward sweep", () => {
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    for (let ms = 0; ms <= 4000; ms += FRAME_MS) {
      expect(player.renderAt(ms)).toEqual(renderRowAtMs(row, ms, FRAME_MS, SEED, PALETTE));
    }
  });

  it("matches renderRowAtMs when started cold in the middle of a stateful effect", () => {
    // This is a user pressing play at 5s: the player has never seen frames 0..99, and the
    // stateful physics must still be where a from-the-start replay would have put it.
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    expect(player.renderAt(5000)).toEqual(renderRowAtMs(row, 5000, FRAME_MS, SEED, PALETTE));
  });

  it("matches after a backward seek", () => {
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    player.renderAt(7000);
    expect(player.renderAt(3000)).toEqual(renderRowAtMs(row, 3000, FRAME_MS, SEED, PALETTE));
  });

  it("matches after a forward jump too large to be playback", () => {
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    player.renderAt(1000);
    expect(player.renderAt(8000)).toEqual(renderRowAtMs(row, 8000, FRAME_MS, SEED, PALETTE));
  });

  it("returns the same frame for every call landing inside it, without advancing state", () => {
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    // A 60fps repaint loop calls three times inside one 50ms frame; the physics must step once.
    const a = player.renderAt(2000);
    const b = player.renderAt(2010);
    const c = player.renderAt(2049);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(player.renderAt(2050)).toEqual(renderRowAtMs(row, 2050, FRAME_MS, SEED, PALETTE));
  });

  it("gives each caller their own copy to scribble on", () => {
    // composeModel writes strand and sub-model colours into what render() returns; a shared
    // cached array would smear one frame's writes into the next.
    const player = createRowPlayer(row, FRAME_MS, SEED, PALETTE);
    const first = player.renderAt(2000);
    first[0]!.r = 123;
    first[0]!.a = 7;
    expect(player.renderAt(2001)[0]).not.toMatchObject({ r: 123, a: 7 });
    expect(player.renderAt(2001)).toEqual(renderRowAtMs(row, 2000, FRAME_MS, SEED, PALETTE));
  });

  it("keeps a persistent stateful layer accumulating, identically in both paths", () => {
    // The Persistent layer setting means frames pile up instead of replacing each other. Before
    // the fix this worked in the preview and silently not in the export for stateful effects;
    // the equivalence here is what says both now mean the same thing by it.
    const persistentRow = {
      geometry,
      effects: [
        {
          name: "Meteors",
          startMs: 0,
          endMs: 10_000,
          params: { count: 5, trailLength: 10, speed: 8 },
          layer: { persistent: true },
        } as RenderableEffect,
      ],
    };
    const player = createRowPlayer(persistentRow, FRAME_MS, SEED, PALETTE);
    for (let ms = 0; ms <= 3000; ms += FRAME_MS) {
      expect(player.renderAt(ms)).toEqual(renderRowAtMs(persistentRow, ms, FRAME_MS, SEED, PALETTE));
    }
    // And persistence genuinely accumulates: by 3s the kept buffer holds far more lit nodes
    // than a single non-persistent frame does.
    const litPersistent = renderRowAtMs(persistentRow, 3000, FRAME_MS, SEED, PALETTE).filter((c) => c.a > 0).length;
    const litFresh = renderRowAtMs(row, 3000, FRAME_MS, SEED, PALETTE).filter((c) => c.a > 0).length;
    expect(litPersistent).toBeGreaterThan(litFresh);
  });

  it("renders an empty row as transparent, like the pure path", () => {
    const player = createRowPlayer({ geometry, effects: [] }, FRAME_MS, SEED, PALETTE);
    const colors = player.renderAt(1000);
    expect(colors).toHaveLength(geometry.nodes.length);
    expect(colors.every((c) => c.a === 0)).toBe(true);
  });
});
