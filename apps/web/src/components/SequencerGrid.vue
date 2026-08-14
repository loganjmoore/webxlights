<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { SequenceBody, SequenceEffect } from "../lib/api";

export interface GridRow {
  elementType: "model" | "group" | "submodel";
  elementId: number;
  name: string;
  /** Set only for sub-model rows; names which sub-model of `elementId` this is. */
  subName?: string;
}

export type ContextMenuTarget =
  | { kind: "effect"; row: GridRow; effect: SequenceEffect; ms: number; x: number; y: number }
  | { kind: "mark"; trackIndex: number; ms: number; x: number; y: number }
  | { kind: "ruler-empty"; trackIndex: number; ms: number; x: number; y: number };

const props = defineProps<{
  rows: GridRow[];
  body: SequenceBody;
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
  selectedEffectId: string | null;
  pendingEffectName: string | null; // armed from the palette; next drag places this
  // xLights' "snap to timing marks" preference. Off, an edge lands exactly where it was dropped,
  // which is what you want when placing against the music by ear rather than against the marks.
  snapToTiming?: boolean;
}>();

const emit = defineEmits<{
  select: [effectId: string | null];
  place: [row: GridRow, startMs: number, endMs: number];
  dropEffect: [row: GridRow, name: string, startMs: number];
  move: [effectId: string, startMs: number, endMs: number];
  seek: [ms: number];
  dragStart: [];
  addMark: [trackIndex: number, ms: number];
  contextmenu: [target: ContextMenuTarget];
}>();

const ROW_HEIGHT = 28;
const ROW_LABEL_WIDTH = 140;
const HEADER_HEIGHT = 24; // pinned timing-track ruler, drawn every frame regardless of scrollTop
const VIEWPORT_HEIGHT = 420; // fixed canvas height - only visible rows are drawn (M9 perf budget: 100 rows / 5k effects)
const EDGE_PX = 6;
const SNAP_PX = 6;

// Must match SequencerPage.vue's palette dragstart MIME type exactly - namespaced so this
// grid ignores any other drag source that happens to land here (matches ModelPalette.vue's
// same convention on the Layout page, for the same reason).
const EFFECT_DRAG_MIME = "application/x-webxlights-effect-name";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const hoverCursor = ref("crosshair");
let dragState:
  | { kind: "place"; row: GridRow; startMs: number }
  | { kind: "move"; effect: SequenceEffect; grabOffsetMs: number }
  | { kind: "resize"; effect: SequenceEffect; edge: "left" | "right" }
  | null = null;

// Full content width, not container width - at zoom > baseline this is wider than the
// viewport on purpose; the parent page wraps this component in an overflow-x:auto element
// so the extra width becomes reachable by scroll instead of clipped and unreachable.
const totalWidth = computed(() => ROW_LABEL_WIDTH + props.durationMs * props.pxPerMs);

function effectsForRow(row: GridRow): SequenceEffect[] {
  const found = props.body.rows.find((r) => r.elementType === row.elementType && r.elementId === row.elementId);
  return found?.effects ?? [];
}

function allMarks(): number[] {
  return props.body.timingTracks.flatMap((t) => t.marks);
}

function snapMs(ms: number): number {
  if (props.snapToTiming === false) return ms;
  const toleranceMs = SNAP_PX / props.pxPerMs;
  let closest = ms;
  let closestDist = toleranceMs;
  for (const mark of allMarks()) {
    const dist = Math.abs(mark - ms);
    if (dist <= closestDist) {
      closest = mark;
      closestDist = dist;
    }
  }
  return closest;
}

function msToX(ms: number): number {
  return ROW_LABEL_WIDTH + ms * props.pxPerMs;
}
function xToMs(x: number): number {
  return Math.max(0, Math.round((x - ROW_LABEL_WIDTH) / props.pxPerMs));
}

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

  const rowsAreaHeight = rect.height - HEADER_HEIGHT;
  const firstRow = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT));
  const lastRow = Math.min(props.rows.length, Math.ceil((scrollTop.value + rowsAreaHeight) / ROW_HEIGHT));

  for (let i = firstRow; i < lastRow; i++) {
    const row = props.rows[i]!;
    const y = HEADER_HEIGHT + i * ROW_HEIGHT - scrollTop.value;
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

  // pinned timing-track ruler - always drawn at y=0..HEADER_HEIGHT regardless of scrollTop
  ctx.fillStyle = "#20202a";
  ctx.fillRect(0, 0, rect.width, HEADER_HEIGHT);
  ctx.fillStyle = "#777";
  ctx.font = "10px system-ui";
  ctx.fillText("Marks", 8, HEADER_HEIGHT / 2 + 3);
  for (const ms of allMarks()) {
    const x = msToX(ms);
    ctx.strokeStyle = "#e8c468";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEADER_HEIGHT);
    ctx.stroke();
    ctx.fillStyle = "#e8c468";
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT);
  ctx.lineTo(rect.width, HEADER_HEIGHT);
  ctx.stroke();

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

type HitResult =
  | { kind: "effect"; row: GridRow; effect: SequenceEffect; edge: "left" | "right" | null }
  | { kind: "mark"; trackIndex: number; ms: number }
  | { kind: "ruler-empty"; trackIndex: number; ms: number }
  | { kind: "row-empty"; row: GridRow }
  | { kind: "none" };

function hitTest(x: number, y: number): HitResult {
  if (x < ROW_LABEL_WIDTH) return { kind: "none" };

  if (y < HEADER_HEIGHT) {
    const ms = xToMs(x);
    for (const mark of allMarks()) {
      if (Math.abs(msToX(mark) - x) < EDGE_PX) return { kind: "mark", trackIndex: 0, ms: mark };
    }
    return { kind: "ruler-empty", trackIndex: 0, ms };
  }

  const rowIndex = Math.floor((y - HEADER_HEIGHT + scrollTop.value) / ROW_HEIGHT);
  const row = props.rows[rowIndex];
  if (!row) return { kind: "none" };

  const ms = xToMs(x);
  for (const effect of effectsForRow(row)) {
    if (ms >= effect.startMs && ms <= effect.endMs) {
      const nearLeft = Math.abs(msToX(effect.startMs) - x) < EDGE_PX;
      const nearRight = Math.abs(msToX(effect.endMs) - x) < EDGE_PX;
      return { kind: "effect", row, effect, edge: nearRight ? "right" : nearLeft ? "left" : null };
    }
  }
  return { kind: "row-empty", row };
}

function onScroll(): void {
  if (!scrollRef.value) return;
  scrollTop.value = scrollRef.value.scrollTop;
  draw();
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);

  if (hit.kind === "effect") {
    emit("contextmenu", { kind: "effect", row: hit.row, effect: hit.effect, ms: xToMs(x), x: e.clientX, y: e.clientY });
  } else if (hit.kind === "mark") {
    emit("contextmenu", { kind: "mark", trackIndex: hit.trackIndex, ms: hit.ms, x: e.clientX, y: e.clientY });
  } else if (hit.kind === "ruler-empty") {
    emit("contextmenu", { kind: "ruler-empty", trackIndex: hit.trackIndex, ms: hit.ms, x: e.clientX, y: e.clientY });
  }
  // row-empty / none: no menu (placement already has its own gesture - armed palette + drag)
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);

  if (hit.kind === "ruler-empty") {
    emit("addMark", hit.trackIndex, hit.ms);
    return;
  }
  if (hit.kind === "mark") {
    return; // marks aren't draggable in this milestone; right-click deletes
  }

  if (hit.kind === "effect") {
    emit("select", hit.effect.id);
    emit("dragStart");
    if (hit.edge) {
      dragState = { kind: "resize", effect: hit.effect, edge: hit.edge };
    } else {
      dragState = { kind: "move", effect: hit.effect, grabOffsetMs: xToMs(x) - hit.effect.startMs };
    }
    return;
  }

  emit("select", null);
  if (hit.kind === "row-empty" && props.pendingEffectName) {
    dragState = { kind: "place", row: hit.row, startMs: xToMs(x) };
  } else {
    emit("seek", xToMs(x));
  }
}

function updateHoverCursor(x: number, y: number): void {
  const hit = hitTest(x, y);
  if (hit.kind === "effect") hoverCursor.value = hit.edge ? "col-resize" : "grab";
  else if (hit.kind === "mark") hoverCursor.value = "pointer";
  else hoverCursor.value = "crosshair";
}

function onPointerMove(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (!dragState) {
    updateHoverCursor(x, y);
    return;
  }

  const ms = xToMs(x);

  if (dragState.kind === "place") {
    // live preview by mutating a scratch copy isn't wired for M2 simplicity; commit on pointerup.
    return;
  }
  if (dragState.kind === "resize") {
    hoverCursor.value = "col-resize";
    const snapped = snapMs(ms);
    if (dragState.edge === "right") {
      const clamped = Math.max(dragState.effect.startMs + 50, snapped);
      emit("move", dragState.effect.id, dragState.effect.startMs, clamped);
    } else {
      const clamped = Math.max(0, Math.min(dragState.effect.endMs - 50, snapped));
      emit("move", dragState.effect.id, clamped, dragState.effect.endMs);
    }
  }
  if (dragState.kind === "move") {
    hoverCursor.value = "grabbing";
    const duration = dragState.effect.endMs - dragState.effect.startMs;
    const newStart = Math.max(0, snapMs(ms - dragState.grabOffsetMs));
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

// Native HTML5 drag-and-drop from the effect palette, matching ModelPalette.vue's convention
// on the Layout page - the same "drag a labeled control onto a canvas" gesture in both places,
// not two different interaction models for a conceptually identical action. This is additive:
// the existing "arm, then click-drag on the grid to size it" gesture (xLights' own placement
// model) still works unchanged - dropping just places at a default size, resizable after, the
// same "place with defaults" convention M13's model palette already established.
function onDragOver(e: DragEvent): void {
  if (!e.dataTransfer?.types.includes(EFFECT_DRAG_MIME)) return;
  e.preventDefault();
}
function onDrop(e: DragEvent): void {
  const name = e.dataTransfer?.getData(EFFECT_DRAG_MIME);
  if (!name) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);
  if (hit.kind !== "row-empty") return; // dropping onto an existing effect/ruler is a no-op, not an overwrite
  emit("dropEffect", hit.row, name, snapMs(xToMs(x)));
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
// flush: "post" - draw() reads getBoundingClientRect(), which must run after Vue applies
// any template-derived inline sizing, not before (pre-flush default risks a stale 0px read
// on the same tick rows go from empty to populated - see DECISIONS.md M2 bug note).
watch(() => [props.rows, props.body, props.playheadMs, props.selectedEffectId, props.pxPerMs, props.durationMs], draw, { deep: true, flush: "post" });
</script>

<template>
  <div ref="scrollRef" class="grid-scroll-viewport" :style="{ height: `${VIEWPORT_HEIGHT}px` }" @scroll="onScroll">
    <div class="grid-spacer" :style="{ height: `${rows.length * ROW_HEIGHT}px` }">
      <canvas
        ref="canvasRef"
        class="grid-canvas"
        :style="{ width: `${totalWidth}px`, height: `${VIEWPORT_HEIGHT}px`, cursor: hoverCursor }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @contextmenu="onContextMenu"
        @dragover="onDragOver"
        @drop="onDrop"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll-viewport {
  overflow-y: auto;
  /* explicit, not the default - if overflow-x is left unset, the CSS spec computes it to
     "auto" too whenever overflow-y isn't visible, silently turning this into a second,
     narrower horizontal scroll container that clips the wide canvas to its own box before
     the page's shared .h-scroll wrapper ever gets a chance to scroll it. */
  overflow-x: visible;
  position: relative;
}
.grid-spacer {
  position: relative;
}
.grid-canvas {
  display: block;
  position: sticky;
  top: 0;
}
</style>
