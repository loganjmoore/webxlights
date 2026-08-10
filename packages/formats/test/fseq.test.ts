import { describe, expect, it } from "vitest";
import { parseFseqV2Header, readFseqV2Frame, writeFseqV2 } from "../src/fseq";

describe("FSEQ v2 writer (SPEC ch11 §5.2, uncompressed)", () => {
  it("matches the exact byte layout hand-computed from the SPEC header table", () => {
    const frame0 = new Uint8Array([1, 2, 3]);
    const frame1 = new Uint8Array([4, 5, 6]);
    const buf = writeFseqV2([frame0, frame1], { channelCount: 3, frameCount: 2, stepTimeMs: 50 });

    // producer "webXLights\0" = 11 bytes; varHeaderLen = 4+11 = 15; headerLen = 32+15 = 47;
    // chanDataOffset = ceil(47/4)*4 = 48; total = 48 + 2*3 = 54
    expect(buf.length).toBe(54);
    expect(Array.from(buf.slice(0, 4))).toEqual([0x50, 0x53, 0x45, 0x51]); // 'PSEQ'

    const view = new DataView(buf.buffer);
    expect(view.getUint16(4, true)).toBe(48); // chanDataOffset
    expect(buf[6]).toBe(0); // minor
    expect(buf[7]).toBe(2); // major
    expect(view.getUint16(8, true)).toBe(47); // headerLen
    expect(view.getUint32(10, true)).toBe(3); // channelCount
    expect(view.getUint32(14, true)).toBe(2); // frameCount
    expect(buf[18]).toBe(50); // stepTimeMs
    expect(buf[20]).toBe(0); // compression type = none

    // variable header at offset 32: {u16 len=15}{'s','p'}"webXLights\0"
    expect(view.getUint16(32, true)).toBe(15);
    expect(String.fromCharCode(buf[34]!, buf[35]!)).toBe("sp");
    expect(new TextDecoder().decode(buf.slice(36, 46))).toBe("webXLights");
    expect(buf[46]).toBe(0); // NUL terminator

    // frame data at chanDataOffset=48
    expect(Array.from(buf.slice(48, 51))).toEqual([1, 2, 3]);
    expect(Array.from(buf.slice(51, 54))).toEqual([4, 5, 6]);
  });

  it("round-trips through the parser: header + every frame read back matches what was written", () => {
    const frames = [
      new Uint8Array([10, 20, 30, 40]),
      new Uint8Array([50, 60, 70, 80]),
      new Uint8Array([90, 100, 110, 120]),
    ];
    const buf = writeFseqV2(frames, { channelCount: 4, frameCount: 3, stepTimeMs: 25 });

    const header = parseFseqV2Header(buf);
    expect(header.channelCount).toBe(4);
    expect(header.frameCount).toBe(3);
    expect(header.stepTimeMs).toBe(25);

    for (let i = 0; i < frames.length; i++) {
      expect(Array.from(readFseqV2Frame(buf, header, i))).toEqual(Array.from(frames[i]!));
    }
  });

  it("rejects a non-PSEQ file", () => {
    const bogus = new Uint8Array(40);
    bogus.set([0x46, 0x53, 0x45, 0x51], 0); // 'FSEQ' (v1 legacy magic, not v2's 'PSEQ')
    expect(() => parseFseqV2Header(bogus)).toThrow(/PSEQ/);
  });

  it("throws when a frame's length does not match channelCount", () => {
    expect(() => writeFseqV2([new Uint8Array([1, 2])], { channelCount: 3, frameCount: 1, stepTimeMs: 50 })).toThrow();
  });

  it("chanDataOffset is always a multiple of 4 regardless of producer string length", () => {
    for (const producer of ["a", "ab", "abc", "abcd", "abcde"]) {
      const buf = writeFseqV2([], { channelCount: 1, frameCount: 0, stepTimeMs: 50, producer });
      const header = parseFseqV2Header(buf);
      expect(header.chanDataOffset % 4).toBe(0);
    }
  });
});
