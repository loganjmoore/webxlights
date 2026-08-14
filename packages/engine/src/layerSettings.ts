import { RenderBuffer } from "./renderBuffer";
import { rgba, type RGBA } from "./color";

// xLights' Layer Settings panel (manual, Sequencer > Layers > Layer Settings). These are the
// per-layer knobs that sit between an effect and the model it lands on, and they are worth far
// more than any one effect because they apply to every effect at once: the same Fire that
// currently fills a whole house can be turned sideways, softened, or confined to the left half
// of it without Fire knowing any of it happened.
//
// Implemented here: Transformation, Blur, Sub Buffer and Roto-Zoom. Render Style lives in
// renderStyle.ts, because it changes where the *nodes* sit in the buffer rather than what gets
// drawn into it; Persistent lives in renderFrame.ts, because it is the one setting that is about
// time rather than about a single frame.

export type LayerTransform =
  | "None"
  | "Rotate CW 90"
  | "Rotate CC 90"
  | "Rotate 180"
  | "Flip Horizontal"
  | "Flip Vertical";

export const LAYER_TRANSFORMS: LayerTransform[] = [
  "None",
  "Rotate CW 90",
  "Rotate CC 90",
  "Rotate 180",
  "Flip Horizontal",
  "Flip Vertical",
];

/**
 * The area of the model an effect is allowed to use, as percentages of the full buffer.
 * xLights' own control is a draggable box over a picture of the buffer; the numbers behind it
 * are these four.
 */
export interface SubBuffer {
  x1: number; // 0..100, left
  y1: number; // 0..100, bottom
  x2: number; // 0..100, right
  y2: number; // 0..100, top
}

/** xLights' Roto-Zoom panel: turn and scale the effect within its own buffer. */
export interface RotoZoom {
  /** Degrees, positive anticlockwise, matching the engine's rotation convention. */
  rotation?: number;
  /** 1 = unchanged. Above 1 magnifies the effect, below shrinks it. */
  zoom?: number;
  /** Where the turn and the zoom happen, as percentages of the buffer. Defaults to the centre. */
  pivotX?: number;
  pivotY?: number;
}

export interface LayerSettings {
  /** Which buffer layout the effect renders into (renderStyle.ts). */
  renderStyle?: import("./renderStyle").RenderStyle;
  transform?: LayerTransform;
  /** 1 = untouched. Higher averages each pixel with more of its neighbours. */
  blur?: number;
  subBuffer?: SubBuffer;
  rotoZoom?: RotoZoom;
  /**
   * Don't clear the buffer between frames, so each frame layers on top of the last.
   *
   * The manual's own description: "The term came from high persistence scopes where each trace
   * just kept layering on top of previous traces." Handled in renderFrame.ts rather than here,
   * because it is the only layer setting that is about *time* rather than about one frame.
   */
  persistent?: boolean;
}

export const FULL_SUB_BUFFER: SubBuffer = { x1: 0, y1: 0, x2: 100, y2: 100 };

export function isFullSubBuffer(sub: SubBuffer | undefined): boolean {
  if (!sub) return true;
  return sub.x1 <= 0 && sub.y1 <= 0 && sub.x2 >= 100 && sub.y2 >= 100;
}

/** The pixel rectangle a sub-buffer selects out of a buffer of the given size. */
export function subBufferRect(
  sub: SubBuffer | undefined,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (!sub) return { x: 0, y: 0, width, height };
  const clampPct = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);
  const left = Math.round((clampPct(Math.min(sub.x1, sub.x2)) / 100) * width);
  const right = Math.round((clampPct(Math.max(sub.x1, sub.x2)) / 100) * width);
  const bottom = Math.round((clampPct(Math.min(sub.y1, sub.y2)) / 100) * height);
  const top = Math.round((clampPct(Math.max(sub.y1, sub.y2)) / 100) * height);
  // A collapsed selection still has to be renderable - an effect asked to draw into a zero-wide
  // buffer would divide by its own width. One pixel is the smallest honest answer.
  return {
    x: Math.min(left, Math.max(0, width - 1)),
    y: Math.min(bottom, Math.max(0, height - 1)),
    width: Math.max(1, right - left),
    height: Math.max(1, top - bottom),
  };
}

// Transformation maps every destination pixel back to a source pixel. Sampling backwards rather
// than scattering forwards means the result has no holes when a rotation lands a non-square
// buffer on differently-shaped ground: a 50x5 line rotated 90 degrees has to end up somewhere,
// and stretching it to fill the space it was given is what "rotate the effect" means on a model
// whose shape can't rotate with it.
function sourceFor(
  transform: LayerTransform,
  x: number,
  y: number,
  width: number,
  height: number,
): { sx: number; sy: number } {
  const lastX = Math.max(width - 1, 1);
  const lastY = Math.max(height - 1, 1);
  switch (transform) {
    case "Flip Horizontal":
      return { sx: width - 1 - x, sy: y };
    case "Flip Vertical":
      return { sx: x, sy: height - 1 - y };
    case "Rotate 180":
      return { sx: width - 1 - x, sy: height - 1 - y };
    // Sampling backwards, so each case is the *inverse* of the turn it names. Buffer coordinates
    // are y-up (renderBuffer.ts), so a clockwise turn sends the top-left corner to the top-right
    // one - the direction that looks clockwise on screen, not in a y-down image convention.
    case "Rotate CW 90":
      return { sx: Math.round(((lastY - y) / lastY) * lastX), sy: Math.round((x / lastX) * lastY) };
    case "Rotate CC 90":
      return { sx: Math.round((y / lastY) * lastX), sy: Math.round(((lastX - x) / lastX) * lastY) };
    default:
      return { sx: x, sy: y };
  }
}

export function applyTransform(buffer: RenderBuffer, transform: LayerTransform | undefined): void {
  if (!transform || transform === "None") return;
  const { width, height } = buffer;
  const source: RGBA[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) source.push(buffer.getPixel(x, y));
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { sx, sy } = sourceFor(transform, x, y, width, height);
      buffer.setPixel(x, y, source[sy * width + sx]!);
    }
  }
}

// A box blur, averaged over the square of side 2r+1 centred on each pixel. Colour is weighted by
// alpha so a bright pixel next to a transparent one spreads its colour instead of being dragged
// towards black - averaging straight RGB is what makes naive blurs look muddy.
export function applyBlur(buffer: RenderBuffer, blur: number | undefined): void {
  const radius = Math.floor((blur ?? 1) - 1);
  if (radius < 1) return;
  const { width, height } = buffer;
  const source: RGBA[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) source.push(buffer.getPixel(x, y));
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      let samples = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= width) continue;
          const p = source[sy * width + sx]!;
          r += p.r * p.a;
          g += p.g * p.a;
          b += p.b * p.a;
          a += p.a;
          weight += p.a;
          samples++;
        }
      }
      if (samples === 0) continue;
      buffer.setPixel(
        x,
        y,
        weight > 0
          ? rgba(Math.round(r / weight), Math.round(g / weight), Math.round(b / weight), Math.round(a / samples))
          : rgba(0, 0, 0, 0),
      );
    }
  }
}

// Turns and scales what the effect drew, about a pivot. Sampled backwards from each destination
// pixel like the transformation above, and for the same reason: scattering forwards leaves holes
// wherever the source grid stretches.
export function applyRotoZoom(buffer: RenderBuffer, rotoZoom: RotoZoom | undefined): void {
  if (!rotoZoom) return;
  const rotation = rotoZoom.rotation ?? 0;
  const zoom = rotoZoom.zoom ?? 1;
  if (rotation === 0 && zoom === 1) return;

  const { width, height } = buffer;
  const source: RGBA[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) source.push(buffer.getPixel(x, y));
  }

  const px = ((rotoZoom.pivotX ?? 50) / 100) * (width - 1);
  const py = ((rotoZoom.pivotY ?? 50) / 100) * (height - 1);
  // The inverse transform: undo the zoom, then undo the turn.
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const scale = zoom === 0 ? 1 : 1 / zoom;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - px) * scale;
      const dy = (y - py) * scale;
      const sx = Math.round(px + dx * cos - dy * sin);
      const sy = Math.round(py + dx * sin + dy * cos);
      const inside = sx >= 0 && sx < width && sy >= 0 && sy < height;
      buffer.setPixel(x, y, inside ? source[sy * width + sx]! : rgba(0, 0, 0, 0));
    }
  }
}

/**
 * Runs one layer's effect through its settings and lands the result on `target`.
 *
 * The sub-buffer is applied by giving the effect a *smaller buffer to render into*, not by
 * masking afterwards. That distinction is the manual's own: "the entire effect is rendered based
 * on this new model size, whereas a mask covers up what you specify". A Bars effect confined to
 * the top half draws all its bars in that half rather than showing the top half of a full-size
 * set of bars.
 */
export function renderWithLayerSettings(
  target: RenderBuffer,
  settings: LayerSettings | undefined,
  render: (buffer: RenderBuffer) => void,
): void {
  if (!settings || (isFullSubBuffer(settings.subBuffer) && !settings.transform && !settings.blur && !settings.rotoZoom)) {
    render(target);
    return;
  }

  const rect = subBufferRect(settings.subBuffer, target.width, target.height);
  const work = rect.width === target.width && rect.height === target.height ? target : new RenderBuffer(rect.width, rect.height);
  render(work);
  applyTransform(work, settings.transform);
  applyRotoZoom(work, settings.rotoZoom);
  applyBlur(work, settings.blur);

  if (work === target) return;
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      target.setPixel(rect.x + x, rect.y + y, work.getPixel(x, y));
    }
  }
}
