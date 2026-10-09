// The synthetic test signal of tools/beat-this/export_onnx.py, generated the same way here so the
// TypeScript port can be checked against the Python pipeline's output for it.
export const BEAT_THIS_SIGNAL = { seconds: 40, sampleRate: 22050, bpm: 120 };

/** The same formula as export_onnx.py's test_signal. */
export function beatThisTestSignal(): Float32Array {
  const { seconds, sampleRate: sr, bpm } = BEAT_THIS_SIGNAL;
  const n = Math.floor(seconds * sr);
  const beat = 60 / bpm;
  const mod = (a: number, b: number) => a - b * Math.floor(a / b);
  const x = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0.08 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.18 * t) + Math.sin(2 * Math.PI * 329.63 * t));
    const phase = mod(t, beat);
    const barStart = mod(Math.floor(t / beat), 4) === 0;
    v += Math.exp(-phase / 0.05) * (barStart ? 1 : 0.7) * Math.sin(2 * Math.PI * 55 * phase * (1 + 2 * Math.exp(-phase / 0.02)));
    v += 0.15 * Math.exp(-mod(t, beat / 2) / 0.01) * Math.sin(2 * Math.PI * 7000 * t);
    x[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  return Float32Array.from(x, (v) => (v / peak) * 0.9);
}

