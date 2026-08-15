import { RenderBuffer } from "./renderBuffer";
import { blendPixel, isCanvasMode, type BlendMode } from "./blend";
import { bufferToNodeColors, nodeColorsToBuffer } from "./nodeMapping";
import { rgba, type RGBA } from "./color";
import type { ModelGeometry } from "./models/types";

export interface LayerSpec {
  render: (buffer: RenderBuffer) => void; // caller-supplied closure invoking the effect fn
  blendMode: BlendMode;
  effectMixThreshold: number; // 0..1, "Mix" slider / Morph position
}

// The manual: "Each model may have a up to 200 layers of effects." This was 5, from the original
// milestone scope, and 5 is low enough to be reached by an imported sequence rather than only by
// someone being unreasonable.
export const MAX_LAYERS = 200;

// SPEC ch9 §5.2: bottom-to-top layer composite. Each layer renders into its own scratch
// buffer, then blends onto the accumulated result (bg) using its Layer Method.
export function renderLayerStack(width: number, height: number, layers: LayerSpec[]): RenderBuffer {
  if (layers.length > MAX_LAYERS) throw new Error(`renderLayerStack: ${layers.length} layers exceeds the cap of ${MAX_LAYERS}`);

  const result = new RenderBuffer(width, height);
  for (const layer of layers) {
    const layerBuffer = new RenderBuffer(width, height);
    layer.render(layerBuffer);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fg = layerBuffer.getPixel(x, y);
        const bg = result.getPixel(x, y);
        result.setPixel(x, y, blendPixel(fg, bg, layer.blendMode, layer.effectMixThreshold));
      }
    }
  }
  return result;
}


export interface NodeLayerSpec extends LayerSpec {
  /** The buffer this layer renders into, which its render style may have reshaped. */
  geometry: ModelGeometry;
}

// Where a node sits along the axis a positional blend mode reads, 0..1. Measured in *buffer*
// space rather than yard space, because that is what "bottom" and "left" mean for a layer - the
// same convention every other layer setting uses.
function positionForBlend(mode: BlendMode, geo: ModelGeometry, index: number): number {
  if (mode !== "Bottom-Top" && mode !== "Left-Right") return 0.5;
  const node = geo.nodes[index];
  if (!node) return 0.5;
  return mode === "Bottom-Top"
    ? geo.height > 1
      ? node.bufY / (geo.height - 1)
      : 0.5
    : geo.width > 1
      ? node.bufX / (geo.width - 1)
      : 0.5;
}

// Composites layers in *node* space rather than buffer space.
//
// Buffer-space compositing assumes every layer shares one buffer, which stops being true the
// moment render styles exist: one layer may be drawing into a 16x50 grid while the layer under
// it draws into a single-pixel buffer or a one-row line. Each layer is therefore rendered into
// its own buffer, resolved to a colour per node, and blended there.
//
// For layers that all use the Default style this is identical to the old path - blending is
// per-pixel and the mapping is per-node, so blending before or after the mapping gives the same
// answer when the mapping is shared.
export function renderLayerStackToNodes(nodeCount: number, layers: NodeLayerSpec[]): RGBA[] {
  if (layers.length > MAX_LAYERS) throw new Error(`renderLayerStackToNodes: ${layers.length} layers exceeds the cap of ${MAX_LAYERS}`);

  const result: RGBA[] = new Array(nodeCount).fill(null).map(() => rgba(0, 0, 0, 0));
  for (const layer of layers) {
    const buffer = new RenderBuffer(layer.geometry.width, layer.geometry.height);
    // A Canvas layer is handed what the layers underneath it drew, rather than a blank buffer.
    // That is the whole mechanism behind the effects that modify the layer below - Kaleidoscope,
    // which the manual says "by itself does nothing", Warp and Adjust - and it is why they can't
    // be written as ordinary effects: an ordinary effect's buffer starts empty.
    if (isCanvasMode(layer.blendMode)) nodeColorsToBuffer(result, layer.geometry, buffer);
    layer.render(buffer);
    const colors = bufferToNodeColors(buffer, layer.geometry);
    for (let i = 0; i < nodeCount; i++) {
      const fg = colors[i];
      if (!fg) continue;
      result[i] = blendPixel(
        fg,
        result[i]!,
        layer.blendMode,
        layer.effectMixThreshold,
        positionForBlend(layer.blendMode, layer.geometry, i),
      );
    }
  }
  return result;
}
