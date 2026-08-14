<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { DEFAULT_UI_COLORS, type UiColors } from "../lib/uiColors";
import type { PeakBucket } from "../lib/audio";

const props = defineProps<{
  peaks: PeakBucket[];
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
  colors?: UiColors;
}>();

const emit = defineEmits<{ seek: [ms: number]; scrub: [ms: number]; scrubEnd: [] }>();

const ui = (): UiColors => props.colors ?? DEFAULT_UI_COLORS;

const ROW_LABEL_WIDTH = 140; // stays aligned with SequencerGrid's row-label gutter
const canvasRef = ref<HTMLCanvasElement | null>(null);
// Full content width, same formula as SequencerGrid - both live inside the page's shared
// .h-scroll wrapper so they scroll horizontally together, staying aligned at any zoom level.
const totalWidth = computed(() => ROW_LABEL_WIDTH + props.durationMs * props.pxPerMs);

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = ui().waveformBackground;
  ctx.fillRect(0, 0, rect.width, rect.height);

  const mid = rect.height / 2;
  const widthPx = props.durationMs * props.pxPerMs;
  ctx.strokeStyle = ui().waveform;
  ctx.beginPath();
  props.peaks.forEach((p, i) => {
    const x = ROW_LABEL_WIDTH + (i / props.peaks.length) * widthPx;
    ctx.moveTo(x, mid + p.min * mid * 0.9);
    ctx.lineTo(x, mid + p.max * mid * 0.9);
  });
  ctx.stroke();

  const px = ROW_LABEL_WIDTH + props.playheadMs * props.pxPerMs;
  ctx.strokeStyle = "#e74c3c";
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, rect.height);
  ctx.stroke();
}

function msAt(e: PointerEvent | MouseEvent): number | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
  if (x < 0) return null;
  return Math.max(0, Math.round(x / props.pxPerMs));
}

function onClick(e: MouseEvent): void {
  const ms = msAt(e);
  if (ms !== null) emit("seek", ms);
}

// Audio scrubbing: xLights plays the track under the pointer as you drag across the waveform,
// which is how you find a beat by ear rather than by counting. The drag emits `scrub` rather than
// `seek` so the page can play a short burst - a plain seek moves the playhead silently, which is
// the thing that makes finding a downbeat so slow without this.
let scrubbing = false;

function onPointerDown(e: PointerEvent): void {
  const ms = msAt(e);
  if (ms === null) return;
  scrubbing = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  emit("scrub", ms);
}
function onPointerMove(e: PointerEvent): void {
  if (!scrubbing) return;
  const ms = msAt(e);
  if (ms !== null) emit("scrub", ms);
}
function onPointerUp(e: PointerEvent): void {
  if (!scrubbing) return;
  scrubbing = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  emit("scrubEnd");
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => [props.peaks, props.playheadMs, props.pxPerMs, props.durationMs], draw);
</script>

<template>
  <canvas ref="canvasRef" class="waveform" :style="{ width: `${totalWidth}px` }" @click="onClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  ></canvas>
</template>

<style scoped>
.waveform {
  height: 64px;
  display: block;
  cursor: pointer;
}
</style>
