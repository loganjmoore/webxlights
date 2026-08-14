import { describe, expect, it } from "vitest";
import { computeSpinner } from "../src/models/spinner";
import { computeCube } from "../src/models/cube";
import { computeSphere } from "../src/models/sphere";
import { computeChannelBlock, computeImageModel } from "../src/models/channelBlock";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import type { ModelGeometry } from "../src/models/types";

function bufferIsCovered(geo: ModelGeometry): boolean {
  return geo.nodes.every((n) => n.bufX >= 0 && n.bufX < geo.width && n.bufY >= 0 && n.bufY < geo.height);
}

function distinct<T>(values: T[]): number {
  return new Set(values).size;
}

describe("Spinner (manual: arms radiating from a centre)", () => {
  const params = {
    strings: 2,
    armsPerString: 4,
    nodesPerArm: 10,
    hollowPercent: 20,
    arcDegrees: 360,
    startAngleDegrees: 0,
    zigZag: false,
  };

  it("has one node per light on every arm, in an arms-by-lights buffer", () => {
    const geo = computeSpinner(params);
    expect(geo.nodes).toHaveLength(2 * 4 * 10);
    expect([geo.width, geo.height]).toEqual([10, 8]);
    expect(bufferIsCovered(geo)).toBe(true);
  });

  it("leaves a hollow centre, and a bigger one when asked", () => {
    const inner = (hollowPercent: number) => {
      const geo = computeSpinner({ ...params, hollowPercent });
      return Math.min(...geo.nodes.map((n) => Math.hypot(n.screenX, n.screenY)));
    };
    expect(inner(50)).toBeGreaterThan(inner(10));
    expect(inner(0)).toBeCloseTo(0, 5);
  });

  it("spreads the arms over the arc, and doesn't double up the last one on a full turn", () => {
    // At 360 the spread wraps, so the last arm must not land on the first. At 180 it doesn't, so
    // the last arm belongs at the far end of the fan rather than one step short of it.
    const full = computeSpinner(params);
    const angles = full.nodes.map((n) => Math.round((Math.atan2(n.screenY, n.screenX) * 180) / Math.PI));
    expect(distinct(angles)).toBe(8);

    const half = computeSpinner({ ...params, arcDegrees: 180 });
    const halfAngles = half.nodes.map((n) => (Math.atan2(n.screenY, n.screenX) * 180) / Math.PI);
    expect(Math.max(...halfAngles)).toBeCloseTo(180, 0);
  });

  it("Start Angle turns the whole spinner", () => {
    const turned = computeSpinner({ ...params, startAngleDegrees: 90 });
    const first = turned.nodes[0]!;
    expect(Math.atan2(first.screenY, first.screenX)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("zig-zag reverses the wiring on alternate arms but not where the lights are", () => {
    // "The zig zag attribute is to be selected if the wiring is inwards on one arm and then
    // outwards on the next." Only the node order changes - a light doesn't move because of how
    // the wire reaches it.
    const plain = computeSpinner(params);
    const zig = computeSpinner({ ...params, zigZag: true });
    const radii = (g: ModelGeometry) => g.nodes.map((n) => Math.round(Math.hypot(n.screenX, n.screenY) * 100));
    expect(new Set(radii(zig))).toEqual(new Set(radii(plain)));
    expect(radii(zig)).not.toEqual(radii(plain)); // ...but reached in a different order
  });
});

describe("Cube (manual: a 3D model whose effects render in 2D)", () => {
  const params = { width: 4, height: 3, depth: 2, style: "Cube" as const, strings: 1, zigZag: false };

  it("is a box of nodes, unwrapped into a buffer one layer wide each", () => {
    const geo = computeCube(params);
    expect(geo.nodes).toHaveLength(4 * 3 * 2);
    expect([geo.width, geo.height]).toEqual([8, 3]);
    expect(bufferIsCovered(geo)).toBe(true);
    // Every cell used exactly once: a collision would light two nodes from one buffer cell.
    expect(distinct(geo.nodes.map((n) => `${n.bufX},${n.bufY}`))).toBe(geo.nodes.length);
  });

  it("stands in real depth, so the preview shows a box rather than a flat grid", () => {
    const geo = computeCube(params);
    expect(distinct(geo.nodes.map((n) => n.screenZ))).toBe(2);
  });

  it("Cylinder wraps the width round instead of folding it square", () => {
    const geo = computeCube({ ...params, width: 8, style: "Cylinder" });
    // A wrapped layer has nodes all the way round, so both signs of X are used - which a flat
    // row of the same nodes never produces.
    expect(geo.nodes.some((n) => n.screenX > 0)).toBe(true);
    expect(geo.nodes.some((n) => n.screenX < 0)).toBe(true);
  });

  it("zig-zag changes the wiring order without moving a node", () => {
    const plain = computeCube(params);
    const zig = computeCube({ ...params, zigZag: true });
    expect(zig.nodes.map((n) => n.screenX)).not.toEqual(plain.nodes.map((n) => n.screenX));
    expect(new Set(zig.nodes.map((n) => `${n.bufX},${n.bufY}`))).toEqual(new Set(plain.nodes.map((n) => `${n.bufX},${n.bufY}`)));
  });

  it("splits the nodes across the strings it says it has", () => {
    const geo = computeCube({ ...params, strings: 4 });
    expect(distinct(geo.nodes.map((n) => n.string))).toBe(4);
  });
});

describe("Sphere", () => {
  const params = { strings: 8, nodesPerString: 5, degrees: 360, southernLatitude: 0, northernLatitude: 0 };

  it("buffers like a matrix of the same counts, so matrix effects work on it", () => {
    const geo = computeSphere(params);
    expect(geo.nodes).toHaveLength(40);
    expect([geo.width, geo.height]).toEqual([8, 5]);
    expect(bufferIsCovered(geo)).toBe(true);
  });

  it("is a sphere, not a disc: it has real depth and its strings ring the whole way round", () => {
    const geo = computeSphere(params);
    expect(geo.nodes.some((n) => (n.screenZ ?? 0) > 0)).toBe(true);
    expect(geo.nodes.some((n) => (n.screenZ ?? 0) < 0)).toBe(true);
    // The widest ring is at the equator and the poles pinch in, which is what makes it round.
    const equator = geo.nodes.filter((n) => Math.abs(n.screenY) < 1e-6);
    const poles = geo.nodes.filter((n) => Math.abs(n.screenY) === Math.max(...geo.nodes.map((m) => Math.abs(m.screenY))));
    const spread = (ns: typeof geo.nodes) => Math.max(...ns.map((n) => Math.hypot(n.screenX, n.screenZ ?? 0)));
    expect(spread(equator)).toBeGreaterThan(spread(poles));
  });

  it("half a sphere spreads the same strings over 180 degrees rather than dropping some", () => {
    const half = computeSphere({ ...params, degrees: 180 });
    expect(half.nodes).toHaveLength(40);
    expect(half.nodes.every((n) => (n.screenZ ?? 0) >= -1e-9)).toBe(true); // one side only
  });

  it("the latitudes pull the nodes away from the poles", () => {
    // "Distance from the nodes to the bottom pole" / "to the top pole" - so a bigger latitude
    // leaves a bigger bare cap, and the lit band is shorter.
    const reach = (southernLatitude: number, northernLatitude: number) => {
      const geo = computeSphere({ ...params, southernLatitude, northernLatitude });
      return Math.max(...geo.nodes.map((n) => Math.abs(n.screenY)));
    };
    expect(reach(30, 30)).toBeLessThan(reach(0, 0));
  });
});

describe("Channel Block and Image, which aren't shapes", () => {
  it("a channel block is a row of independent cells, one per channel", () => {
    // "Can be used to model generic channel to be used or AC Lights, relays, smoke machines" -
    // so a chase across the buffer steps through the devices in order.
    const geo = computeChannelBlock({ channels: 6 });
    expect(geo.nodes).toHaveLength(6);
    expect([geo.width, geo.height]).toEqual([6, 1]);
    expect(geo.nodes.map((n) => n.bufX)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("holds a channel block to the manual's own 1-128 range", () => {
    expect(computeChannelBlock({ channels: 0 }).nodes).toHaveLength(1);
    expect(computeChannelBlock({ channels: 500 }).nodes).toHaveLength(128);
  });

  it("an image model is a single-channel prop", () => {
    // "Used to represent single channel props like blow-molds, inflatables" - the whole prop
    // lights or doesn't, so one node is the honest geometry.
    const geo = computeImageModel();
    expect(geo.nodes).toHaveLength(1);
    expect([geo.width, geo.height]).toEqual([1, 1]);
  });
});

describe("importing the new types from a show's own attributes", () => {
  it("builds each of them from its DisplayAs and attribute bag", () => {
    expect(computeGeometryFromAttrs("Spinner", { NumStrings: "2", ArmsPerString: "4", NodesPerArm: "10" })!.nodes).toHaveLength(80);
    expect(computeGeometryFromAttrs("Cube", { Width: "3", Height: "3", Depth: "3" })!.nodes).toHaveLength(27);
    expect(computeGeometryFromAttrs("Sphere", { NumStrings: "8", NodesPerString: "5" })!.nodes).toHaveLength(40);
    expect(computeGeometryFromAttrs("Channel Block", { NumChannels: "8" })!.nodes).toHaveLength(8);
    expect(computeGeometryFromAttrs("Image", {})!.nodes).toHaveLength(1);
  });

  it("reads the counts a pre-2026.04 show stored under parm1/parm2/parm3", () => {
    // The rename that gave these descriptive names came in the 2026.04 release, and most shows
    // that exist predate it. Reading only the new names would import every one of these at a
    // library default instead of its real size.
    expect(computeGeometryFromAttrs("Spinner", { parm1: "2", parm3: "4", parm2: "10" })!.nodes).toHaveLength(80);
    expect(computeGeometryFromAttrs("Sphere", { parm1: "8", parm2: "5" })!.nodes).toHaveLength(40);
    expect(computeGeometryFromAttrs("Channel Block", { parm1: "8" })!.nodes).toHaveLength(8);
  });
});
