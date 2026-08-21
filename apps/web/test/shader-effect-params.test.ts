import { describe, expect, it } from "vitest";
import { renderRowAtMs, setShaderHost, clearShaderCache, rgba, computeVerticalMatrixTopLeft } from "@webxlights/engine";
import { parseIsf } from "@webxlights/formats";
import { defaultInputs } from "../src/lib/shaderDraft";

// What a Shader effect has to carry for a sequence to keep rendering.
//
// The picker copies a shader's source onto the effect rather than referencing it by id, and these
// pin down why: a show has to render when the shader it used has been made private, edited, or
// deleted. A sequence that breaks because someone else changed their mind is not a sequence.

const SHADER = `/*{
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "bands", "TYPE": "long", "LABELS": ["Few", "Many"], "VALUES": [3, 9] }
  ]
}*/
void main(){ gl_FragColor = vec4(1.0); }`;

function hostRecording(seen: Array<Record<string, unknown>>): void {
  setShaderHost({
    compile: () => ({
      shader: {
        render: (request) => {
          seen.push({ ...request.inputs });
          const px = new Uint8ClampedArray(request.width * request.height * 4);
          for (let i = 0; i < request.width * request.height; i++) {
            px[i * 4] = 200;
            px[i * 4 + 3] = 255;
          }
          return px;
        },
        dispose() {},
      },
    }),
  });
}

const geometry = computeVerticalMatrixTopLeft({ strings: 4, nodesPerString: 4 });
const PALETTE = [rgba(255, 0, 0, 255)];

describe("a Shader effect renders from what it carries", () => {
  it("renders with only source and inputs on the effect - no library lookup", () => {
    const seen: Array<Record<string, unknown>> = [];
    hostRecording(seen);
    try {
      const shader = parseIsf(SHADER);
      const colors = renderRowAtMs(
        {
          geometry,
          effects: [
            {
              name: "Shader",
              startMs: 0,
              endMs: 1000,
              // Deliberately no shaderId: the shader may have been deleted since.
              params: { source: shader.source, inputs: defaultInputs(shader) },
            },
          ],
        },
        400,
        50,
        1,
        PALETTE,
      );
      expect(colors.some((c) => c.a > 0)).toBe(true);
      expect(seen[0]).toEqual({ speed: 2, bands: 3 });
    } finally {
      setShaderHost(null);
      clearShaderCache();
    }
  });

  it("passes the user's edited input values through to the shader", () => {
    const seen: Array<Record<string, unknown>> = [];
    hostRecording(seen);
    try {
      renderRowAtMs(
        {
          geometry,
          effects: [
            {
              name: "Shader",
              startMs: 0,
              endMs: 1000,
              params: { source: "void main(){}", inputs: { speed: 0.25, bands: 9 } },
            },
          ],
        },
        400,
        50,
        1,
        PALETTE,
      );
      expect(seen[0]).toEqual({ speed: 0.25, bands: 9 });
    } finally {
      setShaderHost(null);
      clearShaderCache();
    }
  });

  it("takes a long input's first declared value, not zero, as its start", () => {
    // Zero is not one of this input's values at all - a select with no matching option shows
    // blank, and the shader receives a number its author never allowed for.
    const shader = parseIsf(SHADER);
    expect(defaultInputs(shader).bands).toBe(3);
  });
});
