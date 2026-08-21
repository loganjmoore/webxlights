<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
  // "Zoom in on the waveform by double clicking on the waveform... To zoom out, hold the shift key
  // and double click." The moment under the pointer goes with it so the page can hold it still.
  zoom: [direction: -1 | 1, ms: number, clientX: number];
  // "Right-click the timeline to reset the zoom level." The waveform stands in for xLights'
  // separate timeline bar, which this app doesn't have - and the grid's own ruler is already
  // spoken for by the timing-mark menu, so putting it there would cost a gesture we use.
  resetZoom: [];
}>();

const ui = (): UiColors => props.colors ?? DEFAULT_UI_COLORS;

const ROW_LABEL_WIDTH = 140; // stays aligned with SequencerGrid's row-label gutter
const canvasRef = ref<HTMLCanvasElement | null>(null);
// Full content width, same formula as SequencerGrid - both live inside the page's shared
// .h-scroll wrapper so they scroll horizontally together, staying aligned at any zoom level.
// The spacer div carries this width; the canvas itself is viewport-sized and rides the scroll
// (see SequencerGrid's horizontal-virtualisation note - same costs, same fix).
const totalWidth = computed(() => ROW_LABEL_WIDTH + props.durationMs * props.pxPerMs);
const viewportWidth = ref(0);
const canvasWidth = computed(() =>
  viewportWidth.value > 0 ? Math.min(totalWidth.value, viewportWidth.value) : totalWidth.value,
);

let scrollLeft = 0;
let hScrollEl: HTMLElement | null = null;
let hScrollResize: ResizeObserver | null = null;

function onHScroll(): void {
  if (!hScrollEl || !canvasRef.value) return;
  scrollLeft = hScrollEl.scrollLeft;
  canvasRef.value.style.transform = `translateX(${scrollLeft}px)`;
  draw();
}

function attachHScroll(): void {
  let el: HTMLElement | null = canvasRef.value?.parentElement ?? null;
  while (el) {
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") break;
    el = el.parentElement;
  }
  hScrollEl = el;
  if (!hScrollEl) return; // no horizontal scroller: full-width canvas, exactly as before
  hScrollEl.addEventListener("scroll", onHScroll, { passive: true });
  hScrollResize = new ResizeObserver(() => {
    viewportWidth.value = hScrollEl?.clientWidth ?? 0;
    draw();
  });
  hScrollResize.observe(hScrollEl);
  viewportWidth.value = hScrollEl.clientWidth;
  onHScroll();
}

// Assigning canvas.width/height reallocates and clears the backing store - the same cost
// SequencerGrid's draw() documents avoiding. The playhead redraws this canvas every frame of
// playback, and at deep zoom the canvas is tens of thousands of pixels wide, so an
// unconditional realloc per tick is real money.
let lastBackingW = 0;
let lastBackingH = 0;

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const bw = Math.round(rect.width * dpr);
  const bh = Math.round(rect.height * dpr);
  if (bw !== lastBackingW || bh !== lastBackingH) {
    canvas.width = bw;
    canvas.height = bh;
    lastBackingW = bw;
    lastBackingH = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = ui().waveformBackground;
  ctx.fillRect(0, 0, rect.width, rect.height);

  const view = scrollLeft;
  const mid = rect.height / 2;
  const widthPx = props.durationMs * props.pxPerMs;
  ctx.strokeStyle = ui().waveform;
  ctx.beginPath();
  // Only the peak buckets whose x lands inside the viewport - at deep zoom the full list is
  // thousands of strokes for pixels nobody can see.
  const count = props.peaks.length;
  const bucketPx = count > 0 ? widthPx / count : 1;
  const first = Math.max(0, Math.floor((view - ROW_LABEL_WIDTH) / Math.max(bucketPx, 1e-6)));
  const last = Math.min(count, Math.ceil((view + rect.width - ROW_LABEL_WIDTH) / Math.max(bucketPx, 1e-6)) + 1);
  for (let i = first; i < last; i++) {
    const p = props.peaks[i]!;
    const x = ROW_LABEL_WIDTH + i * bucketPx - view;
    ctx.moveTo(x, mid + p.min * mid * 0.9);
    ctx.lineTo(x, mid + p.max * mid * 0.9);
  }
  ctx.stroke();

  // The play range, drawn under the playhead so the line stays readable over it.
  const range = props.playRange;
  if (range && range.endMs > range.startMs) {
    ctx.fillStyle = "rgba(90, 160, 255, 0.22)";
    ctx.fillRect(
      ROW_LABEL_WIDTH + range.startMs * props.pxPerMs - view,
      0,
      (range.endMs - range.startMs) * props.pxPerMs,
      rect.height,
    );
    ctx.strokeStyle = "rgba(90, 160, 255, 0.8)";
    for (const edge of [range.startMs, range.endMs]) {
      const x = ROW_LABEL_WIDTH + edge * props.pxPerMs - view;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
  }

  const px = ROW_LABEL_WIDTH + props.playheadMs * props.pxPerMs - view;
  ctx.strokeStyle = "#e74c3c";
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, rect.height);
  ctx.stroke();

  // The gutter, pinned: covers anything that slid under it, keeping the waveform's left edge
  // aligned with the grid's label column below it.
  if (view > 0) {
    ctx.fillStyle = ui().waveformBackground;
    ctx.fillRect(0, 0, ROW_LABEL_WIDTH, rect.height);
  }
}

function msAt(e: PointerEvent | MouseEvent): number | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const local = e.clientX - rect.left;
  // The gutter is pinned to the viewport now, so the dead zone is the local left edge; the
  // moment under the pointer is the local position plus however far the timeline is scrolled.
  if (local < ROW_LABEL_WIDTH) return null;
  return Math.max(0, Math.round((local + scrollLeft - ROW_LABEL_WIDTH) / props.pxPerMs));
}

function onClick(e: MouseEvent): void {
  const ms = msAt(e);
  if (ms !== null) emit("seek", ms);
}

function onDoubleClick(e: MouseEvent): void {
  const ms = msAt(e);
  if (ms === null) return;
  emit("zoom", e.shiftKey ? -1 : 1, ms, e.clientX);
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  emit("resetZoom");
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

// Dragging an existing range's edge, rather than re-marking the whole thing.
//
// Adjusting a range by shift-dragging a new one from scratch means finding both ends again to move
// one of them, which is most of what you do with a range once it roughly covers the chorus.
let draggingEdge: "start" | "end" | null = null;

const EDGE_PX = 5;

/** Which edge of the range the pointer is on, if either. */
function edgeAt(ms: number): "start" | "end" | null {
  const range = props.playRange;
  if (!range) return null;
  const toleranceMs = EDGE_PX / props.pxPerMs;
  if (Math.abs(ms - range.startMs) <= toleranceMs) return "start";
  if (Math.abs(ms - range.endMs) <= toleranceMs) return "end";
  return null;
}

const cursor = ref("pointer");

function onPointerDown(e: PointerEvent): void {
  const ms = msAt(e);
  if (ms === null) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  // An edge takes precedence over both the scrub and the shift-mark: the pointer is only ever on
  // one when a range already exists, and grabbing it is unambiguously what was meant.
  const edge = edgeAt(ms);
  if (edge) {
    draggingEdge = edge;
    return;
  }

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

  if (draggingEdge) {
    const range = props.playRange;
    if (!range) return;
    // Built through rangeFromDrag so a dragged edge obeys the same minimum length as a marked one -
    // dragging one edge past the other would otherwise leave a range that loops without advancing.
    const next = rangeFromDrag(draggingEdge === "start" ? range.endMs : range.startMs, ms);
    if (next) emit("playRange", next);
    return;
  }
  if (marking !== null) {
    // A few pixels of jitter shouldn't become a range nothing can be played from (playRange.ts).
    const range = rangeFromDrag(marking, ms);
    if (range) emit("playRange", range);
    return;
  }
  if (scrubbing) {
    emit("scrub", ms);
    return;
  }
  cursor.value = edgeAt(ms) ? "col-resize" : "pointer";
}
function onPointerUp(e: PointerEvent): void {
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  marking = null;
  draggingEdge = null;
  if (!scrubbing) return;
  scrubbing = false;
  emit("scrubEnd");
}

onMounted(() => {
  attachHScroll();
  draw();
  window.addEventListener("resize", draw);
});
onUnmounted(() => {
  window.removeEventListener("resize", draw);
  hScrollEl?.removeEventListener("scroll", onHScroll);
  hScrollResize?.disconnect();
});
// flush: "post", for the same reason SequencerGrid's draw watcher says it: draw() reads
// getBoundingClientRect(), which must run AFTER Vue applies the template's inline width. With
// the default pre-flush, a zoom change drew the playhead at the new px-per-ms into a bitmap
// still sized for the old width; the browser then stretched that bitmap to the new width,
// sliding the red line away from the grid's - and while paused nothing redrew to correct it.
watch(() => [props.peaks, props.playheadMs, props.pxPerMs, props.durationMs, props.playRange, props.small], draw, {
  deep: true,
  flush: "post",
});
</script>

<template>
  <div class="wave-spacer" :style="{ width: `${totalWidth}px` }">
    <canvas
      ref="canvasRef"
      class="waveform"
      :style="{
        width: `${canvasWidth}px`,
        height: `${small ? WAVEFORM_HEIGHT_PX.small : WAVEFORM_HEIGHT_PX.full}px`,
        cursor,
      }"
      @click="onClick"
      @dblclick="onDoubleClick"
      @contextmenu="onContextMenu"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    ></canvas>
  </div>
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
