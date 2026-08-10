import { api, type ModelUpsertPayload, type SequenceBody } from "./api";
import { newEffectId } from "../stores/sequencer";
import { defaultParamsFor } from "@webxlights/engine";

// M9 onboarding: "signup to exported fseq in <15 min using only in-app guidance" needs
// something to click that isn't a blank project. The goal prompt calls for "bundled demo
// layout + royalty-free song + pre-built sequence" - there's no actual royalty-free audio
// file bundled with this repo to ship (and sourcing/licensing one is out of scope for this
// pass), so the "song" is a short synthesized jingle instead: generated fresh in the browser
// at demo-creation time, not a real licensed track. Since audio still isn't R2-backed (M2/M5
// ceiling), this is actually the only option that needs zero new infrastructure - a
// synthesized clip regenerates identically every time, same as a bundled file would load.
const DEMO_DURATION_MS = 10_000;
const DEMO_FRAME_MS = 50;

function synthesizeDemoAudioWav(durationMs: number): Blob {
  const sampleRate = 44100;
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Int16Array(totalSamples);

  // A simple ascending arpeggio loop (C E G C), not any copyrighted melody - just enough
  // to prove "there is audio" and give the waveform/playhead something to show.
  const notesHz = [261.63, 329.63, 392.0, 523.25];
  const noteDurationSec = 0.5;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const noteIndex = Math.floor(t / noteDurationSec) % notesHz.length;
    const freq = notesHz[noteIndex]!;
    const tInNote = t % noteDurationSec;
    const envelope = Math.min(1, tInNote * 20) * Math.min(1, (noteDurationSec - tInNote) * 20); // quick fade in/out per note
    const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }

  return pcm16ToWavBlob(samples, sampleRate);
}

function pcm16ToWavBlob(samples: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i]!, true);

  return new Blob([buffer], { type: "audio/wav" });
}

// Sequencer page checks this once on mount instead of showing the "re-select audio" prompt.
const pendingDemoAudio = new Map<number, File>();
export function takePendingDemoAudio(sequenceId: number): File | null {
  const file = pendingDemoAudio.get(sequenceId) ?? null;
  pendingDemoAudio.delete(sequenceId);
  return file;
}

function demoModels(): ModelUpsertPayload[] {
  return [
    {
      name: "Demo Matrix",
      type: "Matrix",
      supported: true,
      params: {},
      // WorldPosZ is what the 3D preview reads for depth. Real xLights layouts carry it; the
      // sample gives the two props different depths so the visualizer opens on an actual 3D
      // scene rather than a flat wall you can only orbit edge-on.
      raw_attrs: { NumStrings: "16", NodesPerString: "16", WorldPosZ: "0" },
      screen: { x: 0, y: 0, scale: 1 },
      strings: 16,
      nodes_per_string: 16,
      string_type: "RGB Nodes",
      start_channel: "1",
      order: 0,
    },
    {
      name: "Demo Arch",
      type: "Arches",
      supported: true,
      params: {},
      raw_attrs: { NumArches: "1", NodesPerArch: "50", Arc: "180", WorldPosZ: "90" },
      screen: { x: 200, y: 0, scale: 1 },
      strings: 1,
      nodes_per_string: 50,
      string_type: "RGB Nodes",
      start_channel: "769", // after the matrix's 256 nodes * 3 channels
      order: 1,
    },
  ];
}

function demoSequenceBody(matrixId: number, archId: number): SequenceBody {
  return {
    timingTracks: [{ name: "Beats", marks: [0, 2500, 5000, 7500, 10000] }],
    rows: [
      {
        elementType: "model",
        elementId: matrixId,
        effects: [
          {
            id: newEffectId(),
            name: "Color Wash",
            startMs: 0,
            endMs: DEMO_DURATION_MS / 2,
            params: { ...defaultParamsFor("Color Wash"), cycles: 2 },
            // shows the transition system doing something other than a fade on first run
            transition: { inType: "Circle Explode", inDurationMs: 800, outType: "Fade", outDurationMs: 600 },
          },
          {
            id: newEffectId(),
            name: "VU Meter",
            startMs: DEMO_DURATION_MS / 2,
            endMs: DEMO_DURATION_MS,
            // the demo audio is synthesized, so the spectrum has something real to react to
            params: { ...defaultParamsFor("VU Meter"), type: "Spectrum", bars: 16 },
            transition: { inType: "Wipe", inDurationMs: 500 },
          },
        ],
      },
      {
        elementType: "model",
        elementId: archId,
        effects: [
          {
            id: newEffectId(),
            name: "Twinkle",
            startMs: 0,
            endMs: DEMO_DURATION_MS / 2,
            params: defaultParamsFor("Twinkle"),
          },
          {
            id: newEffectId(),
            name: "Marquee",
            startMs: DEMO_DURATION_MS / 2,
            endMs: DEMO_DURATION_MS,
            // a value curve on Speed, so the sample show demonstrates one without any setup
            params: { ...defaultParamsFor("Marquee"), speed: { type: "Ramp", min: 2, max: 30 } },
          },
        ],
      },
    ],
  };
}

export interface DemoProjectResult {
  projectId: number;
  sequenceId: number;
}

export async function createSampleProject(): Promise<DemoProjectResult> {
  const project = await api.createProject("Sample Show");
  const layouts = await api.listLayouts(project.id);
  const layout = layouts[0];
  if (!layout) throw new Error("Sample project's layout wasn't created");

  const models = await api.bulkUpsertModels(layout.id, demoModels());
  const matrix = models.find((m) => m.name === "Demo Matrix");
  const arch = models.find((m) => m.name === "Demo Arch");
  if (!matrix || !arch) throw new Error("Sample models weren't created");

  const audioBlob = synthesizeDemoAudioWav(DEMO_DURATION_MS);
  const audioFile = new File([audioBlob], "demo-jingle.wav", { type: "audio/wav" });

  const sequence = await api.createSequence(project.id, {
    name: "Sample Sequence",
    frame_ms: DEMO_FRAME_MS,
    duration_ms: DEMO_DURATION_MS,
    audio_filename: audioFile.name,
  });
  await api.saveSequenceBody(sequence.id, demoSequenceBody(matrix.id, arch.id));

  pendingDemoAudio.set(sequence.id, audioFile);
  return { projectId: project.id, sequenceId: sequence.id };
}
