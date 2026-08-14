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
    // Deliberately not a real xLights effect. This used to name Spirograph, which stopped being
    // unknown the moment it was implemented - a placeholder that quietly becomes real is worse
    // than a nonsense one, because the test starts asserting the opposite of its own name.
    expect(defaultParamsFor("Not An Effect")).toEqual({});
  });
});
