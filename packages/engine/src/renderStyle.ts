import type { ModelGeometry, ModelNode } from "./models/types";

// xLights' Layer Settings > Render Style (manual: Sequencer > Layers > Layer Settings). It
// controls "how the buffer is laid out for a model or model group when the effect is rendered".
//
// The insight that makes this cheap: a render style is not a rendering mode, it is a *remap of
// which buffer cell each node reads from*. Effects already draw into a buffer and nodes already
// pull their colour out of one by (bufX, bufY), so changing the style means handing the effect a
// differently-shaped buffer and re-pointing the nodes at it. No effect needs to know.
//
// The styles here are the ones that mean something for a single model. The rest of the manual's
// nineteen - Horizontal Stacked, Overlay Centered, Per Model Default and friends - describe how
// several models in a *group* are arranged relative to each other, and this app renders each row
// on its own model; they're recorded in docs/MANUAL-COVERAGE.md rather than faked here.
export type RenderStyle =
  | "Default"
  | "Per Preview"
  | "Single Line"
  | "As Pixel"
  | "Horizontal Per Strand"
  | "Vertical Per Strand";

export const RENDER_STYLES: RenderStyle[] = [
  "Default",
  "Per Preview",
  "Single Line",
  "As Pixel",
  "Horizontal Per Strand",
  "Vertical Per Strand",
];

function remap(geo: ModelGeometry, width: number, height: number, place: (node: ModelNode, index: number) => { bufX: number; bufY: number }): ModelGeometry {
  const nodes = geo.nodes.map((node, index) => {
    const { bufX, bufY } = place(node, index);
    // screenX/screenY/screenZ are the model's physical shape and must survive untouched - the
    // style changes where a node reads its colour from, never where it is in the yard.
    return { ...node, bufX, bufY };
  });
  return { width: Math.max(1, width), height: Math.max(1, height), nodes };
}

export function applyRenderStyle(geo: ModelGeometry, style: RenderStyle | undefined): ModelGeometry {
  if (!style || style === "Default" || geo.nodes.length === 0) return geo;

  switch (style) {
    // "Places all the strings/strands end to end and renders the effect on the resulting one
    // pixel high line." Node order is wiring order, which is what makes a chase run along the
    // physical string rather than across the model's grid.
    case "Single Line":
      return remap(geo, geo.nodes.length, 1, (_node, i) => ({ bufX: i, bufY: 0 }));

    // "Treats all the model nodes as one pixel." Every node reads the same cell, so a whole prop
    // behaves as a single light - the way a group of mini-trees is often driven.
    case "As Pixel":
      return remap(geo, 1, 1, () => ({ bufX: 0, bufY: 0 }));

    // "This will render the way the model has been laid out in the preview." The model's screen
    // coordinates become the buffer grid, so an effect sweeps across the prop as it physically
    // stands rather than as it is wired - the difference between a Bars effect chasing up a
    // mega tree's strands and chasing up the tree.
    case "Per Preview":
      return perPreview(geo);

    case "Horizontal Per Strand":
      return perStrand(geo, "horizontal");
    case "Vertical Per Strand":
      return perStrand(geo, "vertical");
    default:
      return geo;
  }
}

function perPreview(geo: ModelGeometry): ModelGeometry {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of geo.nodes) {
    minX = Math.min(minX, node.screenX);
    maxX = Math.max(maxX, node.screenX);
    minY = Math.min(minY, node.screenY);
    maxY = Math.max(maxY, node.screenY);
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  // Keep the buffer around the size of the model's own node count in each direction, so an
  // effect has roughly one cell per node rather than a buffer so coarse that neighbouring nodes
  // collide or so fine that most of it is empty.
  const width = Math.max(1, Math.round(Math.sqrt(geo.nodes.length) * (spanX >= spanY ? spanX / spanY : 1)));
  const height = Math.max(1, Math.round(Math.sqrt(geo.nodes.length) * (spanY > spanX ? spanY / spanX : 1)));

  return remap(geo, width, height, (node) => ({
    bufX: Math.min(width - 1, Math.round(((node.screenX - minX) / spanX) * (width - 1))),
    bufY: Math.min(height - 1, Math.round(((node.screenY - minY) / spanY) * (height - 1))),
  }));
}

// "Each Model's strands are setup as a single row in the buffer horizontally and then each model
// is stacked vertically" - applied within one model, each of its strands becomes a row (or a
// column) and the effect runs along them.
function perStrand(geo: ModelGeometry, orientation: "horizontal" | "vertical"): ModelGeometry {
  const strands = new Map<number, ModelNode[]>();
  for (const node of geo.nodes) {
    const list = strands.get(node.string) ?? [];
    list.push(node);
    strands.set(node.string, list);
  }
  const order = [...strands.keys()].sort((a, b) => a - b);
  const strandIndex = new Map(order.map((s, i) => [s, i]));
  const longest = Math.max(...[...strands.values()].map((n) => n.length), 1);

  const along = longest;
  const across = order.length;
  const width = orientation === "horizontal" ? along : across;
  const height = orientation === "horizontal" ? across : along;

  return remap(geo, width, height, (node) => {
    const strand = strandIndex.get(node.string) ?? 0;
    const position = Math.min(along - 1, node.indexInString);
    return orientation === "horizontal" ? { bufX: position, bufY: strand } : { bufX: strand, bufY: position };
  });
}
