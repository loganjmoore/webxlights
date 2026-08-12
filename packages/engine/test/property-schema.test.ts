import { describe, expect, it } from "vitest";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import { MODEL_PROPERTY_SCHEMAS } from "../src/models/propertySchema";

// This schema and fromAttrs.ts's switch are two hand-maintained lists of the same thing (which
// raw_attrs keys a type reads) - this is the trip-wire that catches them drifting apart.
// (packages/formats' SUPPORTED_DISPLAY_AS list is the source of truth for "every type that
// should have a schema"; not imported here to avoid a new cross-package test dependency for
// a check the M15.1 rgbeffects.test.ts fixture-shape tests already cover from the other side.)
describe("MODEL_PROPERTY_SCHEMAS", () => {
  it("every field's own default reproduces fromAttrs.ts's undocumented-attrs fallback geometry", () => {
    for (const [displayAs, fields] of Object.entries(MODEL_PROPERTY_SCHEMAS)) {
      const defaultAttrs = Object.fromEntries(fields.map((f) => [f.key, String(f.default)]));
      const fromDefaults = computeGeometryFromAttrs(displayAs, defaultAttrs);
      const fromEmpty = computeGeometryFromAttrs(displayAs, {});
      expect(fromDefaults!.nodes.length, `${displayAs} default fields`).toBe(fromEmpty!.nodes.length);
    }
  });
});
