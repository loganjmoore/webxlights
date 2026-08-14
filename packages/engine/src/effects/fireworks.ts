import { rgba, type RGBA } from "../color";
import type { RenderBuffer } from "../renderBuffer";
import { mulberry32 } from "../rng";
import { audioOf, type FrameContext } from "./types";

export interface FireworksParams {
  explosions: number;
  particles: number;
  velocity: number;
  gravity: number; // 0 = particles coast, higher pulls them down
  particleFade: number; // how quickly a particle dims over its life
  holdColor: boolean; // one colour per explosion rather than per particle
  fireWithMusic: boolean;
  triggerLevel: number; // 0-100, the level the music has to clear
}

// Manual "Fireworks": explosions of particles thrown outward, pulled down by gravity, fading as
// they go. Optionally fired by the music rather than on a timer.
//
// Stateless: a particle's whole flight is a closed form of the time since its explosion -
// position = v*t under constant gravity - so any frame can be computed directly. That matters
// for scrubbing, where a stateful version would have to replay every explosion since the effect
// started just to draw one frame.
export function renderFireworks(buffer: RenderBuffer, palette: RGBA[], params: FireworksParams, ctx: FrameContext): void {
  const { width: W, height: H } = buffer;
  if (W <= 0 || H <= 0) return;

  const explosions = Math.max(1, Math.trunc(params.explosions));
  const particles = Math.max(1, Math.trunc(params.particles));
  const fade = Math.max(1, params.particleFade) / 50;

  if (params.fireWithMusic) {
    const level = audioOf(ctx).level;
    if (level * 100 < params.triggerLevel) return;
  }

  // Explosions are spread evenly across the effect and each burns for a slice of it, so the sky
  // is never empty and never all one flash.
  const lifeSpan = 1 / explosions;
  for (let e = 0; e < explosions; e++) {
    const born = e * lifeSpan;
    const age = ctx.positionInEffect01 - born;
    if (age < 0 || age > lifeSpan) continue;
    const t = (age / lifeSpan) * 10; // seconds-ish since this explosion

    const rng = mulberry32(ctx.seed + e * 7919);
    const originX = rng() * W;
    const originY = H * (0.4 + rng() * 0.5);
    const explosionColor = palette[e % Math.max(palette.length, 1)] ?? rgba(255, 255, 255, 255);

    for (let p = 0; p < particles; p++) {
      const angle = (p / particles) * Math.PI * 2 + rng() * 0.2;
      const speed = (params.velocity / 20) * (0.5 + rng() * 0.5);
      const x = originX + Math.cos(angle) * speed * t;
      // Gravity is the only thing that makes this read as fireworks rather than as an expanding
      // ring: the particles have to arc over and fall.
      const y = originY + Math.sin(angle) * speed * t - (params.gravity / 100) * t * t;

      const brightness = Math.max(0, 1 - t * fade * 0.1);
      if (brightness <= 0) continue;
      const color = params.holdColor ? explosionColor : (palette[p % Math.max(palette.length, 1)] ?? explosionColor);
      buffer.setPixel(Math.round(x), Math.round(y), { ...color, a: Math.round(255 * brightness) });
    }
  }
}
