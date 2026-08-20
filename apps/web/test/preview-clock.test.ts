import { describe, expect, it } from "vitest";
import { playheadAt, shouldResync, type TransportAnchor } from "../src/lib/previewClock";

const anchor = (over: Partial<TransportAnchor> = {}): TransportAnchor => ({
  playheadMs: 1000,
  at: 5000,
  playing: true,
  ...over,
});

describe("the popped-out preview's clock", () => {
  it("runs forward between messages", () => {
    // The whole point: the sequencer tab is in the background while you watch this one, and its
    // requestAnimationFrame is paused, so no messages are arriving at all.
    expect(playheadAt(anchor(), 5000)).toBe(1000);
    expect(playheadAt(anchor(), 5500)).toBe(1500);
    expect(playheadAt(anchor(), 8000)).toBe(4000);
  });

  it("holds still when the transport is paused", () => {
    expect(playheadAt(anchor({ playing: false }), 9000)).toBe(1000);
  });

  it("never runs backwards", () => {
    // A clock adjustment or a stale frame shouldn't rewind the show.
    expect(playheadAt(anchor(), 4000)).toBe(1000);
  });

  it("holds at the end of the sequence rather than past it", () => {
    expect(playheadAt(anchor(), 60000, 3000)).toBe(3000);
  });

  it("ignores a duration of zero, which means nobody has said how long this is", () => {
    expect(playheadAt(anchor(), 6000, 0)).toBe(2000);
  });
});

describe("deciding whether to take a correction", () => {
  it("takes one that is more than a frame out", () => {
    expect(shouldResync(1000, 1200, 50)).toBe(true);
  });

  it("ignores one that agrees with the local clock", () => {
    // Re-anchoring on every message would snap the animation a few milliseconds either way
    // sixty times a second, which reads as a stutter rather than as accuracy.
    expect(shouldResync(1000, 1010, 50)).toBe(false);
    expect(shouldResync(1000, 1000, 50)).toBe(false);
  });

  it("still corrects on a tiny frame time rather than never", () => {
    expect(shouldResync(1000, 1002, 0)).toBe(true);
  });
});
