import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/api";
import { checkUploadSize, MAX_UPLOAD_BYTES, uploadErrorMessage } from "../src/lib/uploads";

afterEach(() => vi.unstubAllGlobals());

describe("upload failures", () => {
  it("allows the 50 MiB boundary and rejects larger files before sending them", async () => {
    expect(() => checkUploadSize({ size: MAX_UPLOAD_BYTES })).not.toThrow();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const oversized = new File([], "large.wav");
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await expect(api.uploadMedia(1, oversized)).rejects.toThrow("up to 50 MB");
    await expect(api.uploadSequenceAudio(1, oversized)).rejects.toThrow("up to 50 MB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([api.uploadMedia, api.uploadSequenceAudio])("turns Laravel upload errors into readable messages", async (upload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "The audio failed to upload.", errors: { audio: ["The audio failed to upload."] },
    }), { status: 422 })));
    const result = upload(1, new File(["audio"], "song.mp3"));
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toThrow(/^The audio failed to upload\.$/);
  });

  it("handles proxy HTML, expired sessions and malformed errors without displaying server internals", () => {
    expect(uploadErrorMessage(413, "<html>too large</html>")).toContain("up to 50 MB");
    expect(uploadErrorMessage(419, "")).toContain("Sign in again");
    for (const body of ["<html>error</html>", '{"message":{}}', "null"]) {
      expect(uploadErrorMessage(422, body)).toBe("The file could not be uploaded. Please try again.");
    }
    expect(uploadErrorMessage(500, '{"message":"internal details"}')).not.toContain("internal details");
  });
});
