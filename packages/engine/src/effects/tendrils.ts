import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { AudioFrame } from "../audio";

export type TendrilMovement =
  | "Random"
  | "Square"
  | "Circle"
  | "Horizontal Zig Zag"
  | "Vertical Zig Zag"
  | "Music Line"
  | "Music Circle";

export const TENDRIL_MOVEMENTS: TendrilMovement[] = [
  "Random",
  "Square",
  "Circle",
  "Horizontal Zig Zag",
  "Vertical Zig Zag",
  "Music Line",
  "Music Circle",
];

export interface TendrilsParams {
  movement: TendrilMovement;
  tuneMovement: number; // 1-20; means something different per movement, per the manual
  thickness: number; // pixels
  friction: number; // 0-20, low = the surface holds the string still
  dampening: number; // 0-20, how fast the string straightens out behind the head
  tension: number; // 0-20, low = the tail stays put
  trails: number; // extra strings, "a partially unravelled rope"
  length: number; // segments
  speed: number; // 1-10, 10 is full speed
  horizontalOffset: number; // -100..100
  verticalOffset: number;
}

interface Segment {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TendrilsState {
  strings: Segment[][];
  frame: number;
  seed: number;
  target: { x: number; y: number };
}

// Manual "Tendrils": "a twisting threadlike structure", simulated as a string dragged across a
// surface - the head is moved by the chosen pattern and every segment behind it follows, held
// back by friction and pulled straight by dampening and tension.
//
// Stateful, and it has to be: the whole effect *is* the string's history. A frame computed from
// the frame index alone would have no memory of where the string had been, which is the only
// thing that makes it a tendril rather than a moving dot.
//
// "Only one color can be used for the effect", per the manual, so this takes palette[0]. The
// extra Trails strings are dimmed copies rather than differently-coloured ones.
export function createTendrilsState(width: number, height: number, params: TendrilsParams, seed: number): TendrilsState {
  const rng = mulberry32(seed);
  const count = 1 + Math.max(0, Math.trunc(params.trails));
  const length = Math.max(2, Math.trunc(params.length));
  const strings: Segment[][] = [];
  for (let s = 0; s < count; s++) {
    const x = width / 2 + (rng() - 0.5) * 2;
    const y = height / 2 + (rng() - 0.5) * 2;
    strings.push(Array.from({ length }, () => ({ x, y, vx: 0, vy: 0 })));
  }
  return { strings, frame: 0, seed, target: { x: width / 2, y: height / 2 } };
}

export function renderTendrils(
  buffer: RenderBuffer,
  palette: RGBA[],
  params: TendrilsParams,
  state: TendrilsState,
  audio: AudioFrame | undefined,
): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const color = palette[0] ?? rgba(255, 255, 255, 255);
  // "Speed: 10 is full speed" - below that the string is stepped on only some frames, which is
  // what slows the movement without also shortening the trail.
  const speed = Math.max(1, Math.min(10, Math.round(params.speed || 10)));
  const stepping = state.frame % Math.max(1, Math.round(10 / speed)) === 0;

  if (stepping) {
    state.target = headTarget(params, state, W, H, audio);
    for (const string of state.strings) step(string, state.target, params, W, H);
  }
  state.frame++;

  const thickness = Math.max(1, Math.trunc(params.thickness));
  state.strings.forEach((string, index) => {
    // The first string is the tendril; the rest are the unravelled strands, drawn dimmer so the
    // shape still reads as one rope rather than as several separate tendrils.
    const alpha = index === 0 ? 255 : Math.round(255 * 0.5);
    for (let i = 1; i < string.length; i++) {
      drawSegment(buffer, string[i - 1]!, string[i]!, { ...color, a: alpha }, thickness);
    }
  });
}

// Where the head is being pulled towards this frame. The movements are the manual's own list;
// Tune Movement means something different in each, which is exactly what the manual says of it
// ("larger values make Square movement slower but Circle movement faster").
function headTarget(
  params: TendrilsParams,
  state: TendrilsState,
  width: number,
  height: number,
  audio: AudioFrame | undefined,
): { x: number; y: number } {
  const tune = Math.max(1, params.tuneMovement || 1);
  const ox = (params.horizontalOffset / 100) * width;
  const oy = (params.verticalOffset / 100) * height;
  const t = state.frame;
  const level = audio?.level ?? 0;

  switch (params.movement) {
    case "Square": {
      // Around the corners anticlockwise, one edge at a time. A larger tune spends more frames
      // on each edge, which is what makes it slower.
      const perEdge = tune * 8;
      const edge = Math.floor(t / perEdge) % 4;
      const u = (t % perEdge) / perEdge;
      const corners: Array<[number, number]> = [
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1],
      ];
      const from = corners[edge]!;
      const to = corners[(edge + 1) % 4]!;
      return { x: from[0] + (to[0] - from[0]) * u + ox, y: from[1] + (to[1] - from[1]) * u + oy };
    }
    case "Circle": {
      const angle = (t * tune) / 40;
      return {
        x: width / 2 + Math.cos(angle) * (width / 2 - 1) + ox,
        y: height / 2 + Math.sin(angle) * (height / 2 - 1) + oy,
      };
    }
    case "Horizontal Zig Zag": {
      const period = tune * 20;
      const u = triangle((t % period) / period);
      return { x: u * (width - 1) + ox, y: height / 2 + Math.sin(t / 6) * (height / 4) + oy };
    }
    case "Vertical Zig Zag": {
      const period = tune * 20;
      const u = triangle((t % period) / period);
      return { x: width / 2 + Math.sin(t / 6) * (width / 4) + ox, y: u * (height - 1) + oy };
    }
    case "Music Line":
      // "vertical position responds to the intensity of the associated music"
      return { x: ((t * tune) / 20) % width + ox, y: level * (height - 1) + oy };
    case "Music Circle": {
      const angle = (t * tune) / 40;
      const radius = level * (Math.min(width, height) / 2 - 1);
      return { x: width / 2 + Math.cos(angle) * radius + ox, y: height / 2 + Math.sin(angle) * radius + oy };
    }
    default: {
      // Random: "randomly moved somewhere else on the model" - a new destination every so often
      // rather than every frame, or the head jitters in place instead of travelling.
      const hold = tune * 5;
      const rng = mulberry32(state.seed + Math.floor(t / hold) * 7919);
      return { x: rng() * (width - 1) + ox, y: rng() * (height - 1) + oy };
    }
  }
}

function triangle(u: number): number {
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

// The string itself. The head chases the target; every other segment chases the one ahead of it.
//
// Friction is inverted on purpose: the manual describes it as "how much the surface resists the
// string moving", with low values giving minimal movement, so a low Friction setting is a high
// physical drag. Naming it after the setting rather than the physics is what keeps the control
// behaving the way the manual says it does.
function step(string: Segment[], target: { x: number; y: number }, params: TendrilsParams, width: number, height: number): void {
  const drag = 1 - Math.min(0.95, Math.max(0.02, (params.friction || 10) / 21));
  const dampening = Math.min(1, Math.max(0.01, (params.dampening || 10) / 20));
  const tension = Math.min(1, Math.max(0.01, (params.tension || 10) / 20));

  const head = string[0]!;
  head.vx = (head.vx + (target.x - head.x) * 0.12) * (1 - drag);
  head.vy = (head.vy + (target.y - head.y) * 0.12) * (1 - drag);
  head.x += head.vx;
  head.y += head.vy;

  for (let i = 1; i < string.length; i++) {
    const seg = string[i]!;
    const ahead = string[i - 1]!;
    // Dampening pulls a segment back into line with the one in front; tension governs how much
    // of that pull actually reaches the tail, so a low tension leaves the far end trailing.
    const follow = dampening * (1 - (i / string.length) * (1 - tension));
    seg.vx = (seg.vx + (ahead.x - seg.x) * follow) * (1 - drag);
    seg.vy = (seg.vy + (ahead.y - seg.y) * follow) * (1 - drag);
    seg.x += seg.vx;
    seg.y += seg.vy;
  }

  // The string is pinned to the model rather than allowed to wander off it, so a wild flap comes
  // back instead of leaving the buffer empty for the rest of the effect.
  for (const seg of string) {
    seg.x = Math.max(0, Math.min(width - 1, seg.x));
    seg.y = Math.max(0, Math.min(height - 1, seg.y));
  }
}

function drawSegment(buffer: RenderBuffer, from: Segment, to: Segment, color: RGBA, thickness: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  const reach = Math.floor((thickness - 1) / 2);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = Math.round(from.x + dx * u);
    const y = Math.round(from.y + dy * u);
    for (let ty = -reach; ty <= reach; ty++) {
      for (let tx = -reach; tx <= reach; tx++) buffer.setPixel(x + tx, y + ty, color);
    }
  }
}
