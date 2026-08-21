import { beforeEach, describe, expect, it } from "vitest";
import { forgetKey, loadKey, looksLikeKey, maskKey, saveKey } from "../src/lib/anthropicKey";

// A Map standing in for localStorage. The suite runs without a DOM (vitest.config.ts sets no
// environment), and the library reaches storage through globalThis precisely so it does not
// need one - so a fake here tests the real path rather than a shimmed one.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

describe("the user's own API key", () => {
  it("round-trips through this browser", () => {
    saveKey("sk-ant-abc123def456");
    expect(loadKey()).toBe("sk-ant-abc123def456");
  });

  it("treats blank and whitespace as no key at all", () => {
    saveKey("   ");
    expect(loadKey()).toBeNull();
  });

  it("trims a pasted key", () => {
    // Copying from a dashboard picks up a trailing newline more often than not.
    saveKey("  sk-ant-abc123def456\n");
    expect(loadKey()).toBe("sk-ant-abc123def456");
  });

  it("forgets on request", () => {
    saveKey("sk-ant-abc123def456");
    forgetKey();
    expect(loadKey()).toBeNull();
  });

  it("survives storage being unavailable", () => {
    // A private window, or a browser set to block site data. Losing the key is acceptable;
    // throwing in the middle of the request the user just made is not.
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => saveKey("sk-ant-abc123def456")).not.toThrow();
    expect(loadKey()).toBeNull();
  });

  it("survives storage that throws on every access", () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(() => saveKey("sk-ant-abc123def456")).not.toThrow();
    expect(loadKey()).toBeNull();
  });
});

describe("recognising a key", () => {
  it("accepts the current format", () => {
    expect(looksLikeKey("sk-ant-api03-abcdefghij")).toBe(true);
  });

  it("rejects an obvious paste error", () => {
    expect(looksLikeKey("hello")).toBe(false);
    expect(looksLikeKey("")).toBe(false);
  });
});

describe("showing a key without showing it", () => {
  it("keeps enough to tell two keys apart", () => {
    // So someone with several can identify this one on a screen share without exposing it.
    expect(maskKey("sk-ant-api03-abcdef4f2a")).toBe("sk-ant-…4f2a");
  });

  it("reveals nothing of a short string", () => {
    expect(maskKey("short")).toBe("•••••");
  });
});
