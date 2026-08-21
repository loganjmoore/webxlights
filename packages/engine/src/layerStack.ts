import { RenderBuffer } from "./renderBuffer";
import { blendPixel, blendPixelInto, isCanvasMode, type BlendMode } from "./blend";
import { nodeColorsToBuffer } from "./nodeMapping";
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
/**
 * Reusable scratch for the compositor, owned by whoever renders repeatedly (a row sequencer, a
 * playback loop) and threaded through renderLayerStackToNodes.
 *
 * A full render allocated a fresh buffer per layer per frame plus a colour object per node per
 * layer, and the profile showed the garbage collector taking 11% of the whole render for it.
 * Buffers are keyed by shape because layers with different render styles draw into differently
 * shaped buffers; each is zeroed before reuse, which is cheaper than reallocating by the width
 * of a typed-array fill.
 */
export interface LayerScratch {
  buffers: Map<string, RenderBuffer>;
}

export function createLayerScratch(): LayerScratch {
  return { buffers: new Map() };
}

export function renderLayerStackToNodes(nodeCount: number, layers: NodeLayerSpec[], scratch?: LayerScratch): RGBA[] {
  if (layers.length > MAX_LAYERS) throw new Error(`renderLayerStackToNodes: ${layers.length} layers exceeds the cap of ${MAX_LAYERS}`);

  const result: RGBA[] = new Array(nodeCount).fill(null).map(() => rgba(0, 0, 0, 0));
  const fg = rgba(0, 0, 0, 0); // one reused read target - blendPixelInto copies what it needs
  for (const layer of layers) {
    const { width, height } = layer.geometry;
    let buffer: RenderBuffer;
    if (scratch) {
      const key = `${width}x${height}`;
      const kept = scratch.buffers.get(key);
      if (kept) {
        kept.clear();
        buffer = kept;
      } else {
        buffer = new RenderBuffer(width, height);
        scratch.buffers.set(key, buffer);
      }
    } else {
      buffer = new RenderBuffer(width, height);
    }
    // A Canvas layer is handed what the layers underneath it drew, rather than a blank buffer.
    // That is the whole mechanism behind the effects that modify the layer below - Kaleidoscope,
    // which the manual says "by itself does nothing", Warp and Adjust - and it is why they can't
    // be written as ordinary effects: an ordinary effect's buffer starts empty.
    if (isCanvasMode(layer.blendMode)) nodeColorsToBuffer(result, layer.geometry, buffer);
    layer.render(buffer);
    // Reading each node's colour straight out of the buffer and blending in place, rather than
    // materialising a colours array per layer - same values, none of the per-node allocations.
    const nodes = layer.geometry.nodes;
    const positional = layer.blendMode === "Bottom-Top" || layer.blendMode === "Left-Right";
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes[i];
      if (!node) continue;
      buffer.readInto(node.bufX, node.bufY, fg);
      blendPixelInto(
        fg,
        result[i]!,
        layer.blendMode,
        layer.effectMixThreshold,
        positional ? positionForBlend(layer.blendMode, layer.geometry, i) : 0.5,
        result[i]!,
      );
    }
  }
  return result;
}
