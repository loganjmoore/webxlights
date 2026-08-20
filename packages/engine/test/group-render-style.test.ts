import { describe, expect, it } from "vitest";
import {
  applyGroupBase,
  composeGroupBuffer,
  GROUP_RENDER_STYLES,
  isPerModelStyle,
  perModelGeometry,
  perModelStyleFor,
  planGroupRendering,
  scatterGroupColors,
  toGroupRenderStyle,
  type GroupRenderSpec,
} from "../src/groupRenderStyle";
import { rgba } from "../src/color";
import { createRowSequencer, renderRowAtMs } from "../src/renderFrame";
import { computeSingleLine } from "../src/models/line";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import type { ModelGeometry } from "../src/models/types";

// Two props of deliberately different sizes, because most of these styles only differ from each
// other when the members aren't the same shape.
const SMALL = computeSingleLine({ strings: 1, nodesPerString: 4 });
const BIG = computeVerticalMatrixTopLeft({ strings: 3, nodesPerString: 5 });
const MID = computeVerticalMatrixTopLeft({ strings: 2, nodesPerString: 3 });

// Members sitting apart in the yard, which is what Per Preview is about.
function placed(geo: ModelGeometry, dx: number, dy: number): ModelGeometry {
  return { ...geo, nodes: geo.nodes.map((n) => ({ ...n, screenX: n.screenX + dx, screenY: n.screenY + dy })) };
}

function bounds(nodes: Array<{ bufX: number; bufY: number }>) {
  return {
    minX: Math.min(...nodes.map((n) => n.bufX)),
    maxX: Math.max(...nodes.map((n) => n.bufX)),
    minY: Math.min(...nodes.map((n) => n.bufY)),
    maxY: Math.max(...nodes.map((n) => n.bufY)),
  };
}

function memberNodes(members: ModelGeometry[], style: Parameters<typeof composeGroupBuffer>[1], index: number) {
  const { geometry, memberStarts } = composeGroupBuffer(members, style);
  return geometry.nodes.slice(memberStarts[index]!, memberStarts[index + 1]!);
}

describe("group render styles (manual: Sequencer > Layers > Layer Settings)", () => {
  const members = [SMALL, BIG];

  it("keeps every node of every member, in member order", () => {
    for (const style of GROUP_RENDER_STYLES) {
      const { geometry, memberStarts } = composeGroupBuffer(members, style);
      expect(geometry.nodes.length, style).toBe(SMALL.nodes.length + BIG.nodes.length);
      expect(memberStarts, style).toEqual([0, SMALL.nodes.length, SMALL.nodes.length + BIG.nodes.length]);
    }
  });

  it("never moves a prop in the yard, whatever the style", () => {
    // The same invariant the single-model styles hold: a render style says which buffer cell a
    // node reads from, never where the prop physically stands.
    for (const style of GROUP_RENDER_STYLES) {
      const nodes = composeGroupBuffer(members, style).geometry.nodes;
      const original = [...SMALL.nodes, ...BIG.nodes];
      nodes.forEach((n, i) => {
        expect(n.screenX, style).toBe(original[i]!.screenX);
        expect(n.screenY, style).toBe(original[i]!.screenY);
      });
    }
  });

  it("keeps every node pointing inside the buffer it hands the effect", () => {
    // A node reading outside the buffer would silently render black - the failure that never
    // throws and is only visible in the yard.
    for (const style of GROUP_RENDER_STYLES) {
      const { geometry } = composeGroupBuffer(members, style);
      for (const node of geometry.nodes) {
        expect(node.bufX, `${style} bufX`).toBeGreaterThanOrEqual(0);
        expect(node.bufX, `${style} bufX`).toBeLessThan(geometry.width);
        expect(node.bufY, `${style} bufY`).toBeGreaterThanOrEqual(0);
        expect(node.bufY, `${style} bufY`).toBeLessThan(geometry.height);
      }
    }
  });

  it("gives two members' strands separate numbers so they don't read as one strand", () => {
    const { geometry, memberStarts } = composeGroupBuffer(members, "Per Preview");
    const first = geometry.nodes.slice(0, memberStarts[1]!);
    const second = geometry.nodes.slice(memberStarts[1]!);
    const overlap = new Set(first.map((n) => n.string));
    expect(second.some((n) => overlap.has(n.string))).toBe(false);
  });

  it("Default is Per Preview for a group, which has no default buffer of its own", () => {
    // "Uses the Default buffer for a model or SubModel and Per Preview for a Model Group."
    expect(composeGroupBuffer(members, "Default")).toEqual(composeGroupBuffer(members, "Per Preview"));
    expect(composeGroupBuffer(members, undefined)).toEqual(composeGroupBuffer(members, "Per Preview"));
  });

  it("Per Preview keeps the props where they are relative to each other", () => {
    // One prop to the left, one to the right: the left one's cells must stay left of the right
    // one's. This is the whole point of the style - an effect sweeps across the yard.
    const left = placed(SMALL, -50, 0);
    const right = placed(SMALL, 50, 0);
    const { geometry, memberStarts } = composeGroupBuffer([left, right], "Per Preview");
    const leftCells = bounds(geometry.nodes.slice(0, memberStarts[1]!));
    const rightCells = bounds(geometry.nodes.slice(memberStarts[1]!));
    expect(leftCells.maxX).toBeLessThan(rightCells.minX);
  });

  it("Horizontal Stacked puts the members side by side, aligned to the bottom", () => {
    // "Places each Model next to each other horizontally in a single row that is aligned to the
    // bottom."
    const first = bounds(memberNodes(members, "Horizontal Stacked", 0));
    const second = bounds(memberNodes(members, "Horizontal Stacked", 1));
    expect(first.maxX).toBeLessThan(second.minX);
    expect(first.minY).toBe(0);
    expect(second.minY).toBe(0);
  });

  it("Vertically Stacked puts them one above the other, aligned to the left", () => {
    const first = bounds(memberNodes(members, "Vertically Stacked", 0));
    const second = bounds(memberNodes(members, "Vertically Stacked", 1));
    expect(first.maxY).toBeLessThan(second.minY);
    expect(first.minX).toBe(0);
    expect(second.minX).toBe(0);
  });

  it("the Scaled stacks give a small prop the same share of the buffer as a big one", () => {
    // Unscaled, a 4-node line gets 4 columns next to a 3-column matrix. Scaled, both get the
    // same width - which is what stops a small prop being a sliver of the group.
    const plain = composeGroupBuffer(members, "Horizontal Stacked");
    const scaled = composeGroupBuffer(members, "Horizontal Stacked - Scaled");
    const widthOf = (b: ReturnType<typeof bounds>) => b.maxX - b.minX;

    const plainFirst = widthOf(bounds(memberNodes(members, "Horizontal Stacked", 0)));
    const plainSecond = widthOf(bounds(memberNodes(members, "Horizontal Stacked", 1)));
    expect(plainFirst).not.toBe(plainSecond);

    const scaledFirst = widthOf(bounds(memberNodes(members, "Horizontal Stacked - Scaled", 0)));
    const scaledSecond = widthOf(bounds(memberNodes(members, "Horizontal Stacked - Scaled", 1)));
    expect(scaledFirst).toBe(scaledSecond);

    expect(scaled.geometry.width).toBeGreaterThanOrEqual(plain.geometry.width);
  });

  it("Horizontal Per Model gives each prop exactly one row", () => {
    // "Each Model's nodes are setup as a single row in the buffer horizontally and then each
    // model is stacked vertically."
    const { geometry } = composeGroupBuffer(members, "Horizontal Per Model");
    expect(geometry.height).toBe(2);
    expect(new Set(memberNodes(members, "Horizontal Per Model", 0).map((n) => n.bufY))).toEqual(new Set([0]));
    expect(new Set(memberNodes(members, "Horizontal Per Model", 1).map((n) => n.bufY))).toEqual(new Set([1]));
  });

  it("Vertical Per Model is the same turned a quarter turn", () => {
    const { geometry } = composeGroupBuffer(members, "Vertical Per Model");
    expect(geometry.width).toBe(2);
    expect(new Set(memberNodes(members, "Vertical Per Model", 1).map((n) => n.bufX))).toEqual(new Set([1]));
  });

  it("Per Model/Strand gives a multi-strand prop a row each rather than collapsing it to one", () => {
    // BIG has three strands, SMALL has one, so the buffer is four rows tall - where Horizontal
    // Per Model would have made it two.
    const { geometry } = composeGroupBuffer(members, "Horizontal Per Model/Strand");
    expect(geometry.height).toBe(4);
    expect(new Set(memberNodes(members, "Horizontal Per Model/Strand", 1).map((n) => n.bufY)).size).toBe(3);
  });

  // MID is smaller than BIG in both directions, which is what the overlay styles differ over.
  const nested = [MID, BIG];

  it("Overlay - Centered sets the props on top of each other and centres the smaller one", () => {
    const { geometry } = composeGroupBuffer(nested, "Overlay - Centered");
    expect([geometry.width, geometry.height]).toEqual([BIG.width, BIG.height]);
    const mid = bounds(memberNodes(nested, "Overlay - Centered", 0));
    const big = bounds(memberNodes(nested, "Overlay - Centered", 1));
    // The smaller prop sits inside the larger's ground with an even margin, rather than beside
    // it or jammed into a corner.
    expect(mid.minY - big.minY).toBe(big.maxY - mid.maxY);
    expect(mid.maxX).toBeLessThanOrEqual(big.maxX);
    expect(mid.maxY).toBeLessThan(big.maxY);
  });

  it("Overlay - Scaled stretches the smaller prop to the larger's extent instead of centring it", () => {
    const mid = bounds(memberNodes(nested, "Overlay - Scaled", 0));
    const big = bounds(memberNodes(nested, "Overlay - Scaled", 1));
    expect([mid.minY, mid.maxY]).toEqual([big.minY, big.maxY]);
    expect([mid.minX, mid.maxX]).toEqual([big.minX, big.maxX]);
  });

  it("a prop only one cell tall is centred rather than smeared when the group is scaled", () => {
    // Scaling can stretch where a node reads from, but it can't invent nodes - a single-row prop
    // has nothing to stretch, so it takes the middle row instead of pretending to fill the
    // buffer. Smearing it across every row would light the whole prop from one cell.
    const rows = new Set(memberNodes([SMALL, BIG], "Overlay - Scaled", 0).map((n) => n.bufY));
    expect(rows.size).toBe(1);
    expect([...rows][0]).toBe(Math.floor((BIG.height - 1) / 2));
  });

  it("Single Line puts every node of every prop end to end", () => {
    const { geometry } = composeGroupBuffer(members, "Single Line");
    expect(geometry.height).toBe(1);
    expect(geometry.width).toBe(SMALL.nodes.length + BIG.nodes.length);
    expect(new Set(geometry.nodes.map((n) => n.bufX)).size).toBe(geometry.nodes.length);
  });

  it("Single Line as a Pixel gives each prop one cell, in a line", () => {
    // "Each Model is represented as a single Pixel and placed in a single line" - so a group of
    // twenty mini-trees behaves like a twenty-pixel string.
    const { geometry } = composeGroupBuffer(members, "Single Line as a Pixel");
    expect([geometry.width, geometry.height]).toEqual([2, 1]);
    expect(new Set(memberNodes(members, "Single Line as a Pixel", 0).map((n) => n.bufX))).toEqual(new Set([0]));
    expect(new Set(memberNodes(members, "Single Line as a Pixel", 1).map((n) => n.bufX))).toEqual(new Set([1]));
  });

  it("As Pixel makes the whole group behave as one light", () => {
    const { geometry } = composeGroupBuffer(members, "As Pixel");
    expect([geometry.width, geometry.height]).toEqual([1, 1]);
    expect(geometry.nodes.every((n) => n.bufX === 0 && n.bufY === 0)).toBe(true);
  });

  it("empty members are dropped rather than left as gaps in the buffer", () => {
    const { geometry, memberStarts } = composeGroupBuffer([SMALL, { width: 1, height: 1, nodes: [] }, SMALL], "Horizontal Stacked");
    expect(geometry.nodes.length).toBe(SMALL.nodes.length * 2);
    expect(memberStarts.length).toBe(3); // two present members plus the end marker
  });

  it("a group with no members at all composes to an empty buffer rather than throwing", () => {
    const { geometry } = composeGroupBuffer([], "Per Preview");
    expect(geometry.nodes).toEqual([]);
    expect(geometry.width).toBeGreaterThan(0);
  });
});

describe("the Per Model styles, which render on each prop rather than composing", () => {
  it("are told apart from the composed ones", () => {
    expect(isPerModelStyle("Per Model Default")).toBe(true);
    expect(isPerModelStyle("Per Model Per Preview")).toBe(true);
    expect(isPerModelStyle("Per Model Single Line")).toBe(true);
    expect(isPerModelStyle("Horizontal Stacked")).toBe(false);
    expect(isPerModelStyle(undefined)).toBe(false);
  });

  it("map to the single-model style each one names", () => {
    expect(perModelStyleFor("Per Model Default")).toBe("Default");
    expect(perModelStyleFor("Per Model Per Preview")).toBe("Per Preview");
    expect(perModelStyleFor("Per Model Single Line")).toBe("Single Line");
  });

  it("give a member the geometry that style implies", () => {
    expect(perModelGeometry(BIG, "Per Model Default")).toBe(BIG); // untouched, same object
    expect(perModelGeometry(BIG, "Per Model Single Line").height).toBe(1);
  });
});

describe("reading a stored group style, however the show spelled it", () => {
  it("takes the style names the manual uses, whatever the casing", () => {
    expect(toGroupRenderStyle("Horizontal Per Model")).toBe("Horizontal Per Model");
    expect(toGroupRenderStyle("overlay - scaled")).toBe("Overlay - Scaled");
    // Spelling differences that aren't letters - a missing space, a missing hyphen - don't lose
    // the style, because the three sources of these strings punctuate them differently.
    expect(toGroupRenderStyle("HorizontalPerModel")).toBe("Horizontal Per Model");
    expect(toGroupRenderStyle("Overlay Scaled")).toBe("Overlay - Scaled");
    expect(toGroupRenderStyle("  Per Preview  ")).toBe("Per Preview");
  });

  it("understands xLights' own layout-mode words", () => {
    // A group's `layout` attribute holds these rather than a render style name, and xLights
    // writes them camelCased - "minimalGrid" is what is actually in a real show's XML. Both
    // describe a buffer laid out the way the preview is, which is Per Preview here.
    expect(toGroupRenderStyle("Grid")).toBe("Per Preview");
    expect(toGroupRenderStyle("minimalGrid")).toBe("Per Preview");
    expect(toGroupRenderStyle("Minimal Grid")).toBe("Per Preview");
    // ...and this app's own older four-option picker, so a group saved before the real names
    // existed still renders as what it meant.
    expect(toGroupRenderStyle("Horizontal")).toBe("Horizontal Stacked");
    expect(toGroupRenderStyle("Vertical")).toBe("Vertically Stacked");
  });

  it("falls back to Default for anything it doesn't know, rather than throwing", () => {
    // The string comes out of a real show's XML. A group whose style we can't read should still
    // light up - refusing to render it would lose the whole group over a spelling.
    expect(toGroupRenderStyle("Some Future Style")).toBe("Default");
    expect(toGroupRenderStyle("")).toBe("Default");
    expect(toGroupRenderStyle(null)).toBe("Default");
    expect(toGroupRenderStyle(undefined)).toBe("Default");
  });
});

describe("planning and scattering a group's render", () => {
  const ON = { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } };
  const spec = (over: Partial<GroupRenderSpec> = {}): GroupRenderSpec => ({
    id: 1,
    style: "Horizontal Stacked",
    members: [
      { modelId: 10, geometry: SMALL },
      { modelId: 20, geometry: BIG },
    ],
    effects: [ON],
    ...over,
  });

  it("makes one job spanning the whole group, with a slice per member", () => {
    const jobs = planGroupRendering([spec()]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.row.geometry.nodes.length).toBe(SMALL.nodes.length + BIG.nodes.length);
    expect(jobs[0]!.slices).toEqual([
      { modelId: 10, start: 0, count: SMALL.nodes.length },
      { modelId: 20, start: SMALL.nodes.length, count: BIG.nodes.length },
    ]);
  });

  it("makes one job per member under a Per Model style", () => {
    // "Render the Effects on Each Individual Model" - so the effect is rendered once per prop on
    // that prop's own buffer, not once across a shared one.
    const jobs = planGroupRendering([spec({ style: "Per Model Single Line" })]);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.slices[0]!.modelId)).toEqual([10, 20]);
    expect(jobs.every((j) => j.row.geometry.height === 1)).toBe(true);
  });

  it("skips a group with nothing to render rather than costing a buffer per frame", () => {
    expect(planGroupRendering([spec({ effects: [] })])).toEqual([]);
    expect(planGroupRendering([spec({ members: [] })])).toEqual([]);
    // A member whose geometry couldn't be built is dropped; the group still renders on the rest.
    expect(planGroupRendering([spec({ members: [{ modelId: 10, geometry: { width: 1, height: 1, nodes: [] } }] })])).toEqual([]);
  });

  it("scatters a rendered frame back onto the models the group borrowed", () => {
    const job = planGroupRendering([spec()])[0]!;
    const colors = job.row.geometry.nodes.map((_n, i) => rgba(i, 0, 0, 255));
    const into = new Map<number, ReturnType<typeof rgba>[]>();
    scatterGroupColors(job, colors, into);

    expect(into.get(10)).toHaveLength(SMALL.nodes.length);
    expect(into.get(20)).toHaveLength(BIG.nodes.length);
    // The second member's first node takes the colour at its own start in the shared buffer, not
    // at the start of the buffer - getting this wrong lights the wrong prop.
    expect(into.get(20)![0]).toEqual(colors[SMALL.nodes.length]);
  });

  it("lets two groups sharing a model layer instead of blanking each other", () => {
    // A model can belong to more than one group. If the second one to render wrote its
    // transparent cells too, it would erase whatever the first had put there.
    const first = planGroupRendering([spec({ id: 1 })])[0]!;
    const second = planGroupRendering([spec({ id: 2 })])[0]!;
    const into = new Map<number, ReturnType<typeof rgba>[]>();
    const lit = first.row.geometry.nodes.map(() => rgba(255, 0, 0, 255));
    const blank = second.row.geometry.nodes.map(() => rgba(0, 0, 0, 0));
    scatterGroupColors(first, lit, into);
    scatterGroupColors(second, blank, into);
    expect(into.get(10)![0]).toEqual(rgba(255, 0, 0, 255));
  });

  it("shows the group through only where the model's own rows have nothing to say", () => {
    const base = [rgba(255, 0, 0, 255), rgba(0, 255, 0, 255)];
    const own = [rgba(0, 0, 255, 255), rgba(0, 0, 0, 0)];
    applyGroupBase(own, base);
    expect(own[0]).toEqual(rgba(0, 0, 255, 255)); // the model's own effect wins
    expect(own[1]).toEqual(rgba(0, 255, 0, 255)); // ...and the group fills the gap
  });

  it("leaves a model alone when it isn't in any group", () => {
    const own = [rgba(0, 0, 0, 0)];
    applyGroupBase(own, undefined);
    expect(own).toEqual([rgba(0, 0, 0, 0)]);
  });

  // xLights' Sequence Settings > "Allow Blending Between Models": "decides whether effects from
  // the model groups blend with model level effects".
  describe("with blending allowed", () => {
    it("lets the group through in proportion to what the model isn't covering", () => {
      // A half-lit model over a red group: half the model's blue, half the group's red.
      const base = [rgba(255, 0, 0, 255)];
      const own = [rgba(0, 0, 255, 128)];
      applyGroupBase(own, base, true);
      expect(own[0]!.r).toBeCloseTo(128, -1);
      expect(own[0]!.b).toBeCloseTo(128, -1);
    });

    it("changes nothing where the model is fully opaque", () => {
      // A solid model pixel hides the group either way, so there is nothing to blend.
      const base = [rgba(255, 0, 0, 255)];
      const own = [rgba(0, 0, 255, 255)];
      applyGroupBase(own, base, true);
      expect(own[0]).toEqual(rgba(0, 0, 255, 255));
    });

    it("still fills a gap with the group, exactly as it does without blending", () => {
      const base = [rgba(255, 0, 0, 255)];
      const own = [rgba(0, 0, 0, 0)];
      applyGroupBase(own, base, true);
      expect(own[0]).toEqual(rgba(255, 0, 0, 255));
    });

    it("never comes out dimmer than the group alone was", () => {
      // Blending a barely-lit model over a lit group should not put out a light that was on.
      const base = [rgba(255, 255, 255, 255)];
      const own = [rgba(0, 0, 0, 10)];
      applyGroupBase(own, base, true);
      expect(own[0]!.a).toBe(255);
    });

    it("is off by default, which is what this did before the setting existed", () => {
      const base = [rgba(255, 0, 0, 255)];
      const own = [rgba(0, 0, 255, 128)];
      applyGroupBase(own, base);
      expect(own[0]).toEqual(rgba(0, 0, 255, 128));
    });
  });
});

describe("a group row, rendered end to end", () => {
  const RED = rgba(255, 0, 0, 255);
  const ON = { name: "On", startMs: 0, endMs: 1000, params: { startIntensity: 100, endIntensity: 100, transparencyPct: 0, cycles: 1, shimmer: false } };

  function renderGroup(style: string) {
    const jobs = planGroupRendering([
      {
        id: 1,
        style,
        members: [
          { modelId: 10, geometry: SMALL },
          { modelId: 20, geometry: BIG },
        ],
        effects: [ON],
      },
    ]);
    const into = new Map<number, ReturnType<typeof rgba>[]>();
    for (const job of jobs) scatterGroupColors(job, renderRowAtMs(job.row, 500, 50, 1, [RED]), into);
    return into;
  }

  it("lights every member of the group, not just the first", () => {
    // This is the whole point: before groups rendered, an effect on a group row reached nothing
    // at all - the preview and the .fseq both dropped the row on the floor.
    for (const style of GROUP_RENDER_STYLES) {
      const lit = renderGroup(style);
      expect(lit.get(10)?.filter((c) => c && c.a > 0).length, style).toBe(SMALL.nodes.length);
      expect(lit.get(20)?.filter((c) => c && c.a > 0).length, style).toBe(BIG.nodes.length);
    }
  });

  it("renders the same through the sequential export path as through a scrub", () => {
    // The preview scrubs and the export walks frames in order. A group that rendered differently
    // between them would ship a show that looks right on screen and plays wrong in the yard.
    const jobs = planGroupRendering([
      { id: 1, style: "Horizontal Stacked", members: [{ modelId: 10, geometry: BIG }], effects: [{ name: "Bars", startMs: 0, endMs: 1000, params: { paletteRep: 1, cycles: 2, direction: "up", centerPercent: 0, highlight: false } }] },
    ]);
    const job = jobs[0]!;
    const sequencer = createRowSequencer(job.row, 50, 1, [RED]);
    for (let f = 0; f < 10; f++) {
      const atMs = f * 50;
      expect(sequencer.renderFrameAt(atMs)).toEqual(renderRowAtMs(job.row, atMs, 50, 1, [RED]));
    }
  });
});

describe("Per Preview lays members out where they actually stand", () => {
  // Two identical props, twenty units apart in the yard. Their *local* coordinates are the same -
  // every model's are centred on its own origin - so a group buffer built from geometry alone
  // put them on top of each other, and each ended up mapped across the whole buffer. On screen
  // that is two props each showing a complete copy of the effect instead of its own part of one.
  const prop = () => computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
  const flat = { scale: 1, scaleY: 1, scaleZ: 1, rotateDeg: 0 };

  const spread = [
    { modelId: 1, geometry: prop(), placement: { x: 0, y: 0, transform: flat } },
    { modelId: 2, geometry: prop(), placement: { x: 40, y: 0, transform: flat } },
  ];

  function columnsOf(buffer: ReturnType<typeof composeGroupBuffer>, member: 0 | 1): number[] {
    const start = buffer.memberStarts[member]!;
    const end = buffer.memberStarts[member + 1]!;
    return buffer.geometry.nodes.slice(start, end).map((n) => n.bufX);
  }

  it("gives each member its own band of the buffer", () => {
    const buffer = composeGroupBuffer(spread, "Per Preview");
    const left = columnsOf(buffer, 0);
    const right = columnsOf(buffer, 1);
    // No overlap at all: everything the left prop reads is left of everything the right one does.
    expect(Math.max(...left)).toBeLessThan(Math.min(...right));
  });

  it("puts a prop further away further across the buffer", () => {
    const near = composeGroupBuffer(spread, "Per Preview");
    const further = composeGroupBuffer(
      [spread[0]!, { ...spread[1]!, placement: { x: 400, y: 0, transform: flat } }],
      "Per Preview",
    );
    // The gap between the two props' bands grows with the gap between the props.
    const gap = (b: ReturnType<typeof composeGroupBuffer>) => Math.min(...columnsOf(b, 1)) - Math.max(...columnsOf(b, 0));
    expect(gap(further)).toBeGreaterThan(gap(near));
  });

  it("still composes from geometry alone when nobody says where anything is", () => {
    // A preset thumbnail or a test has no layout to place members against, and should get a
    // buffer rather than an error.
    const buffer = composeGroupBuffer([prop(), prop()], "Per Preview");
    expect(buffer.geometry.nodes).toHaveLength(32);
  });
});

// A group buffer is only useful if it agrees with the view about where the props are. The two
// have to be told that separately - the buffer gets a placement, the view draws from the same
// numbers - and nothing but a test makes them stay in step.
describe("Per Preview matches where the view draws the members", () => {
  // Two props side by side, far enough apart that a mistake in the unit conversion moves them
  // relative to each other rather than just rescaling the pair.
  const UNIT = 4; // the app's local-unit-to-world scale
  const A = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
  const B = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
  const members = [
    { modelId: 1, geometry: A, placement: { x: 0, y: 0, transform: {}, unitScale: UNIT } },
    { modelId: 2, geometry: B, placement: { x: 40, y: 0, transform: {}, unitScale: UNIT } },
  ];

  it("gives each member the share of the buffer its drawn footprint occupies", () => {
    const { geometry, memberStarts } = composeGroupBuffer(members, "Per Preview");
    const xsOf = (m: number) =>
      geometry.nodes.slice(memberStarts[m]!, memberStarts[m + 1]!).map((n) => n.bufX);

    const a = xsOf(0);
    const b = xsOf(1);
    // Each prop spans 3 local units, so 12 world units of a 52-wide span: a little under a
    // quarter of the buffer each, with a clear gap between them. Without the conversion each
    // would collapse to a near-point and the effect would step from one prop to the next
    // instead of sweeping across them.
    expect(Math.max(...a)).toBeLessThan(Math.min(...b));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(a)).toBeGreaterThan(geometry.width * 0.15);
    expect(spread(b)).toBeGreaterThan(geometry.width * 0.15);
  });

  it("puts the two props the same distance apart as the view does", () => {
    const { geometry, memberStarts } = composeGroupBuffer(members, "Per Preview");
    const centre = (m: number) => {
      const xs = geometry.nodes.slice(memberStarts[m]!, memberStarts[m + 1]!).map((n) => n.bufX);
      return (Math.max(...xs) + Math.min(...xs)) / 2;
    };
    // In world units the props' centres are 40 apart and each is 12 wide, so the gap between
    // centres is 40/52 of the total span. The buffer has to reproduce that ratio.
    const gap = (centre(1) - centre(0)) / geometry.width;
    expect(gap).toBeGreaterThan(0.6);
    expect(gap).toBeLessThan(0.85);
  });

  it("ignoring the unit scale misplaces the members relative to each other", () => {
    // The bug this fixes, stated as its own expectation: with no conversion the props' own size
    // shrinks to a quarter while the gap between them stays put, so each collapses toward a
    // point and the space between them swallows the buffer.
    const unconverted = members.map((m) => ({ ...m, placement: { ...m.placement, unitScale: 1 } }));
    const { geometry, memberStarts } = composeGroupBuffer(unconverted, "Per Preview");
    const spreadOf = (m: number) => {
      const xs = geometry.nodes.slice(memberStarts[m]!, memberStarts[m + 1]!).map((n) => n.bufX);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spreadOf(0)).toBeLessThan(geometry.width * 0.15);
  });
});
