import { describe, expect, it } from "vitest";
import { clampToViewport, loadPlacement, savePlacement } from "../src/lib/panelPositions";

function storage(initial?: string) {
  let value = initial;
  return { getItem: () => value ?? null, setItem: (_k: string, v: string) => { value = v; } };
}

describe("remembering where a panel was left", () => {
  it("round-trips per panel", () => {
    const store = storage();
    savePlacement(store, "models", { x: 40, y: 80, pinned: true });
    savePlacement(store, "views", { x: 500, y: 20, pinned: false });
    expect(loadPlacement(store, "models")).toEqual({ x: 40, y: 80, pinned: true });
    expect(loadPlacement(store, "views")).toEqual({ x: 500, y: 20, pinned: false });
  });

  it("forgets a panel when told to", () => {
    const store = storage();
    savePlacement(store, "models", { x: 40, y: 80, pinned: true });
    savePlacement(store, "models", null);
    expect(loadPlacement(store, "models")).toBeNull();
  });

  it("ignores a corrupt or malformed bag rather than failing", () => {
    expect(loadPlacement(storage("not json"), "models")).toBeNull();
    expect(loadPlacement(storage('{"models":{"x":"left","y":2}}'), "models")).toBeNull();
    expect(loadPlacement(storage('{"models":{"x":1,"y":2}}'), "models")).toEqual({ x: 1, y: 2, pinned: false });
    expect(loadPlacement(null, "models")).toBeNull();
  });
});

describe("keeping a panel reachable", () => {
  const viewport = { width: 1200, height: 800 };
  const panel = { width: 560, height: 400 };

  it("leaves a position that fits alone", () => {
    expect(clampToViewport({ x: 100, y: 100 }, panel, viewport)).toEqual({ x: 100, y: 100 });
  });

  it("pulls a panel remembered from a bigger monitor back on screen", () => {
    expect(clampToViewport({ x: 2000, y: 1500 }, panel, viewport)).toEqual({ x: 632, y: 752 });
    expect(clampToViewport({ x: -300, y: -50 }, panel, viewport)).toEqual({ x: 8, y: 8 });
  });

  it("only requires the title bar to stay visible, not the whole panel", () => {
    // A tall panel on a short window: the bottom may hang off, the grab handle may not.
    const tall = { width: 560, height: 900 };
    expect(clampToViewport({ x: 100, y: 700 }, tall, viewport).y).toBe(700);
    expect(clampToViewport({ x: 100, y: 790 }, tall, viewport).y).toBe(752);
  });
});
