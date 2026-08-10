import { describe, expect, it } from "vitest";
import { defaultParamsFor, EFFECT_SCHEMAS } from "../src/effects/schema";

describe("effect param-schema registry", () => {
  it("On effect schema keys match OnParams field names", () => {
    const keys = EFFECT_SCHEMAS.On!.params.map((p) => p.key);
    expect(keys).toEqual(["startIntensity", "endIntensity", "transparencyPct", "cycles", "shimmer"]);
  });

  it("defaultParamsFor produces a usable OnParams-shaped object", () => {
    const defaults = defaultParamsFor("On");
    expect(defaults).toEqual({
      startIntensity: 100,
      endIntensity: 100,
      transparencyPct: 0,
      cycles: 1,
      shimmer: false,
    });
  });

  it("returns an empty object for an unknown effect name", () => {
    expect(defaultParamsFor("Spirograph")).toEqual({});
  });
});
