import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKGROUND_OPACITY,
  MAX_BACKGROUND_EDGE,
  backgroundFrom,
  clampOpacity,
  scaledSize,
  prepareBackground,
} from "../src/lib/backgroundImage";

describe("scaling a photo down to something a settings row can carry", () => {
  it("leaves an already-small image alone", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("caps the long edge and keeps the shape", () => {
    const scaled = scaledSize(4000, 3000);
    expect(scaled.width).toBe(MAX_BACKGROUND_EDGE);
    expect(scaled.height).toBe(Math.round((3000 / 4000) * MAX_BACKGROUND_EDGE));
  });

  it("caps the long edge whichever way round the photo is", () => {
    expect(scaledSize(3000, 4000).height).toBe(MAX_BACKGROUND_EDGE);
  });

  it("never scales the short edge to nothing", () => {
    // A very long, very thin image would otherwise decode to a zero-height canvas and come back
    // blank rather than as an error.
    expect(scaledSize(20000, 5).height).toBe(1);
  });

  it("copes with a zero-sized image rather than dividing by it", () => {
    expect(scaledSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("reading a layout's stored background", () => {
  const stored = { dataUrl: "data:image/jpeg;base64,abc", width: 1600, height: 900, opacity: 60 };

  it("reads one back with its opacity", () => {
    expect(backgroundFrom({ backgroundImage: stored })).toEqual(stored);
  });

  it("returns null for a layout that predates backgrounds", () => {
    expect(backgroundFrom(undefined)).toBeNull();
    expect(backgroundFrom({})).toBeNull();
    expect(backgroundFrom({ views: [] })).toBeNull();
  });

  it("refuses anything that isn't an image data URL", () => {
    // The settings bag is free-form JSON, so what comes back has to be checked rather than
    // trusted - a stray string here would be handed straight to an <img src>.
    expect(backgroundFrom({ backgroundImage: { dataUrl: "https://example.com/house.jpg" } })).toBeNull();
    expect(backgroundFrom({ backgroundImage: { dataUrl: "javascript:alert(1)" } })).toBeNull();
    expect(backgroundFrom({ backgroundImage: "not an object" })).toBeNull();
  });

  it("falls back to a sensible opacity when the stored one is missing or nonsense", () => {
    expect(backgroundFrom({ backgroundImage: { dataUrl: stored.dataUrl } })!.opacity).toBe(DEFAULT_BACKGROUND_OPACITY);
    expect(backgroundFrom({ backgroundImage: { dataUrl: stored.dataUrl, opacity: "loud" } })!.opacity).toBe(
      DEFAULT_BACKGROUND_OPACITY,
    );
  });
});

describe("opacity", () => {
  it("stays within 0-100 whatever it is given", () => {
    expect(clampOpacity(-20)).toBe(0);
    expect(clampOpacity(200)).toBe(100);
    expect(clampOpacity(45.6)).toBe(46);
  });

  it("falls back rather than producing NaN", () => {
    expect(clampOpacity(undefined)).toBe(DEFAULT_BACKGROUND_OPACITY);
    expect(clampOpacity("loud")).toBe(DEFAULT_BACKGROUND_OPACITY);
  });
});


describe("preparing picked photos", () => {
  afterEach(() => vi.unstubAllGlobals());
  const file = new File(["photo"], "house.jpg", { type: "image/jpeg" });

  function canvas() {
    const drawImage = vi.fn();
    const target = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => "data:image/jpeg;base64,resized" };
    vi.stubGlobal("document", { createElement: () => target });
    return { target, drawImage };
  }

  function fallback(options: { readFails?: boolean; decodeFails?: boolean } = {}) {
    vi.stubGlobal("FileReader", class {
      result = "data:image/jpeg;base64,original";
      onload = () => {}; onerror = () => {};
      readAsDataURL() { queueMicrotask(() => options.readFails ? this.onerror() : this.onload()); }
    });
    vi.stubGlobal("Image", class {
      naturalWidth = 4032; naturalHeight = 3024;
      onload = () => {}; onerror = () => {};
      set src(value: string) { if (value) queueMicrotask(() => options.decodeFails ? this.onerror() : this.onload()); }
    });
  }

  it("rescales a camera photo and releases the bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4032, height: 3024, close }));
    const { target } = canvas();
    const result = await prepareBackground(file);
    expect(result.image).toMatchObject({ width: 1600, height: 1200, dataUrl: "data:image/jpeg;base64,resized" });
    expect(target.width).toBe(1600);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["rejected", "unavailable"])("previews and resizes via the image decoder when bitmap decoding is %s", async mode => {
    vi.stubGlobal("createImageBitmap", mode === "rejected" ? vi.fn().mockRejectedValue(new Error("decoder failed")) : undefined);
    fallback();
    const { drawImage } = canvas();
    expect(await prepareBackground(file)).toMatchObject({ error: "", image: { width: 1600, height: 1200 } });
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it("explains when the selected file itself cannot be read", async () => {
    vi.stubGlobal("createImageBitmap", undefined); fallback({ readFails: true });
    const result = await prepareBackground(file);
    expect(result.image).toBeNull();
    expect(result.error).toContain("Download the original photo to this device");
  });

  it("explains unsupported encoding instead of reporting an upload failure", async () => {
    vi.stubGlobal("createImageBitmap", undefined); fallback({ decodeFails: true });
    const result = await prepareBackground(file);
    expect(result.image).toBeNull();
    expect(result.error).toContain("Export the photo as JPEG or PNG");
  });

  it("releases decoded pixels even when canvas preparation fails", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4032, height: 3024, close }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    expect((await prepareBackground(file)).image).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
