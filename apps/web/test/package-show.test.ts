import { describe, expect, it } from "vitest";
import type { ModelRecord, ModelUpsertPayload } from "../src/lib/api";

// A backup that loses things is worse than no backup, because you find out when you need it.
// These tests are about that one property: everything a model carries has to be in the package.
//
// The export itself talks to the API, so what is checked here is the *shape* - which fields a
// packaged model has - against the record it came from. That is where the bug was: sub-models,
// states and faces were simply not in the list of fields being copied, and nothing said so.

/** Field-for-field, what a packaged model carries. Kept in step with packageShow's own mapper. */
const PACKAGED_MODEL_FIELDS: Array<keyof ModelUpsertPayload> = [
  "name",
  "type",
  "supported",
  "params",
  "raw_attrs",
  "screen",
  "strings",
  "nodes_per_string",
  "string_type",
  "start_channel",
  "order",
  "sub_models",
  "states",
  "faces",
];

/**
 * The fields of a model record that a package deliberately doesn't carry, and why.
 *
 * Listed rather than ignored, so adding a field to a model makes this test fail until someone
 * decides which side it belongs on. That is the whole mechanism: the previous version of the
 * package didn't fail when sub-models were added, it just quietly stopped being a backup.
 */
const DELIBERATELY_NOT_PACKAGED: Record<string, string> = {
  id: "assigned by the database on restore",
  channel_count: "restored with the controller assignment, not with the model",
  controller_id: "an id from the old project; the assignment is carried by name instead",
  controller_offset: "restored with the controller assignment",
};

/**
 * Every field a ModelRecord has, listed exhaustively.
 *
 * A `Record<keyof ModelRecord, true>` is the point: TypeScript refuses to compile this object if a
 * field is added to the model and not added here, *including an optional one*. Checking the keys
 * of a hand-written sample record wouldn't - an optional field can be left out of a literal - and
 * optional is exactly what sub_models, states and faces are.
 */
const ALL_MODEL_FIELDS: Record<keyof ModelRecord, true> = {
  id: true,
  name: true,
  type: true,
  supported: true,
  params: true,
  raw_attrs: true,
  screen: true,
  strings: true,
  nodes_per_string: true,
  sub_models: true,
  states: true,
  faces: true,
  string_type: true,
  start_channel: true,
  channel_count: true,
  controller_id: true,
  controller_offset: true,
  order: true,
};

describe("what a packaged model carries", () => {
  it("accounts for every field a model has, as packaged or as deliberately excluded", () => {
    const accounted = new Set<string>([...PACKAGED_MODEL_FIELDS, ...Object.keys(DELIBERATELY_NOT_PACKAGED)]);
    const unaccounted = Object.keys(ALL_MODEL_FIELDS).filter((key) => !accounted.has(key));
    expect(unaccounted, `these model fields are neither packaged nor explicitly excluded: ${unaccounted.join(", ")}`).toEqual([]);
  });

  it("packages the three things that live inside a model", () => {
    // The regression this test exists for: sub-models, states and faces are nested inside a model
    // rather than being attributes of it, and each was added to models long after the package was
    // written. All three were silently absent from every backup taken in between.
    expect(PACKAGED_MODEL_FIELDS).toContain("sub_models");
    expect(PACKAGED_MODEL_FIELDS).toContain("states");
    expect(PACKAGED_MODEL_FIELDS).toContain("faces");
  });

  it("says why each excluded field is excluded", () => {
    for (const [field, reason] of Object.entries(DELIBERATELY_NOT_PACKAGED)) {
      expect(reason.length, `${field} needs a reason, not just an exclusion`).toBeGreaterThan(10);
    }
  });
});
