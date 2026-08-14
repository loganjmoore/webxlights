import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import type { FrameContext } from "./types";

export interface LightningParams {
  segments: number; // zigzag segments in the bolt
  boltWidth: number; // 1 = a straight vertical line
  forked: boolean;
  topX: number; // 0-100, where the top of the bolt sits across the model
  xMovement: number; // -100..100, drift across the model over the effect
  direction: "down" | "up";
}

// Manual "Lightning": a vertical bolt of zigzag segments. "White is always selected for the
// outer edge of the lightning bolt" - so the palette colours the core and white edges it,
// regardless of what the palette says. That is stated as a fact about the effect, not an option.
export function renderLightning(buffer: RenderBuffer, palette: RGBA[], params: LightningParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const core = palette[0] ?? rgba(180, 180, 255, 255);
  const white = rgba(255, 255, 255, 255);
  const segments = Math.max(1, Math.trunc(params.segments));
  const spread = Math.max(0, params.boltWidth - 1);

  // A new bolt per segment-length of the effect, so the number of segments really does change
  // how often the sky flashes rather than only the shape of one bolt.
  const drift = (params.xMovement / 100) * W * ctx.positionInEffect01;
  const startX = (Math.min(100, Math.max(0, params.topX)) / 100) * (W - 1) + drift;

  const rng = mulberry32(ctx.seed + Math.floor(ctx.positionInEffect01 * segments));
  drawBolt(buffer, startX, core, white, spread, params.direction, rng);

  if (params.forked) {
    // A fork leaves the trunk part way down and heads off at its own angle.
    const forkAt = 0.35 + rng() * 0.3;
    const forkX = startX + (rng() * 2 - 1) * spread * 3;
    drawBolt(buffer, forkX, core, white, spread, params.direction, rng, forkAt);
  }
}

function drawBolt(
  buffer: RenderBuffer,
  startX: number,
  core: RGBA,
  edge: RGBA,
  spread: number,
  direction: "down" | "up",
  rng: () => number,
  startFraction = 0,
): void {
  const { width: W, height: H } = buffer;
  let x = startX;
  const from = Math.floor(startFraction * H);
  for (let step = from; step < H; step++) {
    const y = direction === "down" ? H - 1 - step : step;
    x += (rng() * 2 - 1) * spread;
    const px = Math.round(x);
    buffer.setPixel(px, y, core);
    // The white edge is what makes a bolt read as lightning rather than as a coloured line.
    buffer.setPixel(px - 1, y, edge);
    buffer.setPixel(px + 1, y, edge);
    if (px < -2 || px > W + 2) return; // wandered off the model; stop rather than draw a wall
  }
}
