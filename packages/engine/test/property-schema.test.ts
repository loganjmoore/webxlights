import { describe, expect, it } from "vitest";
import { computeGeometryFromAttrs } from "../src/models/fromAttrs";
import { MODEL_PROPERTY_SCHEMAS, propertyFieldsFor, propertyValueFor } from "../src/models/propertySchema";

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

// The property grid must read the same attribute names fromAttrs.ts does, or a show saved under
// xLights' pre-2026.04 names shows the schema default next to geometry built from the file's
// real value - "# Strings 16" beside a matrix that is visibly 32 wide.
describe("property values honour the legacy attribute names", () => {
  const stringsField = propertyFieldsFor("Matrix").find((f) => f.key === "NumStrings")!;
  const nodesField = propertyFieldsFor("Matrix").find((f) => f.key === "NodesPerString")!;

  it("falls back to parm1/parm2 when the descriptive name is absent", () => {
    expect(propertyValueFor(stringsField, { parm1: "32", parm2: "100" })).toBe("32");
    expect(propertyValueFor(nodesField, { parm1: "32", parm2: "100" })).toBe("100");
  });

  it("prefers the descriptive name, matching which one the geometry uses", () => {
    expect(propertyValueFor(stringsField, { NumStrings: "8", parm1: "32" })).toBe("8");
  });

  it("still falls back to the schema default when a model carries neither", () => {
    expect(propertyValueFor(stringsField, {})).toBe(stringsField.default);
  });

  it("maps the third field of the types that have one", () => {
    const points = propertyFieldsFor("Star").find((f) => f.key === "StarPoints")!;
    expect(propertyValueFor(points, { parm3: "6" })).toBe("6");
    const bottom = propertyFieldsFor("Window Frame").find((f) => f.key === "BottomNodes")!;
    expect(propertyValueFor(bottom, { parm3: "20" })).toBe("20");
  });
});
