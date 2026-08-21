import { describe, expect, it } from "vitest";
import { defaultValueFor, IsfParseError, parseIsf, serializeIsf } from "../src/isf";

const SIMPLE = `/*{
  "DESCRIPTION": "A drifting plasma",
  "CREDIT": "someone",
  "CATEGORIES": ["Generator", "Color"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "invert", "TYPE": "bool", "DEFAULT": true },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1, 0, 0, 1] },
    { "NAME": "mode", "TYPE": "long", "LABELS": ["Soft", "Hard"], "VALUES": [0, 1] }
  ]
}*/
void main() { gl_FragColor = vec4(1.0); }
`;

describe("ISF parsing", () => {
  it("reads the header and separates the GLSL body", () => {
    const shader = parseIsf(SIMPLE);
    expect(shader.description).toBe("A drifting plasma");
    expect(shader.credit).toBe("someone");
    expect(shader.categories).toEqual(["Generator", "Color"]);
    expect(shader.source.trim()).toBe("void main() { gl_FragColor = vec4(1.0); }");
  });

  it("reads each input's type and range", () => {
    const { inputs } = parseIsf(SIMPLE);
    expect(inputs.map((i) => i.name)).toEqual(["speed", "invert", "tint", "mode"]);
    expect(inputs[0]).toMatchObject({ type: "float", min: 0, max: 4, default: 1 });
    expect(inputs[1]).toMatchObject({ type: "bool", default: true });
    expect(inputs[2]!.default).toEqual([1, 0, 0, 1]);
    expect(inputs[3]).toMatchObject({ labels: ["Soft", "Hard"], values: [0, 1] });
  });

  it("finds the end of a header whose description contains a comment terminator", () => {
    // The closing delimiter is found by matching braces, not by taking the first `*/` - a
    // DESCRIPTION is free text and a shader author can write anything in it.
    const text = `/*{ "DESCRIPTION": "ends with */ inside", "INPUTS": [] }*/\nvoid main(){}\n`;
    const shader = parseIsf(text);
    expect(shader.description).toBe("ends with */ inside");
    expect(shader.source.trim()).toBe("void main(){}");
  });

  it("keeps header fields it has no use for", () => {
    const text = `/*{ "PASSES": [{"TARGET":"buf"}], "ISFVSN": "2" }*/\nvoid main(){}\n`;
    const shader = parseIsf(text);
    // A shader edited here and taken back to another tool must still be the shader it was.
    expect(shader.extra.PASSES).toEqual([{ TARGET: "buf" }]);
    expect(shader.extra.ISFVSN).toBe("2");
  });

  it("survives the sloppiness real ISF files are written with", () => {
    const text = `/*{ "INPUTS": [
      { "NAME": "a", "TYPE": "float", "MIN": "0", "MAX": "10", "DEFAULT": "5" },
      { "NAME": "b", "TYPE": "somethingNobodyElseUses" },
      { "TYPE": "float" }
    ] }*/\nvoid main(){}\n`;
    const { inputs } = parseIsf(text);
    // Quoted numbers are still numbers; an unknown type degrades to float rather than being
    // dropped (a dropped input is a uniform the shader declares and never receives); an input
    // with no name can't be bound to anything and is the one case that goes.
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({ min: 0, max: 10, default: 5 });
    expect(inputs[1]!.type).toBe("float");
  });

  it("rejects a file with no header at all", () => {
    expect(() => parseIsf("void main(){}")).toThrow(IsfParseError);
  });

  it("rejects a header that never closes", () => {
    expect(() => parseIsf('/*{ "INPUTS": [ \nvoid main(){}')).toThrow(IsfParseError);
  });

  it("treats a plain comment above a shader as a missing header, not a broken one", () => {
    expect(() => parseIsf("/* just a note */\nvoid main(){}")).toThrow(IsfParseError);
  });

  it("round-trips through serialize", () => {
    const shader = parseIsf(SIMPLE);
    const again = parseIsf(serializeIsf(shader));
    expect(again.description).toBe(shader.description);
    expect(again.categories).toEqual(shader.categories);
    expect(again.inputs).toEqual(shader.inputs);
    expect(again.source.trim()).toBe(shader.source.trim());
  });
});

describe("default values", () => {
  it("uses the declared default when there is one", () => {
    expect(defaultValueFor({ name: "x", type: "float", default: 3 })).toBe(3);
  });

  it("uses the midpoint of a declared range rather than zero", () => {
    // Zero is usually one end of a dial - no speed, no scale - not a neutral starting point.
    expect(defaultValueFor({ name: "x", type: "float", min: 2, max: 6 })).toBe(4);
  });

  it("gives each type something usable when the shader says nothing", () => {
    expect(defaultValueFor({ name: "b", type: "bool" })).toBe(false);
    expect(defaultValueFor({ name: "c", type: "color" })).toEqual([1, 1, 1, 1]);
    expect(defaultValueFor({ name: "p", type: "point2D" })).toEqual([0.5, 0.5]);
    expect(defaultValueFor({ name: "l", type: "long", values: [7, 8] })).toBe(7);
  });
});
