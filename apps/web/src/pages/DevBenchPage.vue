<script setup lang="ts">
/**
 * Dev-only playback benchmark harness. Registered by router/index.ts behind
 * `import.meta.env.DEV`, so it is never reachable in a production build.
 *
 * It exists because the sequencer's real route needs Postgres + Laravel + an
 * authenticated project/sequence, which makes "how fast does playback actually
 * run" impossible to answer from a cold checkout. This mounts the real
 * SequencerGrid and HousePreview against synthetic fixtures at the M9 perf
 * budget (ROADMAP.md: 100 rows / 5k effects) and measures frame time while the
 * playhead sweeps, so before/after numbers are reproducible.
 */
import { computed, nextTick, ref } from "vue";
import SequencerGrid, { type GridRow } from "../components/SequencerGrid.vue";
import HousePreview from "../components/HousePreview.vue";
import Waveform from "../components/Waveform.vue";
import { EFFECT_SCHEMAS, defaultParamsFor } from "@webxlights/engine";
import type { PeakBucket } from "../lib/audio";
import type { ModelRecord, SequenceBody, SequenceEffect } from "../lib/api";

// Taken from the registry rather than hardcoded: schema keys are display names
// ("Color Wash", not "ColorWash") and a miss renders nothing at all.
const EFFECT_NAMES = Object.keys(EFFECT_SCHEMAS);
const DURATION_MS = 180_000;
const FRAME_MS = 50;

const modelCount = ref(12);
const rowCount = ref(100);
const effectsPerRow = ref(50);

function makeModels(n: number): ModelRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Matrix ${i + 1}`,
    type: "Matrix",
    supported: true,
    params: {},
    raw_attrs: { NumStrings: "16", NodesPerString: "25" },
    screen: { x: (i % 4) * 90 - 135, y: Math.floor(i / 4) * 90 - 90, scale: 1 },
    strings: 16,
    nodes_per_string: 25,
    string_type: "RGB Nodes",
    start_channel: "1",
    channel_count: 1200,
    controller_id: null,
    controller_offset: null,
    order: i,
  }));
}

function makeBody(rows: number, perRow: number): SequenceBody {
  const out: SequenceBody = { timingTracks: [{ name: "Beats", marks: [] }], rows: [] };
  for (let ms = 0; ms < DURATION_MS; ms += 2000) out.timingTracks[0]!.marks.push(ms);
  for (let r = 0; r < rows; r++) {
    const effects: SequenceEffect[] = [];
    const span = Math.floor(DURATION_MS / perRow);
    for (let e = 0; e < perRow; e++) {
      const startMs = e * span;
      const name = EFFECT_NAMES[(r + e) % EFFECT_NAMES.length]!;
      effects.push({
        id: `bench_${r}_${e}`,
        name,
        startMs,
        endMs: startMs + Math.floor(span * 0.8),
        params: defaultParamsFor(name),
      });
    }
    // One row per element, as a real body has. Rows 1..models.length line up with
    // real model ids so the 3D preview has work to do; the rest are grid-only.
    out.rows.push({ elementType: "model" as const, elementId: r + 1, effects });
  }
  return out;
}

const models = computed(() => makeModels(modelCount.value));
const body = ref<SequenceBody>(makeBody(rowCount.value, effectsPerRow.value));
const rows = computed<GridRow[]>(() =>
  Array.from({ length: rowCount.value }, (_, i) => ({
    elementType: "model" as const,
    elementId: i + 1,
    name: `Row ${i + 1}`,
  })),
);

const playheadMs = ref(0);
const selectedEffectId = ref<string | null>(null);
const result = ref<string>("");
const running = ref(false);
const pendingName = ref<string | null>(null);

function rebuild(): void {
  body.value = makeBody(rowCount.value, effectsPerRow.value);
}

/**
 * Advance the playhead N times and measure the CPU cost of each update.
 *
 * Deliberately not rAF-driven: the harness commonly runs in a backgrounded tab,
 * where rAF is throttled to ~1Hz and the numbers become meaningless. Vue's
 * watchers flush on the microtask queue, so awaiting nextTick() after each
 * playhead change captures the real per-frame work (HousePreview.updateColors +
 * SequencerGrid.draw) regardless of tab visibility. Three.js' own renderer.render
 * runs in a separate rAF loop and is therefore NOT included here — this measures
 * the CPU pipeline that was the bottleneck, not GPU submit time.
 */
async function runBenchmark(frameCount = 240): Promise<void> {
  running.value = true;
  result.value = "running...";
  const frames: number[] = [];
  const step = Math.floor(DURATION_MS / frameCount);
  for (let i = 0; i < frameCount; i++) {
    const t0 = performance.now();
    playheadMs.value = (i * step) % DURATION_MS;
    await nextTick();
    frames.push(performance.now() - t0);
  }
  // drop warmup frames (first paint / JIT)
  const samples = frames.slice(10).sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
  result.value = JSON.stringify(
    {
      frames: samples.length,
      meanFrameMs: +mean.toFixed(2),
      p50FrameMs: +p50.toFixed(2),
      p95FrameMs: +p95.toFixed(2),
      maxFpsFromCpu: +(1000 / mean).toFixed(1),
      p95MaxFps: +(1000 / p95).toFixed(1),
      rows: rowCount.value,
      effects: rowCount.value * effectsPerRow.value,
      models: modelCount.value,
    },
    null,
    2,
  );
  running.value = false;
  (window as unknown as { __benchResult?: string }).__benchResult = result.value;
}

// The grid is presentational - it emits intents and the page applies them. The
// harness mirrors SequencerPage's handlers so drag/resize/place are exercisable
// here too, and exposes the body for assertions.
function rowEffects(row: GridRow) {
  return body.value.rows.find((r) => r.elementType === row.elementType && r.elementId === row.elementId)?.effects;
}
function onMove(effectId: string, startMs: number, endMs: number): void {
  for (const r of body.value.rows) {
    const e = r.effects.find((x) => x.id === effectId);
    if (e) {
      e.startMs = startMs;
      e.endMs = endMs;
    }
  }
}
function onPlace(row: GridRow, startMs: number, endMs: number): void {
  rowEffects(row)?.push({ id: `placed_${Date.now()}`, name: EFFECT_NAMES[0]!, startMs, endMs, params: defaultParamsFor(EFFECT_NAMES[0]!) });
}
// Matches main's 3-arg emit; the page owns placement (lib/effectPlacement.ts).
function onDropEffect(row: GridRow, name: string, startMs: number): void {
  rowEffects(row)?.push({ id: `dropped_${Date.now()}`, name, startMs, endMs: startMs + 1000, params: defaultParamsFor(name) });
}

(window as unknown as { __runBench?: (n?: number) => Promise<void> }).__runBench = runBenchmark;
(window as unknown as { __benchBody?: () => SequenceBody }).__benchBody = () => body.value;
(window as unknown as { __setPending?: (n: string | null) => void }).__setPending = (n) => (pendingName.value = n);

// ---- interaction benchmarks --------------------------------------------------------------
//
// The playhead sweep above measures playback; these measure what the sweep cannot - the costs
// a person feels with the transport stopped: scrolling the timeline, zooming it, and dragging
// an effect. The grid and waveform are mounted inside the same kind of shared horizontal
// scroller SequencerPage uses, so scrollLeft means the same thing here as there.

const pxPerMs = ref(0.01);
// The 3D preview renders every rAF; under software GL that floors any frame-time measurement
// at tens of milliseconds. The interaction benches pause it so they measure the grid, not it.
const previewPaused = ref(false);
const hScrollRef = ref<HTMLDivElement | null>(null);
// Synthetic waveform peaks, enough buckets that the waveform has real work per draw.
const peaks: PeakBucket[] = Array.from({ length: 4000 }, (_, i) => {
  const v = 0.2 + 0.75 * Math.abs(Math.sin(i / 7) * Math.cos(i / 31));
  return { min: -v, max: v };
});

const frame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

function summarise(samples: number[], extra: Record<string, unknown>): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const out = JSON.stringify(
    {
      steps: sorted.length,
      meanStepMs: +mean.toFixed(2),
      p50StepMs: +(sorted[Math.floor(sorted.length * 0.5)] ?? 0).toFixed(2),
      p95StepMs: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2),
      ...extra,
    },
    null,
    2,
  );
  result.value = out;
  (window as unknown as { __benchResult?: string }).__benchResult = out;
  return out;
}

/** Sweep scrollLeft across the timeline, measuring each step's full frame (scroll -> redraw). */
async function runScrollBench(steps = 120): Promise<void> {
  const el = hScrollRef.value;
  if (!el) return;
  const max = Math.max(1, el.scrollWidth - el.clientWidth);
  const samples: number[] = [];
  el.scrollLeft = 0;
  await frame();
  for (let i = 0; i < steps; i++) {
    const t0 = performance.now();
    el.scrollLeft = Math.floor((i / (steps - 1)) * max);
    await frame();
    await frame();
    samples.push(performance.now() - t0);
  }
  summarise(samples.slice(5), { kind: "scroll", pxPerMs: pxPerMs.value, scrollWidth: el.scrollWidth });
}

/** Step the zoom through a range, measuring each relayout+redraw. */
async function runZoomBench(steps = 40): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = performance.now();
    pxPerMs.value = 0.01 * Math.pow(1.12, i % 20);
    await nextTick();
    await frame();
    await frame();
    samples.push(performance.now() - t0);
  }
  pxPerMs.value = 0.01;
  await nextTick();
  summarise(samples.slice(3), { kind: "zoom" });
}

/** Drag the first effect across the grid with synthetic pointer events, measuring each move. */
async function runDragBench(moves = 120): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>(".grid-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const opts = (x: number, y: number) => ({
    bubbles: true,
    pointerId: 1,
    clientX: rect.left + x,
    clientY: rect.top + y,
    button: 0,
    buttons: 1,
  });
  // Row 0's first effect starts at t=0; grab it mid-body just under the ruler.
  const startX = 150 + 20;
  const y = 24 + 14;
  canvas.dispatchEvent(new PointerEvent("pointerdown", opts(startX, y)));
  const samples: number[] = [];
  for (let i = 0; i < moves; i++) {
    const t0 = performance.now();
    canvas.dispatchEvent(new PointerEvent("pointermove", opts(startX + 2 + i * 3, y)));
    await frame();
    samples.push(performance.now() - t0);
  }
  canvas.dispatchEvent(new PointerEvent("pointerup", opts(startX + 2 + moves * 3, y)));
  summarise(samples.slice(5), { kind: "drag", pxPerMs: pxPerMs.value });
}

(window as unknown as { __setPxPerMs?: (v: number) => Promise<void> }).__setPxPerMs = async (v) => {
  pxPerMs.value = v;
  await nextTick();
  await frame();
};
(window as unknown as { __setPreviewPaused?: (v: boolean) => void }).__setPreviewPaused = (v) => (previewPaused.value = v);
(window as unknown as { __runScrollBench?: (n?: number) => Promise<void> }).__runScrollBench = runScrollBench;
(window as unknown as { __runZoomBench?: (n?: number) => Promise<void> }).__runZoomBench = runZoomBench;
(window as unknown as { __runDragBench?: (n?: number) => Promise<void> }).__runDragBench = runDragBench;
</script>

<template>
  <div class="bench">
    <h1>Playback benchmark (dev only)</h1>
    <div class="controls">
      <label>models <input v-model.number="modelCount" type="number" min="1" max="60" /></label>
      <label>rows <input v-model.number="rowCount" type="number" min="1" max="400" /></label>
      <label>effects/row <input v-model.number="effectsPerRow" type="number" min="1" max="200" /></label>
      <button @click="rebuild">Rebuild fixture</button>
      <button :disabled="running" @click="runBenchmark()">Run benchmark</button>
      <span class="muted">total effects: {{ rowCount * effectsPerRow }}</span>
    </div>
    <pre class="result">{{ result }}</pre>

    <div class="preview-box">
      <HousePreview :models="models" :body="body" :playhead-ms="playheadMs" :frame-ms="FRAME_MS" :paused="previewPaused" />
    </div>

    <!-- The same shared horizontal scroller SequencerPage wraps these in, so scroll and zoom
         behave (and cost) here what they cost there. -->
    <div ref="hScrollRef" class="h-scroll">
      <Waveform :peaks="peaks" :duration-ms="DURATION_MS" :px-per-ms="pxPerMs" :playhead-ms="playheadMs" />
      <SequencerGrid
        :rows="rows"
        :body="body"
        :duration-ms="DURATION_MS"
        :px-per-ms="pxPerMs"
        :playhead-ms="playheadMs"
        :selected-effect-id="selectedEffectId"
        :pending-effect-name="pendingName"
        @select="(id: string | null) => (selectedEffectId = id)"
        @move="onMove"
        @place="onPlace"
        @drop-effect="onDropEffect"
      />
    </div>
  </div>
</template>

<style scoped>
.bench {
  padding: 16px;
  color: #ddd;
  font: 13px system-ui;
}
.h-scroll {
  overflow-x: auto;
}
.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.controls input {
  width: 60px;
}
.muted {
  color: #888;
}
.result {
  background: #16161b;
  padding: 8px;
  min-height: 20px;
}
.preview-box {
  height: 260px;
  background: #0c0c0f;
  margin-bottom: 12px;
}
</style>
