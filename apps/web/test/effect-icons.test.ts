import { describe, expect, it } from "vitest";
import { EFFECT_SCHEMAS } from "@webxlights/engine";
import { effectIcon, hasEffectIcon } from "../src/lib/effectIcons";

describe("the palette's glyphs", () => {
  it("has one for every effect in the palette", () => {
    // A palette of icons is only readable if every button has one; a fallback glyph on a few of
    // them is worse than names, because the ones that fell through look identical to each other.
    const missing = Object.keys(EFFECT_SCHEMAS).filter((name) => !hasEffectIcon(name));
    expect(missing, `no glyph for: ${missing.join(", ")}`).toEqual([]);
  });

  it("still draws something for an effect it has never heard of", () => {
    expect(effectIcon("Something New")).toContain("<circle");
  });

  it("bakes in no colour of its own", () => {
    // The armed and hover states are colour changes on the button, and a glyph that named its own
    // colour would sit there unchanged through both. Shapes either say `currentColor` or say
    // nothing and inherit it from the <svg> wrapper; what none of them may do is name a colour.
    for (const name of Object.keys(EFFECT_SCHEMAS)) {
      const markup = effectIcon(name);
      expect(markup, `${name} uses a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const painted = markup.match(/(?:fill|stroke)="([^"]+)"/g) ?? [];
      for (const attr of painted) {
        expect(attr, `${name}: ${attr}`).toMatch(/"(currentColor|none|url\(#[^)]+\))"/);
      }
    }
  });
});
