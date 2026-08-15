<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { DEFAULT_UI_COLORS, type UiColors } from "../lib/uiColors";
import type { PeakBucket } from "../lib/audio";
import { rangeFromDrag } from "../lib/playRange";
import { WAVEFORM_HEIGHT_PX } from "../lib/preferences";

const props = defineProps<{
  peaks: PeakBucket[];
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
  colors?: UiColors;
  /** The section marked for playback, if any (manual: "highlight a range... to play only that"). */
  playRange?: { startMs: number; endMs: number } | null;
  /** xLights' Effects Grid > Small Waveform: half height, to give the rows the space back. */
  small?: boolean;
}>();

const emit = defineEmits<{
  seek: [ms: number];
  scrub: [ms: number];
  scrubEnd: [];
  playRange: [range: { startMs: number; endMs: number } | null];
}>();

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

  // The play range, drawn under the playhead so the line stays readable over it.
  const range = props.playRange;
  if (range && range.endMs > range.startMs) {
    ctx.fillStyle = "rgba(90, 160, 255, 0.22)";
    ctx.fillRect(
      ROW_LABEL_WIDTH + range.startMs * props.pxPerMs,
      0,
      (range.endMs - range.startMs) * props.pxPerMs,
      rect.height,
    );
    ctx.strokeStyle = "rgba(90, 160, 255, 0.8)";
    for (const edge of [range.startMs, range.endMs]) {
      const x = ROW_LABEL_WIDTH + edge * props.pxPerMs;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
  }

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

// Marking a play range is Shift+drag, not a plain drag.
//
// xLights has no audio scrubbing on the waveform, so a plain drag there is free to mean "select".
// Here a plain drag already plays the track under the pointer, which is how you find a beat by
// ear - taking that away to match the gesture exactly would trade a better feature for a more
// familiar one. Shift is the modifier the manual already uses on the waveform for zooming out.
let marking: number | null = null;

function onPointerDown(e: PointerEvent): void {
  const ms = msAt(e);
  if (ms === null) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  if (e.shiftKey) {
    marking = ms;
    // A shift-click with no drag clears the range, which is how you get rid of one.
    emit("playRange", null);
    return;
  }
  scrubbing = true;
  emit("scrub", ms);
}
function onPointerMove(e: PointerEvent): void {
  const ms = msAt(e);
  if (ms === null) return;
  if (marking !== null) {
    // A few pixels of jitter shouldn't become a range nothing can be played from (playRange.ts).
    const range = rangeFromDrag(marking, ms);
    if (range) emit("playRange", range);
    return;
  }
  if (scrubbing) emit("scrub", ms);
}
function onPointerUp(e: PointerEvent): void {
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  marking = null;
  if (!scrubbing) return;
  scrubbing = false;
  emit("scrubEnd");
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => [props.peaks, props.playheadMs, props.pxPerMs, props.durationMs, props.playRange, props.small], draw, { deep: true });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="waveform"
    :style="{ width: `${totalWidth}px`, height: `${small ? WAVEFORM_HEIGHT_PX.small : WAVEFORM_HEIGHT_PX.full}px` }"
    @click="onClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  ></canvas>
</template>

<style scoped>
.waveform {
  /* The height is set inline from the Small Waveform preference; this is the fallback for
     anywhere the component is mounted without one. */
  height: 64px;
  display: block;
  cursor: pointer;
}
</style>
