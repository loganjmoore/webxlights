import { computeGeometryFromAttrs, computeSubModelGeometry, type ModelGeometry } from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord } from "./api";

// Prop roles: what a sequencer means by "put Spirals on the mega tree". A port of
// tools/sequence-corpus/roles.mjs, which the corpus priors were measured with, so a role here
// means exactly what it meant there (a test keeps the two tables identical).
//
// Name keywords win over DisplayAs because "Custom" says nothing: it's a snowflake, a face, a
// star. The first match wins, so the order matters.

export const ROLES = [
  ["moving_head", /moving.?head|\bmh-?\d|dmx.?moving|laser|beam/i],
  ["singing_face", /face|mouth|sing|carol(l)?er|santa.?head|elf.?head|snowman.?face|pumpkin.?face|ppd|boscoyo.*(face|santa)|quartet|hattitude|choir/i],
  ["matrix", /matrix|p5|p10|panel|tune.?to|sign|screen|billboard/i],
  ["mega_tree", /mega|big ?tree|bigtree|main ?tree|tree.?360|tree.?270|tree.?180|spiral.?tree|pixel.?tree|tom.?tree/i],
  ["mini_tree", /mini.?tree|tree|tomato|cone|spiral/i],
  ["arch", /arch|rainbow|bridge/i],
  ["cane", /cane/i],
  ["spinner", /spinner|spin|hypnotic|fuzion|showstopper|wheel|pinwheel|flower|lollipop|starburst|burst|rosa|dahlia/i],
  ["snowflake", /flake|snow.?flake|chromaflake|crystal/i],
  ["star", /star|bethlehem|topper/i],
  ["window", /window|win\b|frame|door|garage|porch.?column|column|pillar/i],
  ["outline", /outline|roof|eaves?|eves\b|gutter|peak|ridge|topline|midline|house.?line|line|ledge|fence|rail|trim|rafter|gable|soffit|cornice|border|edge/i],
  ["icicle", /icicle|drip/i],
  ["wreath", /wreath|ring|circle|halo|ornament|bulb|sphere|ball|globe|orb/i],
  ["bush", /bush|shrub|hedge|garland|swag|bow/i],
  ["flood", /flood|wash|par\b|spot/i],
  ["present", /present|gift|box|package|cube/i],
  ["character", /santa|reindeer|rudolph|snowman|elf|grinch|nutcracker|angel|penguin|bear|sleigh|nativity|deer|candy|gingerbread|soldier|train|ghost|bat|spider|witch|skull|pumpkin|tomb|dasher|dancer|prancer|vixen|comet|cupid|donner|blitzen|cactus|wing|merry|noel/i],
  ["pathway", /path|walk|driveway|stake|pole|lamp|mini.?pole|post|ground/i],
  ["whole_house", /^(all|everything|whole|house|full|entire|every|global|main)\b|all.?(props|models|pixels|house|elements)|^all$/i],
] as const;

export type Role = (typeof ROLES)[number][0] | "other";
export const ROLE_NAMES: Role[] = [...ROLES.map(([role]) => role), "other"];
export type Tier = "hero" | "feature" | "frame" | "fill";

const BY_DISPLAY_AS: Record<string, Role> = {
  "Tree 360": "mega_tree", "Tree 270": "mega_tree", "Tree 180": "mega_tree", "Tree Flat": "mega_tree", "Tree Ribbon": "mega_tree", Tree: "mega_tree",
  Matrix: "matrix", "Horiz Matrix": "matrix", "Vert Matrix": "matrix",
  Arches: "arch", "Candy Canes": "cane", Spinner: "spinner", Star: "star", Icicles: "icicle",
  "Window Frame": "window", Wreath: "wreath", Circle: "wreath", Sphere: "wreath", Cube: "present",
  "Single Line": "outline", "Poly Line": "outline", "Channel Block": "flood", Image: "character",
  DmxMovingHeadAdv: "moving_head", DmxMovingHead: "moving_head", DmxMovingHead3D: "moving_head", DmxFloodlight: "flood", DmxFloodArea: "flood", DmxSkull: "character", DmxServo: "character", DmxServo3d: "character",
};

/** A name's role, or null when the name says nothing. */
function roleFromName(name: string): Role | null {
  return ROLES.find(([, re]) => re.test(name))?.[0] ?? null;
}

export function roleOf(name: string, displayAs = ""): Role {
  const byName = roleFromName(name);
  // "Tree 145"/"Tree 180" etc. are DisplayAs for trees; a small one named "tree3" is still a mini tree.
  if (byName === "mini_tree" && displayAs.startsWith("Tree") && /mega|big|main/i.test(name)) return "mega_tree";
  if (byName) return byName;
  if (displayAs.startsWith("Tree")) return "mega_tree";
  return BY_DISPLAY_AS[displayAs] ?? "other";
}

const TIER_BY_ROLE: Record<Role, Tier> = {
  mega_tree: "hero", matrix: "hero", singing_face: "hero",
  spinner: "feature", star: "feature", snowflake: "feature", arch: "feature", cane: "feature", mini_tree: "feature",
  wreath: "feature", present: "feature", character: "feature", moving_head: "feature",
  outline: "frame", window: "frame", icicle: "frame",
  flood: "fill", bush: "fill", pathway: "fill", whole_house: "fill", other: "fill",
};

export interface PropInfo {
  key: string; // "model:12" | "group:3" | "submodel:12/Star"
  name: string;
  role: Role;
  tier: Tier;
  nodes: number;
  /** A line of lights, or a 2D buffer (tree, matrix, spinner, custom). */
  dims: 1 | 2;
  /** Position in the house, 0..1 left to right and bottom to top. */
  x: number;
  y: number;
  side: "left" | "centre" | "right";
  /** Group members' keys. */
  members?: string[];
  /** Set when params.magicRole chose the role rather than the classifier. */
  override?: boolean;
}

function geometryOf(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function dimsOf(geometry: ModelGeometry | null): 1 | 2 {
  if (!geometry) return 1;
  // The render buffer, not the shape on the wall: an arch is a curve in the yard and a line to
  // an effect.
  return geometry.width > 1 && geometry.height > 1 ? 2 : 1;
}

/** A Custom model this dense is a matrix whatever it is called (roles.mjs' rule). */
function isDenseCustom(model: ModelRecord, geometry: ModelGeometry | null): boolean {
  if (!/custom/i.test(model.raw_attrs.DisplayAs ?? model.type) || !geometry || geometry.nodes.length < 150) return false;
  return geometry.nodes.length / Math.max(1, geometry.width * geometry.height) >= 0.45;
}

function validOverride(value: unknown): Role | null {
  return typeof value === "string" && (ROLE_NAMES as string[]).includes(value) ? (value as Role) : null;
}

const sideOf = (x: number): PropInfo["side"] => (x < 0.4 ? "left" : x > 0.6 ? "right" : "centre");

/**
 * Every model, sub-model and group in a layout with its role, tier and place in the house.
 *
 * Node counts come from geometry, not attributes: xLightsAI once promoted 50-pixel stakes to
 * heroes because a node-count attribute lied.
 */
export function propMap(models: readonly ModelRecord[], groups: readonly ModelGroupRecord[]): PropInfo[] {
  const xs = models.map((m) => m.screen.x ?? 0), ys = models.map((m) => m.screen.y ?? 0);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);

  const geometries = new Map(models.map((m) => [m.id, geometryOf(m)]));
  // Trees by size. The name rules are the corpus's, and on a real layout they read backwards: the
  // word "tree" made its two 6,400-node trees mini trees, and DisplayAs made its 29 bare-named
  // 150-node trees mega trees, all heroes lit all song. A Tree model whose name doesn't say mini
  // or mega is a mega tree when it is big (400 nodes and at least half the largest tree), and a
  // mini tree otherwise.
  const isTree = (m: ModelRecord) => (m.raw_attrs.DisplayAs ?? m.type).startsWith("Tree");
  const largestTree = Math.max(0, ...models.filter(isTree).map((m) => geometries.get(m.id)?.nodes.length ?? 0));

  const props: PropInfo[] = [];
  const byModelId = new Map<number, PropInfo>();
  for (const model of models) {
    const geometry = geometries.get(model.id) ?? null;
    const override = validOverride(model.params?.magicRole);
    let role = override ?? roleOf(model.name, model.raw_attrs.DisplayAs ?? model.type);
    if (!override && role === "other" && isDenseCustom(model, geometry)) role = "matrix";
    if (!override && isTree(model) && (role === "mega_tree" || role === "mini_tree") && !/mini|mega|big|main/i.test(model.name)) {
      const nodes = geometry?.nodes.length ?? 0;
      role = nodes >= 400 && nodes >= largestTree / 2 ? "mega_tree" : "mini_tree";
    }
    const x = norm(model.screen.x ?? 0, minX, maxX), y = norm(model.screen.y ?? 0, minY, maxY);
    const prop: PropInfo = {
      key: `model:${model.id}`, name: model.name, role, tier: TIER_BY_ROLE[role],
      nodes: geometry?.nodes.length ?? (model.strings ?? 0) * (model.nodes_per_string ?? 0),
      dims: dimsOf(geometry), x, y, side: sideOf(x), ...(override ? { override: true } : {}),
    };
    props.push(prop);
    byModelId.set(model.id, prop);
    for (const spec of model.sub_models ?? []) {
      const subGeometry = geometry ? computeSubModelGeometry(geometry, spec) : null;
      const subRole = roleFromName(spec.name) ?? role;
      props.push({
        key: `submodel:${model.id}/${spec.name}`, name: `${model.name}/${spec.name}`, role: subRole,
        tier: TIER_BY_ROLE[subRole] === "hero" ? "feature" : TIER_BY_ROLE[subRole],
        nodes: subGeometry?.nodes.length ?? 0, dims: dimsOf(subGeometry), x, y, side: sideOf(x),
      });
    }
  }

  // The outlier cut: a prop at least 1.5x the next largest among the top ten carries the show
  // whatever it is called. At most the top three, so one big cluster can't all become heroes.
  const bySize = props.filter((p) => p.key.startsWith("model:")).sort((a, b) => b.nodes - a.nodes).slice(0, 10);
  const gap = bySize.findIndex((p, i) => i < 3 && i + 1 < bySize.length && p.nodes >= 1.5 * bySize[i + 1]!.nodes);
  if (gap >= 0) for (const prop of bySize.slice(0, gap + 1)) if (prop.role !== "whole_house") prop.tier = "hero";

  for (const group of groups) {
    const members = group.members.map((m) => byModelId.get(m.id)).filter((p): p is PropInfo => !!p);
    const override = validOverride(group.params?.magicRole);
    const counts = new Map<Role, number>();
    for (const m of members) counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
    const [top, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["other", 0];
    // A group is what most of its members are; its name only breaks a tie (LightsAutoSequencer
    // learned that from "EVERYTHING BUT STARBURST"). A mix of three or more kinds with no
    // majority is the whole house, whatever it is called.
    let role: Role;
    if (override) role = override;
    else if (topCount * 2 > members.length) role = top;
    else role = roleFromName(group.name) ?? (counts.size >= 3 ? "whole_house" : top);
    const x = members.length ? members.reduce((s, m) => s + m.x, 0) / members.length : 0.5;
    const y = members.length ? members.reduce((s, m) => s + m.y, 0) / members.length : 0.5;
    props.push({
      key: `group:${group.id}`, name: group.name, role, tier: TIER_BY_ROLE[role],
      nodes: members.reduce((s, m) => s + m.nodes, 0), dims: 2, x, y, side: sideOf(x),
      members: members.map((m) => m.key), ...(override ? { override: true } : {}),
    });
  }
  return props;
}
