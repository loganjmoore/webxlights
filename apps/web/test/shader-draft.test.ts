import { afterEach, describe, expect, it } from "vitest";
import { setShaderHost, clearShaderCache } from "@webxlights/engine";
import { checkDraft, defaultInputs, suggestName } from "../src/lib/shaderDraft";
import { parseIsf } from "@webxlights/formats";

const GOOD = `/*{
  "DESCRIPTION": "A drifting plasma over the roofline",
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "invert", "TYPE": "bool" },
    { "NAME": "scale", "TYPE": "float", "MIN": 2.0, "MAX": 8.0 }
  ]
}*/
void main(){ gl_FragColor = vec4(1.0); }`;

function hostThat(compile: (src: string) => { error: string } | Record<string, never>): void {
  setShaderHost({
    compile(source: string) {
      const result = compile(source);
      if ("error" in result) return result as { error: string };
      return { shader: { render: () => null, dispose() {} } };
    },
  });
}

afterEach(() => {
  setShaderHost(null);
  clearShaderCache();
});

describe("checking a generated draft", () => {
  it("accepts a shader whose header parses and whose GLSL compiles", () => {
    hostThat(() => ({}));
    const check = checkDraft(GOOD);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.shader.inputs).toHaveLength(3);
  });

  it("reports a bad header as a parse failure, not a compile one", () => {
    hostThat(() => ({}));
    const check = checkDraft("void main(){}");
    // Which half broke is what makes the error useful to send back for a repair.
    expect(check).toMatchObject({ ok: false, stage: "parse" });
  });

  it("reports GLSL the GPU rejected as a compile failure, carrying the compiler's words", () => {
    hostThat(() => ({ error: "ERROR: 0:3: 'foo' : undeclared identifier" }));
    const check = checkDraft(GOOD);
    expect(check).toMatchObject({ ok: false, stage: "compile" });
    if (!check.ok) expect(check.error).toContain("undeclared identifier");
  });

  it("says it could not check rather than that the shader is broken, with no host", () => {
    // A browser without WebGL2. The shader may be perfect and this browser simply cannot say -
    // telling the user it is broken would be a lie.
    const check = checkDraft(GOOD);
    expect(check).toMatchObject({ ok: false, stage: "unavailable" });
  });
});

describe("naming a draft", () => {
  it("prefers the shader's own description", () => {
    const shader = parseIsf(GOOD);
    expect(suggestName(shader, "something else")).toBe("A drifting plasma over the roofline");
  });

  it("falls back to what the user asked for", () => {
    const shader = parseIsf(`/*{}*/\nvoid main(){}`);
    expect(suggestName(shader, "swirling green fire")).toBe("Swirling green fire");
  });

  it("stops at the first clause rather than running a sentence into a card", () => {
    const shader = parseIsf(`/*{ "DESCRIPTION": "Red bars, moving upward" }*/\nvoid main(){}`);
    expect(suggestName(shader, "")).toBe("Red bars");
  });

  it("always produces something", () => {
    const shader = parseIsf(`/*{}*/\nvoid main(){}`);
    expect(suggestName(shader, "   ")).toBe("Untitled shader");
  });
});

describe("starting values for a shader's inputs", () => {
  it("uses declared defaults, and the midpoint of a range where there is none", () => {
    const shader = parseIsf(GOOD);
    const inputs = defaultInputs(shader);
    expect(inputs.speed).toBe(1.5);
    expect(inputs.invert).toBe(false);
    // Zero is one end of a dial, not a neutral start.
    expect(inputs.scale).toBe(5);
  });

  it("covers every input the shader declares", () => {
    const shader = parseIsf(GOOD);
    expect(Object.keys(defaultInputs(shader)).sort()).toEqual(["invert", "scale", "speed"]);
  });
});
