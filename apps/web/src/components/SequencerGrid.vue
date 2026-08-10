<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { SequenceBody, SequenceEffect } from "../lib/api";

export interface GridRow {
  elementType: "model" | "group";
  elementId: number;
  name: string;
}

const props = defineProps<{
  rows: GridRow[];
  body: SequenceBody;
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
  selectedEffectId: string | null;
  pendingEffectName: string | null; // armed from the palette; next drag places this
}>();

const emit = defineEmits<{
  select: [effectId: string | null];
  place: [row: GridRow, startMs: number, endMs: number];
  move: [effectId: string, startMs: number, endMs: number];
  seek: [ms: number];
}>();

const ROW_HEIGHT = 28;
const ROW_LABEL_WIDTH = 140;
const VIEWPORT_HEIGHT = 420; // fixed canvas height - only visible rows are drawn (M9 perf budget: 100 rows / 5k effects)

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
let dragState:
  | { kind: "place"; row: GridRow; startMs: number }
  | { kind: "move"; effect: SequenceEffect; grabOffsetMs: number }
  | { kind: "resize"; effect: SequenceEffect }
  | null = null;

function effectsForRow(row: GridRow): SequenceEffect[] {
  const found = props.body.rows.find((r) => r.elementType === row.elementType && r.elementId === row.elementId);
  return found?.effects ?? [];
}

function msToX(ms: number): number {
  return ROW_LABEL_WIDTH + ms * props.pxPerMs;
}
function xToMs(x: number): number {
  return Math.max(0, Math.round((x - ROW_LABEL_WIDTH) / props.pxPerMs));
}

// Canvas is a fixed-height viewport, not sized to all rows - only rows within
// [scrollTop, scrollTop+viewport] are ever iterated/drawn, so cost stays flat regardless of
// total row count (M9 perf budget: 100 visible rows / 5k total effects). A spacer div below
// gives the wrapper real scroll range; the canvas draws with a `-scrollTop` offset so content
// appears to scroll under it.
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

  ctx.fillStyle = "#16161b";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const firstRow = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT));
  const lastRow = Math.min(props.rows.length, Math.ceil((scrollTop.value + rect.height) / ROW_HEIGHT));

  for (let i = firstRow; i < lastRow; i++) {
    const row = props.rows[i]!;
    const y = i * ROW_HEIGHT - scrollTop.value;
    ctx.fillStyle = i % 2 === 0 ? "#1a1a20" : "#18181d";
    ctx.fillRect(0, y, rect.width, ROW_HEIGHT);

    ctx.fillStyle = "#aaa";
    ctx.font = "11px system-ui";
    ctx.fillText(row.name, 8, y + ROW_HEIGHT / 2 + 4, ROW_LABEL_WIDTH - 12);

    for (const effect of effectsForRow(row)) {
      const x1 = msToX(effect.startMs);
      const x2 = msToX(effect.endMs);
      const selected = effect.id === props.selectedEffectId;
      ctx.fillStyle = selected ? "#e8c468" : "#5b7fb5";
      ctx.fillRect(x1, y + 2, Math.max(2, x2 - x1), ROW_HEIGHT - 4);
      ctx.strokeStyle = selected ? "#fff" : "#2c3e5c";
      ctx.strokeRect(x1, y + 2, Math.max(2, x2 - x1), ROW_HEIGHT - 4);
      if (x2 - x1 > 24) {
        ctx.fillStyle = "#0c0c0f";
        ctx.font = "10px system-ui";
        ctx.fillText(effect.name, x1 + 3, y + ROW_HEIGHT / 2 + 3, x2 - x1 - 6);
      }
    }
  }

  // row label divider
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(ROW_LABEL_WIDTH, 0);
  ctx.lineTo(ROW_LABEL_WIDTH, rect.height);
  ctx.stroke();

  // playhead
  const px = msToX(props.playheadMs);
  ctx.strokeStyle = "#e74c3c";
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, rect.height);
  ctx.stroke();
}

function hitTest(x: number, y: number): { row: GridRow; effect: SequenceEffect } | null {
  const rowIndex = Math.floor((y + scrollTop.value) / ROW_HEIGHT);
  const row = props.rows[rowIndex];
  if (!row) return null;
  const ms = xToMs(x);
  for (const effect of effectsForRow(row)) {
    if (ms >= effect.startMs && ms <= effect.endMs) return { row, effect };
  }
  return null;
}

function onScroll(): void {
  if (!scrollRef.value) return;
  scrollTop.value = scrollRef.value.scrollTop;
  draw();
}

function onPointerDown(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < ROW_LABEL_WIDTH) return;

  const hit = hitTest(x, y);
  if (hit) {
    emit("select", hit.effect.id);
    const nearRightEdge = Math.abs(msToX(hit.effect.endMs) - x) < 6;
    if (nearRightEdge) {
      dragState = { kind: "resize", effect: hit.effect };
    } else {
      dragState = { kind: "move", effect: hit.effect, grabOffsetMs: xToMs(x) - hit.effect.startMs };
    }
    return;
  }

  emit("select", null);
  const rowIndex = Math.floor((y + scrollTop.value) / ROW_HEIGHT);
  const row = props.rows[rowIndex];
  if (row && props.pendingEffectName) {
    dragState = { kind: "place", row, startMs: xToMs(x) };
  } else {
    emit("seek", xToMs(x));
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!dragState) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const ms = xToMs(x);

  if (dragState.kind === "place") {
    // live preview by mutating a scratch copy isn't wired for M2 simplicity; commit on pointerup.
    return;
  }
  if (dragState.kind === "resize") {
    const clamped = Math.max(dragState.effect.startMs + 50, ms);
    emit("move", dragState.effect.id, dragState.effect.startMs, clamped);
  }
  if (dragState.kind === "move") {
    const duration = dragState.effect.endMs - dragState.effect.startMs;
    const newStart = Math.max(0, ms - dragState.grabOffsetMs);
    emit("move", dragState.effect.id, newStart, newStart + duration);
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragState?.kind === "place") {
    const canvas = canvasRef.value;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const endMs = xToMs(x);
      const startMs = Math.min(dragState.startMs, endMs);
      const finalEnd = Math.max(dragState.startMs, endMs, startMs + 200);
      emit("place", dragState.row, startMs, finalEnd);
    }
  }
  dragState = null;
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
// flush: "post" - draw() reads getBoundingClientRect(), which must run after Vue applies
// any template-derived inline sizing, not before (pre-flush default risks a stale 0px read
// on the same tick rows go from empty to populated - see DECISIONS.md M2 bug note).
watch(() => [props.rows, props.body, props.playheadMs, props.selectedEffectId, props.pxPerMs], draw, { deep: true, flush: "post" });
</script>

<template>
  <div ref="scrollRef" class="grid-scroll-viewport" :style="{ height: `${VIEWPORT_HEIGHT}px` }" @scroll="onScroll">
    <div class="grid-spacer" :style="{ height: `${rows.length * ROW_HEIGHT}px` }">
      <canvas
        ref="canvasRef"
        class="grid-canvas"
        :style="{ height: `${VIEWPORT_HEIGHT}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll-viewport {
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}
.grid-spacer {
  position: relative;
}
.grid-canvas {
  width: 100%;
  display: block;
  cursor: crosshair;
  position: sticky;
  top: 0;
}
</style>
