// SPEC ch11 §5.2: FSEQ v2 binary format. Uncompressed only (DECISIONS.md: "v2 uncompressed +
// zlib first, zstd-wasm next" - zlib/zstd compression is a documented ceiling for now).
// Uncompressed v2 files have block count 0 (spec: "treated as one giant block" on read) and
// no sparse ranges, which keeps the header minimal: just the 32 fixed bytes + one "sp"
// (sequence producer) variable header, padded to a multiple of 4.

export interface FseqV2WriteOptions {
  channelCount: number;
  frameCount: number;
  stepTimeMs: number;
  uniqueId?: bigint;
  producer?: string;
}

export function writeFseqV2(frames: Uint8Array[], options: FseqV2WriteOptions): Uint8Array {
  const producer = options.producer ?? "webXLights";
  const producerBytes = new TextEncoder().encode(`${producer}\0`);
  const varHeaderLen = 4 + producerBytes.length; // {u16 len, 2-byte code} + data
  const headerLen = 32 + varHeaderLen; // no compression block table, no sparse ranges
  const chanDataOffset = Math.ceil(headerLen / 4) * 4;

  const buffer = new Uint8Array(chanDataOffset + options.frameCount * options.channelCount);
  const view = new DataView(buffer.buffer);

  buffer.set([0x50, 0x53, 0x45, 0x51], 0); // 'PSEQ'
  view.setUint16(4, chanDataOffset, true);
  buffer[6] = 0; // minor version
  buffer[7] = 2; // major version
  view.setUint16(8, headerLen, true);
  view.setUint32(10, options.channelCount, true);
  view.setUint32(14, options.frameCount, true);
  buffer[18] = options.stepTimeMs;
  buffer[19] = 0; // flags
  buffer[20] = 0; // compression type 0=none, upper block-count bits 0
  buffer[21] = 0; // block count low byte
  buffer[22] = 0; // sparse range count
  buffer[23] = 0; // flags
  view.setBigUint64(24, options.uniqueId ?? 0n, true);

  let off = 32;
  view.setUint16(off, varHeaderLen, true);
  off += 2;
  buffer[off] = "s".charCodeAt(0);
  buffer[off + 1] = "p".charCodeAt(0);
  off += 2;
  buffer.set(producerBytes, off);

  let dataOff = chanDataOffset;
  for (const frame of frames) {
    if (frame.length !== options.channelCount) {
      throw new Error(`writeFseqV2: frame length ${frame.length} !== channelCount ${options.channelCount}`);
    }
    buffer.set(frame, dataOff);
    dataOff += options.channelCount;
  }

  return buffer;
}

export interface FseqV2Header {
  chanDataOffset: number;
  channelCount: number;
  frameCount: number;
  stepTimeMs: number;
}

export function parseFseqV2Header(buffer: Uint8Array): FseqV2Header {
  if (buffer.length < 32) throw new Error("parseFseqV2Header: buffer too short for a v2 header");
  const magic = String.fromCharCode(buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!);
  if (magic !== "PSEQ") throw new Error(`parseFseqV2Header: bad magic "${magic}", expected PSEQ`);
  const major = buffer[7]!;
  if (major !== 2) throw new Error(`parseFseqV2Header: unsupported major version ${major}, only v2 is implemented`);

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    chanDataOffset: view.getUint16(4, true),
    channelCount: view.getUint32(10, true),
    frameCount: view.getUint32(14, true),
    stepTimeMs: buffer[18]!,
  };
}

// Uncompressed-only reader (mirrors the writer above); throws on a compressed file since
// zlib/zstd decoding is the same documented ceiling as the writer side.
export function readFseqV2Frame(buffer: Uint8Array, header: FseqV2Header, frameIndex: number): Uint8Array {
  if (buffer[20]! & 0x0f) throw new Error("readFseqV2Frame: compressed fseq files are not supported yet");
  if (frameIndex < 0 || frameIndex >= header.frameCount) throw new Error(`readFseqV2Frame: frame ${frameIndex} out of range`);
  const start = header.chanDataOffset + frameIndex * header.channelCount;
  return buffer.slice(start, start + header.channelCount);
}
