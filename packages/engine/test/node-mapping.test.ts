import { describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { computeVerticalMatrixTopLeft } from "../src/models/matrix";
import { bufferToNodeColors, nodeColorsToChannelBytes } from "../src/nodeMapping";

describe("Node mapping: buffer -> node colors -> channel bytes", () => {
  it("reads each node's color from its bufX/bufY position", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 2, nodesPerString: 2 });
    const buf = new RenderBuffer(2, 2);
    buf.setPixel(0, 0, rgba(1, 2, 3));
    buf.setPixel(0, 1, rgba(4, 5, 6));
    buf.setPixel(1, 0, rgba(7, 8, 9));
    buf.setPixel(1, 1, rgba(10, 11, 12));

    const colors = bufferToNodeColors(buf, geo);
    expect(colors).toHaveLength(4);
    // node 0 (string 0, index 0): even string, topToBottom -> bufY = height-1-0 = 1
    expect(colors[0]).toEqual(rgba(4, 5, 6));
  });

  it("RGB order remaps channel bytes per node", () => {
    const colors = [rgba(10, 20, 30), rgba(40, 50, 60)];
    const rgb = nodeColorsToChannelBytes(colors, "RGB");
    const grb = nodeColorsToChannelBytes(colors, "GRB");
    expect(Array.from(rgb)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(Array.from(grb)).toEqual([20, 10, 30, 50, 40, 60]);
  });

  it("channel byte array length = nodes x 3 for a standard RGB order", () => {
    const geo = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 10 });
    const buf = new RenderBuffer(geo.width, geo.height);
    const colors = bufferToNodeColors(buf, geo);
    const bytes = nodeColorsToChannelBytes(colors, "RGB");
    expect(bytes.length).toBe(40 * 3);
  });
});
