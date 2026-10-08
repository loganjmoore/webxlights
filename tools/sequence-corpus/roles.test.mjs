import { test } from "node:test";
import assert from "node:assert/strict";
import { roleOf } from "./roles.mjs";

// Real names from the corpus layouts, with what a sequencer would call them.
test("names win over DisplayAs", () => {
  assert.equal(roleOf("Boscoyo ChromaFlake 24 3 prong", "Custom"), "snowflake");
  assert.equal(roleOf("BIGTREE", "Tree 360"), "mega_tree");
  assert.equal(roleOf("tree3", "Tree 180"), "mini_tree");
  assert.equal(roleOf("Spiral mini-2", "Custom"), "mini_tree");
  assert.equal(roleOf("all canes", ""), "cane");
  assert.equal(roleOf("All House Lines", ""), "outline");
  assert.equal(roleOf("Hattitude Quartet", "Custom"), "singing_face");
  assert.equal(roleOf("FLOODLIGHT 5", "Single Line"), "flood");
  assert.equal(roleOf("all", ""), "whole_house");
});

test("DisplayAs decides when the name says nothing", () => {
  assert.equal(roleOf("Prop 7", "Arches"), "arch");
  assert.equal(roleOf("Prop 8", "Horiz Matrix"), "matrix");
  assert.equal(roleOf("MH-1", "DmxMovingHeadAdv"), "moving_head");
  assert.equal(roleOf("bundle_col8_row3", "Custom"), "other");
});
