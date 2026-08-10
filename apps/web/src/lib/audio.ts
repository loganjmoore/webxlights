// DECISIONS.md: native AudioContext.decodeAudioData, no ffmpeg.wasm in the base bundle.
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

export interface PeakBucket {
  min: number;
  max: number;
}

// Min/max per bucket from the (mono-mixed) first channel — the standard waveform-display
// reduction. SPEC ch16 §2.4: compute in <1s for a 5-minute song; this is fast enough on the
// main thread for M2's scope (a dedicated peaks worker is a perf-budget item, tracked M9).
export function computePeaks(buffer: AudioBuffer, bucketCount: number): PeakBucket[] {
  const data = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(data.length / bucketCount));
  const peaks: PeakBucket[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, data.length);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = data[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({ min, max });
  }
  return peaks;
}
