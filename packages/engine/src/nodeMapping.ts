import type { RGBA } from "./color";
import type { RenderBuffer } from "./renderBuffer";
import type { ModelGeometry } from "./models/types";

// SPEC ch4: buffer bufX/bufY -> node color, in node order (node index = array position).
export function bufferToNodeColors(buffer: RenderBuffer, geometry: ModelGeometry): RGBA[] {
  return geometry.nodes.map((node) => buffer.getPixel(node.bufX, node.bufY));
}

// SPEC ch1 "StringType": color order like "RGB", "GRB", "BRG" etc - each letter names which
// source channel goes in that output byte position.
export function nodeColorsToChannelBytes(colors: RGBA[], rgbOrder = "RGB"): Uint8Array {
  const order = rgbOrder
    .toUpperCase()
    .split("")
    .filter((ch) => ch === "R" || ch === "G" || ch === "B")
    .map((ch) => (ch === "R" ? "r" : ch === "G" ? "g" : "b")) as Array<"r" | "g" | "b">;
  const channelsPerNode = order.length || 3;
  const bytes = new Uint8Array(colors.length * channelsPerNode);
  colors.forEach((c, i) => {
    order.forEach((channel, j) => {
      bytes[i * channelsPerNode + j] = c[channel];
    });
  });
  return bytes;
}
