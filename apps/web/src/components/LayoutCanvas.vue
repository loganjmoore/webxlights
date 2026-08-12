<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { computeGeometryFromAttrs, geometryCenter, nodeWorldOffset, transformedHalfExtents, type ModelGeometry, type ScreenTransform } from "@webxlights/engine";
import type { ModelRecord } from "../lib/api";

const props = defineProps<{ models: ModelRecord[]; selectedModelId: number | null }>();
const emit = defineEmits<{
  move: [modelId: number, x: number, y: number];
  select: [modelId: number | null];
  create: [type: string, x: number, y: number];
}>();

// M13: must match ModelPalette.vue's dragstart MIME type exactly - namespaced so this canvas
// ignores any other drag source (e.g. an OS file drag) that happens to land here.
const MODEL_DRAG_MIME = "application/x-webxlights-model-type";

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

// Real xLights writes WorldPosX/Y as a model's *center*, and RotateZ pivots around that same
// center - `model.screen.x/y` is that anchor. `screen.scaleY` defaults to `scale` (uniform)
// when absent, matching every model saved before per-axis scale existed.
function transformFor(model: ModelRecord): ScreenTransform {
  return { scale: model.screen.scale ?? 1, scaleY: model.screen.scaleY, rotateDeg: model.screen.rotate ?? 0 };
}

// `geo.width`/`geo.height` are buffer (row/col) dimensions for effect rendering, not a screen
// bounding box - Circle/Star/Wreath normalize to a unit circle regardless of node count, Tree's
// real width comes from `bottomTopRatio` not `strings`, Window Frame's real extent is `top` x
// `leftRight` not the total perimeter node count. `transformedHalfExtents` (packages/engine)
// derives the real, transformed (scaled + rotated) box from the nodes' actual screenX/screenY,
// centered on the anchor by construction - see transform.ts's module doc for why every model
// type needs to be centered on its anchor in the first place, not just this one.
function modelWorldBounds(model: ModelRecord, geo: ModelGeometry | null): { minX: number; maxX: number; minY: number; maxY: number } {
  const { x, y } = positionFor(model);
  if (!geo) return { minX: x - 20, maxX: x + 20, minY: y - 20, maxY: y + 20 };
  // transformedHalfExtents is in local geometry units, same as node.screenX/Y - draw() below
  // multiplies node offsets by NODE_SPACING before placing them in world space, so this needs
  // the same factor or bounds/hit-testing silently work in a 4x-smaller unit than what's
  // actually drawn (masked in multi-model scenes where inter-model spacing dominates the
  // computed extent, but a real, reproducible click-to-select miss on any single/dominant
  // model - caught only by testing an actual canvas click, not by screenshotting the result).
  const { halfW, halfH } = transformedHalfExtents(geo, transformFor(model));
  return { minX: x - halfW * NODE_SPACING, maxX: x + halfW * NODE_SPACING, minY: y - halfH * NODE_SPACING, maxY: y + halfH * NODE_SPACING };
}

function worldBounds(models: ModelRecord[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const model of models) {
    const b = modelWorldBounds(model, geometryFor(model));
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
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
    const center = geometryCenter(geo);
    const transform = transformFor(model);
    for (const node of geo.nodes) {
      const offset = nodeWorldOffset(node, center, transform);
      const worldX = mx + offset.x * NODE_SPACING;
      const worldY = my + offset.y * NODE_SPACING;
      const sx = toScreenX(worldX);
      const sy = toScreenY(worldY);
      ctx.beginPath();
      ctx.arc(sx, sy, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hitTest(sx: number, sy: number, rect: { width: number; height: number }): ModelRecord | null {
  const { toScreenX, toScreenY } = computeTransform(rect);
  for (let i = props.models.length - 1; i >= 0; i--) {
    const model = props.models[i]!;
    const geo = geometryFor(model);
    const wb = modelWorldBounds(model, geo);
    // World Y maps to screen Y flipped (toScreenY), so world-minY becomes the larger screen Y -
    // take min/max of the two projected corners rather than assuming an axis direction.
    const sx1 = toScreenX(wb.minX);
    const sx2 = toScreenX(wb.maxX);
    const sy1 = toScreenY(wb.minY);
    const sy2 = toScreenY(wb.maxY);
    const left = Math.min(sx1, sx2) - 8;
    const right = Math.max(sx1, sx2) + 8;
    const top = Math.min(sy1, sy2) - 8;
    const bottom = Math.max(sy1, sy2) + 8;
    if (sx >= left && sx <= right && sy >= top && sy <= bottom) return model;
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

// M13: reuses the exact same world-transform inversion as pointer-drag above, computed from
// props.models as they stand *before* this drop's new model exists - the transform the canvas
// is currently showing, so the drop lands where the cursor visually was.
function onDrop(e: DragEvent): void {
  const type = e.dataTransfer?.getData(MODEL_DRAG_MIME);
  if (!type) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const { toWorldX, toWorldY } = computeTransform(rect);
  const x = toWorldX(e.clientX - rect.left);
  const y = toWorldY(e.clientY - rect.top);
  emit("create", type, x, y);
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
    @dragover.prevent
    @drop.prevent="onDrop"
  ></canvas>
</template>

<style scoped>
.layout-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
