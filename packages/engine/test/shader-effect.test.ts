import { afterEach, describe, expect, it } from "vitest";
import { RenderBuffer } from "../src/renderBuffer";
import { rgba } from "../src/color";
import { paletteColorValues, renderShader } from "../src/effects/shader";
import { clearShaderCache, setShaderHost, type ShaderFrameRequest, type ShaderHost } from "../src/shaderRuntime";

// A stand-in for the GPU. The point of the host seam is that the engine can be exercised without
// one, so these tests drive the effect through a host that records what it was asked for and
// paints a known answer - which is the only way any of this is testable in Node at all.
function fakeHost(paint: (r: ShaderFrameRequest) => Uint8ClampedArray | null, seen: ShaderFrameRequest[] = []): ShaderHost {
  return {
    compile(source: string) {
      if (source.includes("BROKEN")) return { error: "syntax error: BROKEN" };
      return {
        shader: {
          render(request) {
            seen.push(request);
            return paint(request);
          },
          dispose() {},
        },
      };
    },
  };
}

const solid = (r: ShaderFrameRequest, c: [number, number, number, number]) => {
  const px = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < r.width * r.height; i++) {
    px[i * 4] = c[0];
    px[i * 4 + 1] = c[1];
    px[i * 4 + 2] = c[2];
    px[i * 4 + 3] = c[3];
  }
  return px;
};

const ctx = (frame: number, pos = 0) => ({ frameIndexInEffect: frame, positionInEffect01: pos, seed: 1 });

afterEach(() => {
  setShaderHost(null);
  clearShaderCache();
});

describe("Shader effect", () => {
  it("paints what the shader returned", () => {
    setShaderHost(fakeHost((r) => solid(r, [10, 20, 30, 255])));
    const buffer = new RenderBuffer(4, 3);
    renderShader(buffer, [rgba(255, 0, 0, 255)], { source: "void main(){}" }, ctx(0));
    expect(buffer.getPixel(0, 0)).toEqual(rgba(10, 20, 30, 255));
    expect(buffer.getPixel(3, 2)).toEqual(rgba(10, 20, 30, 255));
  });

  it("renders nothing rather than throwing when the shader will not compile", () => {
    setShaderHost(fakeHost((r) => solid(r, [255, 255, 255, 255])));
    const buffer = new RenderBuffer(2, 2);
    // A broken shader on one layer of one model must not take the frame down with it - the rest
    // of the show is still correct.
    expect(() => renderShader(buffer, [], { source: "BROKEN" }, ctx(0))).not.toThrow();
    expect(buffer.getPixel(0, 0).a).toBe(0);
  });

  it("renders nothing when no host is installed", () => {
    // Node, or a browser with no WebGL2. Same outcome as an unknown effect name.
    const buffer = new RenderBuffer(2, 2);
    expect(() => renderShader(buffer, [], { source: "void main(){}" }, ctx(0))).not.toThrow();
    expect(buffer.getPixel(0, 0).a).toBe(0);
  });

  it("leaves the layer below showing where the shader drew nothing", () => {
    setShaderHost(fakeHost((r) => solid(r, [0, 0, 0, 0])));
    const buffer = new RenderBuffer(2, 2);
    buffer.fill(rgba(9, 9, 9, 255));
    renderShader(buffer, [], { source: "void main(){}" }, ctx(0));
    // Transparent output must not be written as black - that would turn every shader into an
    // opaque rectangle over whatever it was layered on.
    expect(buffer.getPixel(0, 0)).toEqual(rgba(9, 9, 9, 255));
  });

  it("advances shader time in real seconds, not frames", () => {
    const seen: ShaderFrameRequest[] = [];
    setShaderHost(fakeHost((r) => solid(r, [1, 1, 1, 255]), seen));
    const buffer = new RenderBuffer(2, 2);
    // An ISF shader is written against wall-clock seconds, so 20 frames at 50ms is one second
    // whatever the sequence's frame rate happens to be.
    renderShader(buffer, [], { source: "s" }, ctx(20), 50);
    expect(seen[0]!.timeSeconds).toBeCloseTo(1, 6);
    renderShader(buffer, [], { source: "s" }, ctx(40), 25);
    expect(seen[1]!.timeSeconds).toBeCloseTo(1, 6);
  });

  it("scales time by the speed control", () => {
    const seen: ShaderFrameRequest[] = [];
    setShaderHost(fakeHost((r) => solid(r, [1, 1, 1, 255]), seen));
    renderShader(new RenderBuffer(2, 2), [], { source: "s", speed: 2 }, ctx(20), 50);
    expect(seen[0]!.timeSeconds).toBeCloseTo(2, 6);
  });

  it("applies transparency to what the shader drew", () => {
    setShaderHost(fakeHost((r) => solid(r, [100, 100, 100, 200])));
    const buffer = new RenderBuffer(2, 2);
    renderShader(buffer, [], { source: "s", transparencyPct: 50 }, ctx(0));
    expect(buffer.getPixel(0, 0).a).toBe(100);
  });

  it("hands the row's palette to the shader", () => {
    const seen: ShaderFrameRequest[] = [];
    setShaderHost(fakeHost((r) => solid(r, [1, 1, 1, 255]), seen));
    const palette = [rgba(255, 0, 0, 255), rgba(0, 255, 0, 255)];
    renderShader(new RenderBuffer(2, 2), palette, { source: "s" }, ctx(0));
    expect(seen[0]!.palette).toEqual(palette);
  });

  it("fills colour inputs from the palette in declaration order, wrapping - xLights' rule", () => {
    const seen: ShaderFrameRequest[] = [];
    setShaderHost(fakeHost((r) => solid(r, [1, 1, 1, 255]), seen));
    const palette = [rgba(255, 0, 0, 255), rgba(0, 255, 0, 255)];
    renderShader(
      new RenderBuffer(2, 2),
      palette,
      {
        source: "s",
        // The stored DEFAULT values, which the palette must override - real xLights ignores a
        // colour input's DEFAULT entirely (ShaderEffect.cpp, SHADER_PARM_COLOUR).
        inputs: { colorA: [0, 0, 1, 1], colorB: [0, 0, 1, 1], colorC: [0, 0, 1, 1], speed: 2 },
        colorInputs: ["colorA", "colorB", "colorC"],
      },
      ctx(0),
    );
    expect(seen[0]!.inputs.colorA).toEqual([1, 0, 0, 1]);
    expect(seen[0]!.inputs.colorB).toEqual([0, 1, 0, 1]);
    // Third input wraps back to the first palette colour.
    expect(seen[0]!.inputs.colorC).toEqual([1, 0, 0, 1]);
    // A non-colour input is left alone.
    expect(seen[0]!.inputs.speed).toBe(2);
  });

  it("leaves colour inputs at their stored values when the palette is empty", () => {
    const seen: ShaderFrameRequest[] = [];
    setShaderHost(fakeHost((r) => solid(r, [1, 1, 1, 255]), seen));
    renderShader(
      new RenderBuffer(2, 2),
      [],
      { source: "s", inputs: { colorA: [0, 0, 1, 1] }, colorInputs: ["colorA"] },
      ctx(0),
    );
    expect(seen[0]!.inputs.colorA).toEqual([0, 0, 1, 1]);
  });

  it("forces colour inputs opaque whatever the palette's alpha, as xLights does", () => {
    const values = paletteColorValues(["c"], [rgba(10, 20, 30, 40)]);
    expect(values.c).toEqual([10 / 255, 20 / 255, 30 / 255, 1]);
  });

  it("ignores a short buffer from a misbehaving host", () => {
    setShaderHost(fakeHost(() => new Uint8ClampedArray(4)));
    const buffer = new RenderBuffer(4, 4);
    buffer.fill(rgba(7, 7, 7, 255));
    renderShader(buffer, [], { source: "s" }, ctx(0));
    expect(buffer.getPixel(3, 3)).toEqual(rgba(7, 7, 7, 255));
  });

  it("compiles a given source once however many frames render", () => {
    let compiles = 0;
    setShaderHost({
      compile() {
        compiles++;
        return { shader: { render: (r) => solid(r, [1, 2, 3, 255]), dispose() {} } };
      },
    });
    const buffer = new RenderBuffer(2, 2);
    for (let f = 0; f < 25; f++) renderShader(buffer, [], { source: "same" }, ctx(f));
    // An export renders thousands of frames of one effect; recompiling each time would dominate.
    expect(compiles).toBe(1);
  });

  it("does nothing at all when no shader has been chosen", () => {
    setShaderHost(fakeHost((r) => solid(r, [255, 255, 255, 255])));
    const buffer = new RenderBuffer(2, 2);
    renderShader(buffer, [], {}, ctx(0));
    expect(buffer.getPixel(0, 0).a).toBe(0);
  });
});
