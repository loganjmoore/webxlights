import { describe, expect, it } from "vitest";
import { SPRITES, spriteFor, spriteFrames } from "../src/lib/magic/sprites";

describe("the picture library", () => {
  it("draws every frame of a sprite the same size, in colours it knows", () => {
    for (const sprite of SPRITES) {
      const sizes = sprite.frames.map((f) => {
        const rows = f.split("\n");
        expect(new Set(rows.map((r) => r.length)).size, `${sprite.id}: ragged rows`).toBe(1);
        return `${rows[0]!.length}x${rows.length}`;
      });
      expect(new Set(sizes).size, `${sprite.id}: frames differ in size`).toBe(1);
      expect(sprite.frames.length, `${sprite.id}: an animation needs two frames`).toBeGreaterThanOrEqual(2);
      const frames = spriteFrames(sprite.id)!;
      // Every character but "." is a colour: an unknown one would draw nothing, silently.
      const lit = frames[0]!.data.filter((_, i) => i % 4 === 3 && frames[0]!.data[i] === 255).length;
      expect(lit).toBe([...sprite.frames[0]!].filter((c) => c !== "." && c !== "\n").length);
    }
  });

  it("gives each lyric word one sprite", () => {
    const seen = new Map<string, string>();
    for (const sprite of SPRITES) for (const w of sprite.words) {
      expect(seen.get(w), `"${w}" is ${seen.get(w)} and ${sprite.id}`).toBeUndefined();
      seen.set(w, sprite.id);
    }
  });

  it("finds the first word in a line the library draws, plural or possessive", () => {
    expect(spriteFor("Two reindeers out on the lawn")?.id).toBe("reindeer");
    expect(spriteFor("Grandma's boots up on the roof")?.id).toBe("boots");
    expect(spriteFor("Santa's sleigh is late")?.id).toBe("santa");
    expect(spriteFor("Nothing here to see")).toBeUndefined();
  });
});
