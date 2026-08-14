import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import type { FrameContext } from "./types";

export interface TreeEffectParams {
  branches: number;
  speed: number;
  showTreeLights: boolean;
}

// Manual "Tree": "creates a series of zigzag branches against a colored background... The first
// color selected will be used as the background color for the model (i.e. the mega tree).
// Subsequent color(s) will be used for each branch."
//
// That colour rule is the whole shape of this effect and is the opposite of the usual one, where
// palette[0] is simply the first colour an effect draws with. Here it is the ground the branches
// are drawn on, so a two-colour palette gives one background and one branch colour rather than
// two branch colours.
export function renderTreeEffect(buffer: RenderBuffer, palette: RGBA[], params: TreeEffectParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const background = palette[0] ?? rgba(0, 60, 0, 255);
  const branchColors = palette.length > 1 ? palette.slice(1) : [rgba(255, 255, 255, 255)];
  if (params.showTreeLights) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buffer.setPixel(x, y, background);
  }

  const branches = Math.max(1, Math.trunc(params.branches));
  const phase = (ctx.frameIndexInEffect * Math.max(1, params.speed)) / 120;

  for (let b = 0; b < branches; b++) {
    const color = branchColors[b % branchColors.length]!;
    // Branches sit at even heights and zigzag across the model, each offset from the last so
    // they read as separate branches rather than as one thick band.
    const y = Math.round(((b + 0.5) / branches) * (H - 1));
    for (let x = 0; x < W; x++) {
      const wobble = Math.sin(((x / Math.max(1, W - 1)) * Math.PI * 4) + phase + b) * (H / (branches * 2));
      const py = Math.round(y + wobble);
      if (py >= 0 && py < H) buffer.setPixel(x, py, color);
    }
  }
}
