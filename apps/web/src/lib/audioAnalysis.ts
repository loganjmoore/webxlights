import { analyzeAudio, type AudioSeries } from "@webxlights/engine";

// Bridges the browser's decoded AudioBuffer to the engine's DOM-free analyser (engine/audio.ts).
// Analysis runs once when a track is loaded, not per frame: the preview and the .fseq export
// then read the same precomputed numbers, so an audio-reactive effect renders identically in
// both (SPEC ch10/16 determinism).

// Down-mix to mono. Analysing only channel 0 (what the waveform strip does) would miss
// anything panned hard right, which for a VU meter reads as the track randomly dropping out.
function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);

  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i]! / channels;
  }
  return mono;
}

export function analyzeAudioBuffer(buffer: AudioBuffer, frameMs: number, bandCount = 16): AudioSeries {
  return analyzeAudio(toMono(buffer), buffer.sampleRate, frameMs, bandCount, buffer.duration * 1000);
}

export type { AudioSeries };
