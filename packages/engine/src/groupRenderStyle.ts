import type { RGBA } from "./color";
import type { ModelGeometry, ModelNode } from "./models/types";
import type { RenderableEffect, RenderableRow } from "./renderFrame";
import { applyRenderStyle, type RenderStyle } from "./renderStyle";
import { geometryCenter, nodeWorldOffset, type ScreenTransform } from "./models/transform";

/** One member of a group, as the planner sees it. */
export type GroupMember = GroupRenderSpec["members"][number];

// xLights' group render styles (manual: Sequencer > Layers > Layer Settings). A model group can
// be sequenced as one thing, and the render style is what decides *how* several separate props
// are arranged into the single buffer an effect draws into.
//
// This is the other half of renderStyle.ts. That file remaps one model's nodes within its own
// buffer; this one lays several models out in a shared buffer and hands back the mapping needed
// to get the resulting colours back onto the right props. The effects are untouched either way -
// an effect only ever sees a buffer.
//
// The styles fall into two families, and they are not variations of one mechanism:
//
//   - the *composed* ones build one buffer spanning every member, so an effect sweeps across the
//     whole group as a unit (a Bars effect climbing all the arches together);
//   - the "Per Model" ones render the effect separately on each member, so every prop shows the
//     same effect at the same moment on its own buffer (the same Bars climbing each arch).
//
// isPerModelStyle tells them apart, because a caller has to do genuinely different work for each.

export type GroupRenderStyle =
  // Shared with single models
  | "Default"
  | "Per Preview"
  | "Single Line"
  | "As Pixel"
  // Composed group layouts
  | "Horizontal Stacked"
  | "Vertically Stacked"
  | "Horizontal Stacked - Scaled"
  | "Vertically Stacked - Scaled"
  | "Horizontal Per Model"
  | "Vertical Per Model"
  | "Horizontal Per Model/Strand"
  | "Vertical Per Model/Strand"
  | "Overlay - Centered"
  | "Overlay - Scaled"
  | "Single Line as a Pixel"
  // Rendered once per member rather than composed
  | "Per Model Default"
  | "Per Model Per Preview"
  | "Per Model Single Line";

export const GROUP_RENDER_STYLES: GroupRenderStyle[] = [
  "Default",
  "Per Preview",
  "Single Line",
  "As Pixel",
  "Horizontal Stacked",
  "Vertically Stacked",
  "Horizontal Stacked - Scaled",
  "Vertically Stacked - Scaled",
  "Horizontal Per Model",
  "Vertical Per Model",
  "Horizontal Per Model/Strand",
  "Vertical Per Model/Strand",
  "Overlay - Centered",
  "Overlay - Scaled",
  "Single Line as a Pixel",
  "Per Model Default",
  "Per Model Per Preview",
  "Per Model Single Line",
];

// What xLights writes in a group's `layout` attribute isn't always one of the style names above:
// it also uses its own layout-mode words for the preview-shaped ones. The manual describes them
// as "Grid as per preview - the buffer used will be exactly as to how the house preview appears"
// and "Minimal Grid - the buffer area will be an area just surrounding the model group".
//
// Both lay the members out where they physically stand, which is Per Preview here. Our Per
// Preview already sizes itself to the group's own bounds, so it *is* the minimal grid; a group
// asking for the full-house grid gets a buffer cropped to itself instead of one padded out to
// the whole yard, which changes how coarse the effect is but not where anything lands.
const STYLE_ALIASES: Record<string, GroupRenderStyle> = {
  grid: "Per Preview",
  gridasperpreview: "Per Preview",
  minimalgrid: "Per Preview",
  // This app's own earlier four-option picker, so a group saved before the real names existed
  // still renders as what it meant rather than silently falling back to Default.
  horizontal: "Horizontal Stacked",
  vertical: "Vertically Stacked",
};

// Style names reach us in three spellings: the manual's ("Overlay - Scaled"), xLights' attribute
// values ("minimalGrid"), and whatever this app stored earlier. Comparing on letters and digits
// alone collapses all three, so a style doesn't get lost over a space or a capital.
function styleKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Reads a stored group buffer style, however it was spelled, into one this engine renders.
 *
 * An unrecognised value falls back to Default rather than throwing: the string comes from a real
 * show's XML, and a group whose style we don't know should still light up.
 */
export function toGroupRenderStyle(raw: string | null | undefined): GroupRenderStyle {
  if (!raw) return "Default";
  const key = styleKey(raw);
  if (!key) return "Default";
  const exact = GROUP_RENDER_STYLES.find((s) => styleKey(s) === key);
  return exact ?? STYLE_ALIASES[key] ?? "Default";
}

/**
 * One buffer covering a whole group, and the mapping back to the members it was built from.
 *
 * `geometry.nodes` is the members' nodes concatenated in member order, so member `m` owns the
 * range `[memberStarts[m], memberStarts[m + 1])`. Keeping that implicit rather than storing a
 * per-node back-reference is what lets a caller write a rendered frame back onto the props with
 * a slice instead of a lookup per node.
 */
export interface GroupBuffer {
  geometry: ModelGeometry;
  memberStarts: number[];
}

/** The "Per Model" styles render the effect on each member separately rather than composing. */
export function isPerModelStyle(style: GroupRenderStyle | undefined): boolean {
  return style === "Per Model Default" || style === "Per Model Per Preview" || style === "Per Model Single Line";
}

/** Which single-model style each member gets under a "Per Model" group style. */
export function perModelStyleFor(style: GroupRenderStyle): RenderStyle {
  if (style === "Per Model Per Preview") return "Per Preview";
  if (style === "Per Model Single Line") return "Single Line";
  return "Default";
}

/**
 * Lays a group's members out into one buffer.
 *
 * Member order is the group's own order, which xLights treats as meaningful: "the order of the
 * models in the 'Models in Group' determines the render order". Stacking styles depend on it
 * outright - it is what decides which arch is on the left.
 */
export function composeGroupBuffer(
  // Takes either bare geometries or full members. Only "Per Preview" needs the placement, and a
  // caller with no layout to place anything against - a test, a preset thumbnail - should not have
  // to invent one.
  members: Array<ModelGeometry | GroupMember>,
  style: GroupRenderStyle | undefined,
): GroupBuffer {
  const present = members
    .map((m, i): GroupMember => ("geometry" in m ? m : { modelId: i, geometry: m }))
    .filter((m) => m.geometry.nodes.length > 0);
  const geometries = present.map((m) => m.geometry);
  const memberStarts: number[] = [];
  let running = 0;
  for (const m of present) {
    memberStarts.push(running);
    running += m.geometry.nodes.length;
  }
  memberStarts.push(running);

  if (present.length === 0) return { geometry: { width: 1, height: 1, nodes: [] }, memberStarts: [0] };

  // "Default: uses the Default buffer for a model or SubModel and Per Preview for a Model Group."
  // A group has no buffer of its own to fall back on, so Default *is* Per Preview here.
  const resolved = !style || style === "Default" ? "Per Preview" : style;

  if (isPerModelStyle(resolved)) {
    // Composing is meaningless for these - the caller renders each member on its own. Returning
    // the members side by side keeps the shape valid for anything that only wants a size.
    return place(geometries, memberStarts, stackedPlacement(geometries, "horizontal", false));
  }

  switch (resolved) {
    case "Per Preview":
      return perPreview(present, memberStarts);
    case "Single Line":
      // Every member's nodes end to end, in member order and then wiring order.
      return place(geometries, memberStarts, sequential(geometries, (i) => ({ bufX: i, bufY: 0 }), running, 1));
    case "As Pixel":
      return place(geometries, memberStarts, sequential(geometries, () => ({ bufX: 0, bufY: 0 }), 1, 1));
    case "Single Line as a Pixel":
      // "Each Model is represented as a single Pixel and placed in a single line."
      return place(geometries, memberStarts, perMemberCell((m) => ({ bufX: m, bufY: 0 }), present.length, 1));
    case "Horizontal Stacked":
      return place(geometries, memberStarts, stackedPlacement(geometries, "horizontal", false));
    case "Vertically Stacked":
      return place(geometries, memberStarts, stackedPlacement(geometries, "vertical", false));
    case "Horizontal Stacked - Scaled":
      return place(geometries, memberStarts, stackedPlacement(geometries, "horizontal", true));
    case "Vertically Stacked - Scaled":
      return place(geometries, memberStarts, stackedPlacement(geometries, "vertical", true));
    case "Horizontal Per Model":
      return place(geometries, memberStarts, perModelLine(geometries, "horizontal"));
    case "Vertical Per Model":
      return place(geometries, memberStarts, perModelLine(geometries, "vertical"));
    case "Horizontal Per Model/Strand":
      return place(geometries, memberStarts, perModelStrand(geometries, "horizontal"));
    case "Vertical Per Model/Strand":
      return place(geometries, memberStarts, perModelStrand(geometries, "vertical"));
    case "Overlay - Centered":
      return place(geometries, memberStarts, overlay(geometries, false));
    case "Overlay - Scaled":
      return place(geometries, memberStarts, overlay(geometries, true));
    default:
      return perPreview(present, memberStarts);
  }
}

// A placement says how big the shared buffer is and where each member's each node lands in it.
interface Placement {
  width: number;
  height: number;
  at: (member: number, node: ModelNode, indexInMember: number) => { bufX: number; bufY: number };
}

function place(members: ModelGeometry[], memberStarts: number[], placement: Placement): GroupBuffer {
  const nodes: ModelNode[] = [];
  // Strand numbers restart at 0 in every model, so they are offset per member. Without this, two
  // arches' first strands would look like one strand to anything reading the combined geometry.
  let strandBase = 0;
  members.forEach((member, m) => {
    let maxStrand = 0;
    member.nodes.forEach((node, i) => {
      const { bufX, bufY } = placement.at(m, node, i);
      maxStrand = Math.max(maxStrand, node.string);
      // screenX/screenY are untouched: a render style changes which buffer cell a node reads
      // from, never where the prop stands in the yard.
      nodes.push({ ...node, bufX, bufY, string: strandBase + node.string });
    });
    strandBase += maxStrand + 1;
  });
  return {
    geometry: { width: Math.max(1, placement.width), height: Math.max(1, placement.height), nodes },
    memberStarts,
  };
}

// Nodes numbered straight through the whole group, ignoring which member they came from.
function sequential(
  members: ModelGeometry[],
  cell: (index: number) => { bufX: number; bufY: number },
  width: number,
  height: number,
): Placement {
  const offsets = memberOffsets(members);
  return { width, height, at: (m, _node, i) => cell(offsets[m]! + i) };
}

// One cell per member: every node of a model reads the same place.
function perMemberCell(
  cell: (member: number) => { bufX: number; bufY: number },
  width: number,
  height: number,
): Placement {
  return { width, height, at: (m) => cell(m) };
}

function memberOffsets(members: ModelGeometry[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const m of members) {
    offsets.push(running);
    running += m.nodes.length;
  }
  return offsets;
}

// "Horizontal Stacked: places each Model next to each other horizontally in a single row that is
// aligned to the bottom." Vertically Stacked is the same idea turned a quarter turn and aligned
// to the left instead. The scaled variants stretch every member's buffer to the largest one, so
// a 10-node arch and a 200-node tree get equal shares of the group rather than equal pixels.
function stackedPlacement(members: ModelGeometry[], axis: "horizontal" | "vertical", scaled: boolean): Placement {
  const maxW = Math.max(...members.map((m) => m.width), 1);
  const maxH = Math.max(...members.map((m) => m.height), 1);

  const cellW = scaled ? maxW : 0;
  const cellH = scaled ? maxH : 0;
  const starts: number[] = [];
  let running = 0;
  for (const m of members) {
    starts.push(running);
    running += scaled ? (axis === "horizontal" ? cellW : cellH) : axis === "horizontal" ? m.width : m.height;
  }

  const width = axis === "horizontal" ? running : scaled ? maxW : maxW;
  const height = axis === "horizontal" ? (scaled ? maxH : maxH) : running;

  return {
    width,
    height,
    at: (m, node) => {
      const member = members[m]!;
      const start = starts[m]!;
      if (!scaled) {
        return axis === "horizontal"
          ? { bufX: start + node.bufX, bufY: node.bufY }
          : { bufX: node.bufX, bufY: start + node.bufY };
      }
      const sx = stretch(node.bufX, member.width, maxW);
      const sy = stretch(node.bufY, member.height, maxH);
      return axis === "horizontal" ? { bufX: start + sx, bufY: sy } : { bufX: sx, bufY: start + sy };
    },
  };
}

// "Overlay - Centered: models are 'set' on top of each other and the buffers are Centered."
// Scaled instead stretches each to the largest, so the models line up edge to edge rather than
// leaving a small prop as a dot in the middle of a big one.
function overlay(members: ModelGeometry[], scaled: boolean): Placement {
  const width = Math.max(...members.map((m) => m.width), 1);
  const height = Math.max(...members.map((m) => m.height), 1);
  return {
    width,
    height,
    at: (m, node) => {
      const member = members[m]!;
      if (scaled) return { bufX: stretch(node.bufX, member.width, width), bufY: stretch(node.bufY, member.height, height) };
      return {
        bufX: node.bufX + Math.floor((width - member.width) / 2),
        bufY: node.bufY + Math.floor((height - member.height) / 2),
      };
    },
  };
}

// "Horizontal Per Model: each Model's nodes are setup as a single row in the buffer horizontally
// and then each model is stacked vertically." One row per prop, so an effect running down the
// buffer runs from prop to prop rather than across any one of them.
function perModelLine(members: ModelGeometry[], axis: "horizontal" | "vertical"): Placement {
  const longest = Math.max(...members.map((m) => m.nodes.length), 1);
  return {
    width: axis === "horizontal" ? longest : members.length,
    height: axis === "horizontal" ? members.length : longest,
    at: (m, _node, i) => (axis === "horizontal" ? { bufX: i, bufY: m } : { bufX: m, bufY: i }),
  };
}

// "...each Model's strands are setup as a single row...and then each model is stacked
// vertically." Same as above but one row per *strand*, so a mega tree contributes as many rows as
// it has strands instead of collapsing to one.
function perModelStrand(members: ModelGeometry[], axis: "horizontal" | "vertical"): Placement {
  const rowOf = new Map<string, number>();
  let rows = 0;
  let longest = 1;
  members.forEach((member, m) => {
    const lengths = new Map<number, number>();
    for (const node of member.nodes) {
      const key = `${m}:${node.string}`;
      if (!rowOf.has(key)) rowOf.set(key, rows++);
      const next = (lengths.get(node.string) ?? 0) + 1;
      lengths.set(node.string, next);
      longest = Math.max(longest, next);
    }
  });

  return {
    width: axis === "horizontal" ? longest : rows,
    height: axis === "horizontal" ? rows : longest,
    at: (m, node) => {
      const row = rowOf.get(`${m}:${node.string}`) ?? 0;
      const along = Math.min(longest - 1, node.indexInString);
      return axis === "horizontal" ? { bufX: along, bufY: row } : { bufX: row, bufY: along };
    },
  };
}

// "Per Preview: this will render the way the model has been laid out in the preview." For a group
// that is the whole point of the style - the props keep their positions relative to each other,
// so an effect sweeps across the yard rather than across a list of models.
/**
 * Where a member's node sits in the yard.
 *
 * With a placement, the model's own transform and anchor are applied, so two props twenty feet
 * apart are twenty feet apart here too. Without one, the node's local coordinates stand in - the
 * old behaviour, and right for a caller that has no layout to place anything against.
 */
function worldMapper(member: GroupMember): (node: ModelNode) => { x: number; y: number } {
  const placement = member.placement;
  if (!placement) return (node) => ({ x: node.screenX, y: node.screenY });
  const centre = geometryCenter(member.geometry);
  return (node) => {
    const off = nodeWorldOffset(node, centre, placement.transform);
    return { x: placement.x + off.x, y: placement.y + off.y };
  };
}

function perPreview(members: GroupMember[], memberStarts: number[]): GroupBuffer {
  const mappers = members.map(worldMapper);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let total = 0;
  members.forEach((member, m) => {
    const at = mappers[m]!;
    for (const node of member.geometry.nodes) {
      const { x, y } = at(node);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      total++;
    }
  });
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  // Roughly one cell per node, shaped like the group's own footprint - the same rule the
  // single-model Per Preview uses, so a one-model group renders as that model does.
  const width = Math.max(1, Math.round(Math.sqrt(total) * (spanX >= spanY ? spanX / spanY : 1)));
  const height = Math.max(1, Math.round(Math.sqrt(total) * (spanY > spanX ? spanY / spanX : 1)));

  return place(
    members.map((m) => m.geometry),
    memberStarts,
    {
      width,
      height,
      at: (m, node) => {
        const { x, y } = mappers[m]!(node);
        return {
          bufX: Math.min(width - 1, Math.round(((x - minX) / spanX) * (width - 1))),
          // The buffer's row 0 is the bottom, the same way a model's is, so a group effect runs
          // up the yard in the same direction it runs up a single prop.
          bufY: Math.min(height - 1, Math.round(((y - minY) / spanY) * (height - 1))),
        };
      },
    },
  );
}

function stretch(value: number, from: number, to: number): number {
  if (from <= 1) return Math.floor((to - 1) / 2); // a one-cell model has no shape to stretch
  return Math.min(to - 1, Math.round((value / (from - 1)) * (to - 1)));
}

/**
 * A member's geometry as it should be rendered under a "Per Model" group style.
 *
 * Thin, but it keeps the mapping from group style to single-model style in one place instead of
 * leaving each call site to remember that "Per Model Single Line" means "Single Line".
 */
export function perModelGeometry(member: ModelGeometry, style: GroupRenderStyle): ModelGeometry {
  return applyRenderStyle(member, perModelStyleFor(style));
}

// ---- Rendering a group ----------------------------------------------------------------------
//
// Composing the buffer is only half of it. A group borrows its members' lights the way a
// sub-model borrows its parent's, so whatever the effect draws has to be scattered back onto
// real props to reach the yard at all.
//
// This lives in the engine rather than in the app because both consumers - the house preview and
// the .fseq export - have to do it identically. A difference between them is the worst bug this
// app can have: a show that looks right on screen and plays wrong in the yard. Here, it is under
// test; there, it would be written twice.

export interface GroupRenderSpec {
  id: number;
  /** The stored buffer style, in whatever spelling the show used. */
  style?: string | null;
  /** Members in the group's own order, which decides which prop is on the left when stacked. */
  members: Array<{
    modelId: number;
    geometry: ModelGeometry;
    /**
     * Where this member actually stands in the yard, if the caller knows.
     *
     * "Per Preview" is defined as laying the members out where they physically are, and it cannot
     * do that from the geometry alone: every model's `screenX`/`screenY` are its *own* local
     * coordinates, centred on its own origin. Two props twenty feet apart have overlapping local
     * boxes, so a group buffer built from them covers the two shapes on top of each other and
     * every member ends up mapped across the whole buffer - which renders as each prop showing a
     * complete copy of the effect instead of its own part of one.
     *
     * Optional so a caller that has no layout - a test, a preset preview - still gets the old
     * local-coordinate behaviour rather than an error.
     */
    placement?: { x: number; y: number; transform: ScreenTransform };
  }>;
  effects: RenderableEffect[];
}

export interface GroupSlice {
  modelId: number;
  /** Where this member's nodes start in the job's composed geometry. */
  start: number;
  count: number;
}

export interface GroupRenderJob {
  groupId: number;
  row: RenderableRow;
  slices: GroupSlice[];
}

/**
 * Works out what has to be rendered for a sequence's group rows.
 *
 * One job per group under a composed style; one job *per member* under a "Per Model" style,
 * where the manual's own description is that the effect renders separately on each prop rather
 * than across all of them. Both come back in the same shape, so a caller renders and scatters
 * them identically and doesn't have to know which kind it has.
 *
 * A group with no effects, no members, or no member whose geometry could be built is skipped -
 * there is nothing to render, and an empty job would cost a buffer per frame to produce nothing.
 */
export function planGroupRendering(specs: GroupRenderSpec[]): GroupRenderJob[] {
  const jobs: GroupRenderJob[] = [];

  for (const spec of specs) {
    if (spec.effects.length === 0) continue;
    const members = spec.members.filter((m) => m.geometry.nodes.length > 0);
    if (members.length === 0) continue;

    const style = toGroupRenderStyle(spec.style);

    if (isPerModelStyle(style)) {
      for (const member of members) {
        const geometry = perModelGeometry(member.geometry, style);
        jobs.push({
          groupId: spec.id,
          row: { geometry, effects: spec.effects },
          slices: [{ modelId: member.modelId, start: 0, count: geometry.nodes.length }],
        });
      }
      continue;
    }

    // The members themselves, not just their geometries - "Per Preview" needs to know where each
    // one stands to lay them out where they physically are.
    const { geometry, memberStarts } = composeGroupBuffer(members, style);
    jobs.push({
      groupId: spec.id,
      row: { geometry, effects: spec.effects },
      slices: members.map((member, i) => ({
        modelId: member.modelId,
        start: memberStarts[i]!,
        count: memberStarts[i + 1]! - memberStarts[i]!,
      })),
    });
  }

  return jobs;
}

/**
 * Writes a job's rendered frame back onto the models it came from.
 *
 * Transparent cells are skipped, so two groups sharing a model don't blank each other out - a
 * model can belong to more than one group, and the second to render would otherwise erase the
 * first wherever its own effect had nothing to show.
 */
export function scatterGroupColors(job: GroupRenderJob, colors: RGBA[], into: Map<number, RGBA[]>): void {
  for (const slice of job.slices) {
    let target = into.get(slice.modelId);
    if (!target) {
      target = new Array<RGBA>(slice.count);
      into.set(slice.modelId, target);
    }
    for (let i = 0; i < slice.count; i++) {
      const color = colors[slice.start + i];
      if (color && color.a > 0) target[i] = color;
    }
  }
}

/**
 * Lays a group's contribution under a model's own rows.
 *
 * A group is the *less* specific statement about a prop - it says what a whole set of props is
 * doing - so the model's own effects sit on top of it, and its sub-models on top of those. Where
 * the model has nothing to say, the group shows through.
 *
 * `blend` is xLights' Sequence Settings > "Allow Blending Between Models": "decides whether effects
 * from the model groups blend with model level effects". Off - the default, and what this did
 * before the setting existed - a model's own effects replace the group wherever they draw at all.
 * On, they composite over it, so a half-lit model lets half the group through rather than hiding
 * it. Off is the right default because it is the more predictable of the two: what you put on the
 * model is what you see.
 */
export function applyGroupBase(nodeColors: RGBA[], base: RGBA[] | undefined, blend = false): void {
  if (!base) return;
  for (let i = 0; i < nodeColors.length; i++) {
    const under = base[i];
    if (!under) continue;
    const over = nodeColors[i]!;
    if (over.a === 0) {
      nodeColors[i] = under;
      continue;
    }
    // A fully opaque model pixel hides the group either way, so there is nothing to blend.
    if (!blend || over.a >= 255) continue;
    const a = over.a / 255;
    nodeColors[i] = {
      r: Math.round(over.r * a + under.r * (1 - a)),
      g: Math.round(over.g * a + under.g * (1 - a)),
      b: Math.round(over.b * a + under.b * (1 - a)),
      // The result is at least as opaque as either side: blending shouldn't make a lit pixel
      // dimmer than the group alone was.
      a: Math.max(over.a, under.a),
    };
  }
}
