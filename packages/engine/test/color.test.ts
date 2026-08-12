import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, DEFAULT_PALETTE_HEX, hexToRgba, rgba, rgbaToHex } from "../src/color";

describe("hex <-> RGBA", () => {
  it("round-trips a hex color through RGBA", () => {
    expect(hexToRgba("#ff9900")).toEqual(rgba(255, 153, 0, 255));
    expect(rgbaToHex(rgba(255, 153, 0))).toBe("#ff9900");
  });

  it("DEFAULT_PALETTE is DEFAULT_PALETTE_HEX parsed, not an independent literal", () => {
    expect(DEFAULT_PALETTE).toEqual(DEFAULT_PALETTE_HEX.map(hexToRgba));
  });
});
