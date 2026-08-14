import { describe, expect, it, vi } from "vitest";
import { canExportVideo, extensionFor, pickMimeType } from "../src/lib/videoExport";

describe("knowing whether this browser can encode", () => {
  it("says no when MediaRecorder isn't there", () => {
    // Checked up front so the button can say so, rather than failing on click after someone has
    // waited for a long sequence to be set up.
    expect(canExportVideo()).toBe(false); // node has no MediaRecorder
    expect(pickMimeType()).toBeNull();
  });

  it("picks the best container the browser admits to", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "video/webm" });
    expect(pickMimeType()).toBe("video/webm");

    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t.includes("vp9") || t === "video/webm" });
    expect(pickMimeType()).toBe("video/webm;codecs=vp9"); // preferred over the bare container
    vi.unstubAllGlobals();
  });

  it("returns null when the browser supports none of them", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickMimeType()).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("naming the file", () => {
  it("matches the extension to the container", () => {
    // A .webm named .mp4 won't open in the player someone hands it to.
    expect(extensionFor("video/mp4")).toBe("mp4");
    expect(extensionFor("video/webm;codecs=vp9")).toBe("webm");
    expect(extensionFor("video/webm")).toBe("webm");
  });
});
