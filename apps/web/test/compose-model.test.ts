import { describe, expect, it } from "vitest";
import { computeVerticalMatrixTopLeft, rgba, strandSpecs, type ModelGeometry, type RGBA, type RenderableEffect } from "@webxlights/engine";
import { composeModel, type RenderRow } from "../src/lib/composeModel";

// The order four sources are applied in, which is the feature rather than an implementation
// detail: group, then the model's own rows, then strands, then sub-models.
//
// These rules exist twice - here for the screen and in fseqExport for the file - and the export's
// copy has been tested since the export tests landed. This is the other half. Rendering is faked,
// because what is being asserted is not what an effect looks like; it is which of four sources
// wins on a given node.

const geometry: ModelGeometry = computeVerticalMatrixTopLeft({ strings: 2, nodesPerString: 3 });
const RED = rgba(255, 0, 0, 255);
const GREEN = rgba(0, 255, 0, 255);
const BLUE = rgba(0, 0, 255, 255);
const CLEAR = rgba(0, 0, 0, 0);

/** An effect that is only a marker: the fake renderer decides what it draws. */
function effect(name: string): RenderableEffect {
  return { name, startMs: 0, endMs: 1000, params: {} };
}

/** Paints every node of whatever geometry it is handed with the colour its effect names. */
const paint: RenderRow = (geo, effects) => {
  const colors: RGBA[] = geo.nodes.map(() => ({ ...CLEAR }));
  const first = effects[0];
  if (!first) return colors;
  const byName: Record<string, RGBA> = { red: RED, green: GREEN, blue: BLUE, nothing: CLEAR };
  const color = byName[first.name] ?? RED;
  return colors.map(() => ({ ...color }));
};

const strandNames = strandSpecs(geometry).map((s) => s.name);

describe("what wins on a node", () => {
  it("shows the group where the model has nothing to say", () => {
    const colors = composeModel({
      geometry,
      own: [],
      groupBase: geometry.nodes.map(() => ({ ...GREEN })),
      render: paint,
    });
    expect(colors.every((c) => c.g === 255)).toBe(true);
  });

  it("puts the model's own rows over the group", () => {
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      groupBase: geometry.nodes.map(() => ({ ...GREEN })),
      render: paint,
    });
    expect(colors.every((c) => c.r === 255)).toBe(true);
  });

  it("puts a strand over the model's own rows", () => {
    // "The strands blend onto the model level effects."
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      strands: new Map([[strandNames[0]!, [effect("green")]]]),
      render: paint,
    });
    const strandNodes = geometry.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.string === 0);
    for (const { i } of strandNodes) expect(colors[i]!.g, `node ${i}`).toBe(255);
    // And leaves the rest of the model alone.
    for (const { i } of geometry.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.string !== 0)) {
      expect(colors[i]!.r, `node ${i}`).toBe(255);
    }
  });

  it("puts a sub-model over a strand", () => {
    // A sub-model is the thing somebody drew deliberately, so it is the most specific of the four.
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      strands: new Map([[strandNames[0]!, [effect("green")]]]),
      subModels: [{ spec: { name: "Tip", type: "ranges", rows: ["1"] }, effects: [effect("blue")] }],
      render: paint,
    });
    expect(colors[0]!.b).toBe(255);
  });
});

describe("a borrowed set of lights writing back", () => {
  it("writes only where it actually drew", () => {
    // A transparent pixel means "nothing to say here", not "turn this off" - so what is underneath
    // shows through rather than being cleared by something that rendered nothing.
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      strands: new Map([[strandNames[0]!, [effect("nothing")]]]),
      render: paint,
    });
    expect(colors.every((c) => c.r === 255)).toBe(true);
  });

  it("ignores a strand or sub-model with no effects at all", () => {
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      strands: new Map([[strandNames[0]!, []]]),
      subModels: [{ spec: { name: "Tip", type: "ranges", rows: ["1"] }, effects: [] }],
      render: paint,
    });
    expect(colors.every((c) => c.r === 255)).toBe(true);
  });

  it("survives a sub-model whose spec selects nothing the model has", () => {
    // An out-of-range sub-model is dropped rather than throwing or blanking the model.
    const colors = composeModel({
      geometry,
      own: [effect("red")],
      subModels: [{ spec: { name: "Gone", type: "ranges", rows: ["999"] }, effects: [effect("blue")] }],
      render: paint,
    });
    expect(colors.every((c) => c.r === 255)).toBe(true);
  });
});

describe("blending with the group", () => {
  it("lets the group through in proportion when blending is on", () => {
    // xLights' "Allow Blending Between Models". Off, the model's own effects replace the group
    // wherever they draw; on, they composite over it.
    const half: RenderRow = (geo) => geo.nodes.map(() => rgba(0, 0, 255, 128));
    const blended = composeModel({
      geometry,
      own: [effect("blue")],
      groupBase: geometry.nodes.map(() => ({ ...RED })),
      blendGroup: true,
      render: half,
    });
    expect(blended[0]!.r).toBeGreaterThan(0);

    const replaced = composeModel({
      geometry,
      own: [effect("blue")],
      groupBase: geometry.nodes.map(() => ({ ...RED })),
      render: half,
    });
    expect(replaced[0]!.r).toBe(0);
  });
});
