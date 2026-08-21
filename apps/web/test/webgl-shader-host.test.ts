import { describe, expect, it } from "vitest";
import { inputUniformDeclarations, ISF_PREAMBLE, webxlFragmentSource } from "../src/lib/webglShaderHost";
import { parseIsf } from "@webxlights/formats";

// The pure half of the shader host: what source actually reaches the GPU. The compiling half
// needs a browser and is exercised by tools/shader-check in headless Chromium; what is testable
// here is that the source we build matches the contract - most importantly that INPUTS become
// uniform declarations exactly the way real xLights makes them, because that is what lets one
// file compile in both programs.

const WITH_INPUTS = `/*{
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "flash", "TYPE": "bool" },
    { "NAME": "count", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 3 },
    { "NAME": "centre", "TYPE": "point2D" },
    { "NAME": "colorA", "TYPE": "color" }
  ]
}*/
void main() { gl_FragColor = vec4(speed); }`;

describe("input uniform declarations", () => {
  it("declares each input with the type xLights would give it", () => {
    const decls = inputUniformDeclarations(parseIsf(WITH_INPUTS).inputs);
    expect(decls).toContain("uniform float speed;");
    expect(decls).toContain("uniform bool flash;");
    expect(decls).toContain("uniform int count;");
    expect(decls).toContain("uniform vec2 centre;");
    expect(decls).toContain("uniform vec4 colorA;");
  });

  it("gives a long no uniform unless it has a range or choices - as xLights does", () => {
    const inputs = parseIsf(`/*{ "INPUTS": [ { "NAME": "bare", "TYPE": "long" } ] }*/\nvoid main(){}`).inputs;
    expect(inputUniformDeclarations(inputs)).toBe("");
  });
});

describe("the fragment source the GPU sees", () => {
  it("splices declarations between the preamble and the body for a full ISF file", () => {
    const full = webxlFragmentSource(WITH_INPUTS);
    expect(full.startsWith(ISF_PREAMBLE)).toBe(true);
    expect(full).toContain("uniform float speed;");
    expect(full).toContain("void main() { gl_FragColor = vec4(speed); }");
    // The header comment must not survive into the GLSL.
    expect(full).not.toContain('"INPUTS"');
  });

  it("compiles a bare body untouched - the form effects saved before headers were kept", () => {
    const full = webxlFragmentSource("uniform float mine;\nvoid main(){ gl_FragColor = vec4(mine); }");
    expect(full).toContain("uniform float mine;");
    expect(full.startsWith(ISF_PREAMBLE)).toBe(true);
  });

  it("drops a leading #version from the body, because the preamble already has one", () => {
    const full = webxlFragmentSource("#version 300 es\nvoid main(){ gl_FragColor = vec4(1.0); }");
    expect(full.match(/#version/g)).toHaveLength(1);
  });
});
