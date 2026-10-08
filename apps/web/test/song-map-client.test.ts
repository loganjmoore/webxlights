import { describe, expect, it } from "vitest";
import { analyzeSong } from "@webxlights/engine";
import { audioHash, cachedSongMap, withCachedSongMap } from "../src/lib/magic/songMapClient";

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
    const future = { ...map, version: 2 } as unknown as typeof map;
    expect(cachedSongMap({ songMap: { hash: "aaa", map: future } }, "aaa")).toBeNull();
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
