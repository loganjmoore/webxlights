import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeSong } from "@webxlights/engine";
import { analyzeSongInWorker, audioHash, cachedSongMap, STALE_PAGE, withCachedSongMap } from "../src/lib/magic/songMapClient";

// A real (tiny) map rather than a hand-built object, so the fixture can't drift from the type.
const map = analyzeSong(new Float32Array(22050), 22050);

describe("audio hash", () => {
  it("is the SHA-256 of the bytes, in hex", async () => {
    const abc = new TextEncoder().encode("abc").buffer as ArrayBuffer;
    expect(await audioHash(abc)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("differs for different audio", async () => {
    expect(await audioHash(new Uint8Array([1]).buffer)).not.toBe(await audioHash(new Uint8Array([2]).buffer));
  });
});

describe("song map cache on the sequence", () => {
  it("returns the stored map only for the same audio", () => {
    const metadata = withCachedSongMap({ song: "Carol" }, "aaa", map);
    expect(cachedSongMap(metadata, "aaa")).toEqual(map);
    expect(cachedSongMap(metadata, "bbb")).toBeNull();
  });

  it("has nothing to return before one is stored", () => {
    expect(cachedSongMap(undefined, "aaa")).toBeNull();
    expect(cachedSongMap(null, "aaa")).toBeNull();
    expect(cachedSongMap({ song: "Carol" }, "aaa")).toBeNull();
    expect(cachedSongMap({ songMap: null }, "aaa")).toBeNull();
  });

  it("will not read a map written in another version of the format", () => {
    // Version 1 had no rests: such a map is analysed again rather than read without them.
    for (const version of [1, 3]) {
      const other = { ...map, version } as unknown as typeof map;
      expect(cachedSongMap({ songMap: { hash: "aaa", map: other } }, "aaa")).toBeNull();
    }
  });

  it("keeps the rest of the metadata and does not change what it was given", () => {
    const before = { author: "Someone", songMap: { hash: "old", map } };
    const after = withCachedSongMap(before, "new", map);
    expect(after.author).toBe("Someone");
    expect(after.songMap?.hash).toBe("new");
    expect(before.songMap.hash).toBe("old");
  });

  it("survives the JSON round trip the server puts it through", () => {
    const stored = JSON.parse(JSON.stringify(withCachedSongMap(null, "aaa", map)));
    expect(cachedSongMap(stored, "aaa")).toEqual(map);
  });
});

describe("a worker that fails to load", () => {
  // What a browser does with a module worker whose script won't load: an error event, no message.
  class DeadWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    postMessage(): void {
      setTimeout(() => this.onerror?.({ message: "" } as ErrorEvent), 0);
    }
    terminate(): void {}
  }
  const audio = { numberOfChannels: 1, length: 4, sampleRate: 22050, getChannelData: () => new Float32Array(4) } as unknown as AudioBuffer;
  afterEach(() => vi.unstubAllGlobals());

  it("says to reload when a deploy has replaced this page's scripts", async () => {
    vi.stubGlobal("Worker", DeadWorker);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(analyzeSongInWorker(audio)).rejects.toThrow(STALE_PAGE);
  });

  it("keeps the plain failure when the page is current", async () => {
    vi.stubGlobal("Worker", DeadWorker);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await expect(analyzeSongInWorker(audio)).rejects.toThrow("Song analysis failed");
  });
});
