// Prop roles: what a sequencer means by "put Spirals on the mega tree". A user's layout and an
// author's layout share no names, so effects transfer between them by role, never by model name.
// Name keywords win over DisplayAs because "Custom" says nothing (it's a snowflake, a face, a
// star...). Order matters: the first match wins.
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
];

const BY_DISPLAY_AS = {
  "Tree 360": "mega_tree", "Tree 270": "mega_tree", "Tree 180": "mega_tree", "Tree Flat": "mega_tree", "Tree Ribbon": "mega_tree", Tree: "mega_tree",
  Matrix: "matrix", "Horiz Matrix": "matrix", "Vert Matrix": "matrix",
  Arches: "arch", "Candy Canes": "cane", Spinner: "spinner", Star: "star", Icicles: "icicle",
  "Window Frame": "window", Wreath: "wreath", Circle: "wreath", Sphere: "wreath", Cube: "present",
  "Single Line": "outline", "Poly Line": "outline", "Channel Block": "flood", Image: "character",
  DmxMovingHeadAdv: "moving_head", DmxMovingHead: "moving_head", DmxMovingHead3D: "moving_head", DmxFloodlight: "flood", DmxFloodArea: "flood", DmxSkull: "character", DmxServo: "character", DmxServo3d: "character",
};

export function roleOf(name, displayAs) {
  const n = String(name ?? "");
  // "Tree 145"/"Tree 180" etc. are DisplayAs for trees; a small one named "tree3" is still a mini tree.
  for (const [role, re] of ROLES) {
    if (re.test(n)) {
      if (role === "mini_tree" && /^Tree/.test(displayAs ?? "") && /mega|big|main/i.test(n)) return "mega_tree";
      return role;
    }
  }
  if (displayAs && /^Tree/.test(displayAs)) return "mega_tree";
  return BY_DISPLAY_AS[displayAs] ?? "other";
}

export const ROLE_NAMES = ROLES.map(([r]) => r).concat(["other"]);
