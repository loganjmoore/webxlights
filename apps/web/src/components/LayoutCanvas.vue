<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { computeGeometryFromAttrs, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord } from "../lib/api";

const props = defineProps<{ models: ModelRecord[]; selectedModelId: number | null }>();
const emit = defineEmits<{
  move: [modelId: number, x: number, y: number];
  select: [modelId: number | null];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hoverCursor = ref("default");

const NODE_SPACING = 4; // px per local geometry unit, before the auto-fit scale
const NODE_RADIUS = 2;
const PLACEHOLDER_HALF = 15; // fixed screen-px half-extent for unsupported-model boxes

let dragState: { modelId: number; grabDx: number; grabDy: number } | null = null;
// Live position during a drag - pointermove updates this only, the parent's api.updateModel
// call (and its resulting prop update) happens once on pointerup, not per move.
const dragPos = ref<{ modelId: number; x: number; y: number } | null>(null);

function geometryFor(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function positionFor(model: ModelRecord): { x: number; y: number } {
  if (dragPos.value && dragPos.value.modelId === model.id) return { x: dragPos.value.x, y: dragPos.value.y };
  return { x: model.screen.x ?? 0, y: model.screen.y ?? 0 };
}

function halfExtents(model: ModelRecord, geo: ModelGeometry | null): { halfW: number; halfH: number } {
  const scale = model.screen.scale ?? 1;
  return geo ? { halfW: (geo.width * NODE_SPACING * scale) / 2, halfH: (geo.height * NODE_SPACING * scale) / 2 } : { halfW: 20, halfH: 20 };
}

function worldBounds(models: ModelRecord[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const model of models) {
    const { x, y } = positionFor(model);
    const { halfW, halfH } = halfExtents(model, geometryFor(model));
    minX = Math.min(minX, x - halfW);
    maxX = Math.max(maxX, x + halfW);
    minY = Math.min(minY, y - halfH);
    maxY = Math.max(maxY, y + halfH);
  }

  if (!Number.isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

// Same fit-to-viewport transform draw() uses, exposed so pointer handlers can invert it -
// LayoutCanvas.vue was a pure read-only draw() with zero pointer listeners before this
// (documented ceiling since M1); inverting the existing world-to-screen transform is the
// cheap, no-new-dependency way to add drag, not a parallel coordinate system.
function computeTransform(rect: { width: number; height: number }) {
  const bounds = worldBounds(props.models);
  const worldW = Math.max(bounds.maxX - bounds.minX, 1);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 40;
  const fitScale = Math.min((rect.width - padding * 2) / worldW, (rect.height - padding * 2) / worldH);
  return {
    bounds,
    fitScale,
    toScreenX: (x: number) => (x - bounds.minX) * fitScale + padding,
    toScreenY: (y: number) => rect.height - ((y - bounds.minY) * fitScale + padding), // flip Y: model-space origin is bottom-left
    toWorldX: (sx: number) => (sx - padding) / fitScale + bounds.minX,
    toWorldY: (sy: number) => (rect.height - sy - padding) / fitScale + bounds.minY,
  };
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
  ctx.fillStyle = "#111116";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const { toScreenX, toScreenY } = computeTransform(rect);

  for (const model of props.models) {
    const { x: mx, y: my } = positionFor(model);
    const scale = model.screen.scale ?? 1;
    const geo = geometryFor(model);
    const selected = model.id === props.selectedModelId;

    if (!geo) {
      // Unsupported type or missing geometry: draw a labeled placeholder box so nothing
      // imported is silently invisible.
      const sx = toScreenX(mx);
      const sy = toScreenY(my);
      ctx.strokeStyle = selected ? "#fff" : "#555";
      ctx.strokeRect(sx - PLACEHOLDER_HALF, sy - PLACEHOLDER_HALF, PLACEHOLDER_HALF * 2, PLACEHOLDER_HALF * 2);
      ctx.fillStyle = "#888";
      ctx.font = "10px system-ui";
      ctx.fillText(model.name, sx - 15, sy + 25);
      continue;
    }

    ctx.fillStyle = selected ? "#fff" : "#e8c468";
    for (const node of geo.nodes) {
      const worldX = mx + node.screenX * NODE_SPACING * scale;
      const worldY = my + node.screenY * NODE_SPACING * scale;
      const sx = toScreenX(worldX);
      const sy = toScreenY(worldY);
      ctx.beginPath();
      ctx.arc(sx, sy, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hitTest(sx: number, sy: number, rect: { width: number; height: number }): ModelRecord | null {
  const { toScreenX, toScreenY, fitScale } = computeTransform(rect);
  for (let i = props.models.length - 1; i >= 0; i--) {
    const model = props.models[i]!;
    const { x: mx, y: my } = positionFor(model);
    const geo = geometryFor(model);
    const msx = toScreenX(mx);
    const msy = toScreenY(my);
    const { halfW, halfH } = geo ? halfExtents(model, geo) : { halfW: PLACEHOLDER_HALF / fitScale, halfH: PLACEHOLDER_HALF / fitScale };
    const halfWScreen = geo ? halfW * fitScale : PLACEHOLDER_HALF;
    const halfHScreen = geo ? halfH * fitScale : PLACEHOLDER_HALF;
    if (Math.abs(sx - msx) <= Math.max(halfWScreen, 8) && Math.abs(sy - msy) <= Math.max(halfHScreen, 8)) return model;
  }
  return null;
}

function onPointerDown(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y, rect);
  emit("select", hit?.id ?? null);
  if (!hit) return;

  const { toWorldX, toWorldY } = computeTransform(rect);
  const worldX = toWorldX(x);
  const worldY = toWorldY(y);
  const { x: modelX, y: modelY } = positionFor(hit);
  dragState = { modelId: hit.id, grabDx: worldX - modelX, grabDy: worldY - modelY };
  hoverCursor.value = "grabbing";
}

function onPointerMove(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (!dragState) {
    hoverCursor.value = hitTest(x, y, rect) ? "grab" : "default";
    return;
  }

  const { toWorldX, toWorldY } = computeTransform(rect);
  dragPos.value = { modelId: dragState.modelId, x: toWorldX(x) - dragState.grabDx, y: toWorldY(y) - dragState.grabDy };
  draw();
}

function onPointerUp(): void {
  if (dragState && dragPos.value) {
    emit("move", dragState.modelId, dragPos.value.x, dragPos.value.y);
  }
  dragState = null;
  dragPos.value = null;
  hoverCursor.value = "default";
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => [props.models, props.selectedModelId], draw, { deep: true });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="layout-canvas"
    :style="{ cursor: hoverCursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  ></canvas>
</template>

<style scoped>
.layout-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
