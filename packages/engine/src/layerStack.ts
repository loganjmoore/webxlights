import { RenderBuffer } from "./renderBuffer";
import { blendPixel, type BlendMode } from "./blend";

export interface LayerSpec {
  render: (buffer: RenderBuffer) => void; // caller-supplied closure invoking the effect fn
  blendMode: BlendMode;
  effectMixThreshold: number; // 0..1, "Mix" slider / Morph position
}

const MAX_LAYERS = 5; // SPEC ch9 / goal prompt M3 scope

// SPEC ch9 §5.2: bottom-to-top layer composite. Each layer renders into its own scratch
// buffer, then blends onto the accumulated result (bg) using its Layer Method.
export function renderLayerStack(width: number, height: number, layers: LayerSpec[]): RenderBuffer {
  if (layers.length > MAX_LAYERS) throw new Error(`renderLayerStack: ${layers.length} layers exceeds the M3 cap of ${MAX_LAYERS}`);

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
