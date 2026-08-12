<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { computeGeometryFromAttrs, geometryCenter, nodeWorldOffset, transformedHalfExtents, type ModelGeometry, type ScreenTransform } from "@webxlights/engine";
import type { ModelRecord, ViewObjectRecord } from "../lib/api";

const props = defineProps<{ models: ModelRecord[]; viewObjects?: ViewObjectRecord[]; selectedIds: number[] }>();
const emit = defineEmits<{
  move: [moves: Array<{ id: number; x: number; y: number }>];
  resize: [modelId: number, scale: number, scaleY: number];
  select: [ids: number[]];
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
const HANDLE_HALF = 4; // screen-px half-size of a resize handle square
const HANDLE_HIT_PAD = 4; // extra screen-px of grab room around each handle

// Corner handles scale both axes; edge handles scale the one they're on. `ax`/`ay` are the
// handle's position in the model's own unrotated frame, as a fraction of its half-extents.
const HANDLES = [
  { ax: -1, ay: -1, axes: "xy", cursor: "nesw-resize" },
  { ax: 1, ay: -1, axes: "xy", cursor: "nwse-resize" },
  { ax: 1, ay: 1, axes: "xy", cursor: "nesw-resize" },
  { ax: -1, ay: 1, axes: "xy", cursor: "nwse-resize" },
  { ax: 0, ay: -1, axes: "y", cursor: "ns-resize" },
  { ax: 0, ay: 1, axes: "y", cursor: "ns-resize" },
  { ax: -1, ay: 0, axes: "x", cursor: "ew-resize" },
  { ax: 1, ay: 0, axes: "x", cursor: "ew-resize" },
] as const;

type Handle = (typeof HANDLES)[number];

let dragState: { grabs: Map<number, { dx: number; dy: number }> } | null = null;
let resizeState: { modelId: number; handle: Handle; baseHalfW: number; baseHalfH: number } | null = null;
let marqueeState: { startX: number; startY: number; additive: boolean } | null = null;

// Live positions during a drag - pointermove updates these only; the parent's api.updateModel
// calls (and the resulting prop update) happen once on pointerup, not per move.
const dragPos = ref<Map<number, { x: number; y: number }> | null>(null);
const resizePreview = ref<{ modelId: number; scale: number; scaleY: number } | null>(null);
const marquee = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

function isSelected(model: ModelRecord): boolean {
  return props.selectedIds.includes(model.id);
}

function geometryFor(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function positionFor(model: ModelRecord): { x: number; y: number } {
  const live = dragPos.value?.get(model.id);
  if (live) return live;
  return { x: model.screen.x ?? 0, y: model.screen.y ?? 0 };
}

// Real xLights writes WorldPosX/Y as a model's *center*, and RotateZ pivots around that same
// center - `model.screen.x/y` is that anchor. `screen.scaleY` defaults to `scale` (uniform)
// when absent, matching every model saved before per-axis scale existed.
function transformFor(model: ModelRecord): ScreenTransform {
  const preview = resizePreview.value?.modelId === model.id ? resizePreview.value : null;
  return {
    scale: preview ? preview.scale : (model.screen.scale ?? 1),
    scaleY: preview ? preview.scaleY : model.screen.scaleY,
    rotateDeg: model.screen.rotate ?? 0,
  };
}

// Half-extents in the model's own *unrotated* frame. Handles are drawn on this box and then
// rotated with the model, so dragging a handle means the same thing whatever the rotation -
// an axis-aligned box around a rotated shape would make "wider" ambiguous.
function localHalfExtents(model: ModelRecord, geo: ModelGeometry): { halfW: number; halfH: number } {
  const t = transformFor(model);
  return transformedHalfExtents(geo, { scale: t.scale, scaleY: t.scaleY, rotateDeg: 0 });
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
  // actually drawn.
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

// Same fit-to-viewport transform draw() uses, exposed so pointer handlers can invert it.
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

// M15.7: real xLights' Gridlines view_object. This 2D canvas already only ever draws the
// WorldX/WorldY plane for every model, so Gridlines gets the same honest simplification
// instead of trying to reproduce its real 3D ground-plane rotation (RotateX/Y/Z) here.
function drawGridlines(ctx: CanvasRenderingContext2D, toScreenX: (x: number) => number, toScreenY: (y: number) => number): void {
  for (const obj of props.viewObjects ?? []) {
    if (obj.type !== "Gridlines" || obj.raw_attrs.Active === "0") continue;
    const a = obj.raw_attrs;
    const num = (key: string, fallback: number) => {
      const n = parseFloat(a[key] ?? "");
      return Number.isFinite(n) ? n : fallback;
    };
    const width = num("GridWidth", 1000);
    const height = num("GridHeight", 1000);
    const spacing = Math.max(num("GridLineSpacing", 50), Math.max(width, height) / 500, 0.01);
    const cx = num("WorldPosX", 0);
    const cy = num("WorldPosY", 0);

    ctx.strokeStyle = "#2e4a2e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cx - width / 2; x <= cx + width / 2 + 1e-6; x += spacing) {
      const sx = toScreenX(x);
      ctx.moveTo(sx, toScreenY(cy - height / 2));
      ctx.lineTo(sx, toScreenY(cy + height / 2));
    }
    for (let y = cy - height / 2; y <= cy + height / 2 + 1e-6; y += spacing) {
      const sy = toScreenY(y);
      ctx.moveTo(toScreenX(cx - width / 2), sy);
      ctx.lineTo(toScreenX(cx + width / 2), sy);
    }
    ctx.stroke();
  }
}

// Screen position of one resize handle, following the model's rotation.
function handleScreenPos(
  model: ModelRecord,
  half: { halfW: number; halfH: number },
  handle: { ax: number; ay: number },
  t: { toScreenX: (x: number) => number; toScreenY: (y: number) => number },
): { sx: number; sy: number } {
  const { x, y } = positionFor(model);
  const rad = ((model.screen.rotate ?? 0) * Math.PI) / 180;
  const lx = handle.ax * half.halfW * NODE_SPACING;
  const ly = handle.ay * half.halfH * NODE_SPACING;
  const wx = x + lx * Math.cos(rad) - ly * Math.sin(rad);
  const wy = y + lx * Math.sin(rad) + ly * Math.cos(rad);
  return { sx: t.toScreenX(wx), sy: t.toScreenY(wy) };
}

function soleSelectedModel(): { model: ModelRecord; geo: ModelGeometry } | null {
  if (props.selectedIds.length !== 1) return null;
  const model = props.models.find((m) => m.id === props.selectedIds[0]);
  if (!model) return null;
  const geo = geometryFor(model);
  if (!geo) return null; // unsupported placeholder: nothing meaningful to scale
  return { model, geo };
}

function drawHandles(ctx: CanvasRenderingContext2D, t: ReturnType<typeof computeTransform>): void {
  const sole = soleSelectedModel();
  if (!sole) return;
  const half = localHalfExtents(sole.model, sole.geo);
  if (half.halfW <= 0 || half.halfH <= 0) return;

  // outline of the (rotated) box the handles sit on, so it's clear what's being resized
  ctx.strokeStyle = "rgba(232, 196, 104, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const corners = HANDLES.filter((h) => h.axes === "xy");
  corners.forEach((h, i) => {
    const { sx, sy } = handleScreenPos(sole.model, half, h, t);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#e8c468";
  ctx.strokeStyle = "#111116";
  for (const h of HANDLES) {
    const { sx, sy } = handleScreenPos(sole.model, half, h, t);
    ctx.fillRect(sx - HANDLE_HALF, sy - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
    ctx.strokeRect(sx - HANDLE_HALF, sy - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
  }
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

  const transform = computeTransform(rect);
  const { toScreenX, toScreenY } = transform;

  drawGridlines(ctx, toScreenX, toScreenY);

  for (const model of props.models) {
    const { x: mx, y: my } = positionFor(model);
    const geo = geometryFor(model);
    const selected = isSelected(model);

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
    const transformOfModel = transformFor(model);
    for (const node of geo.nodes) {
      const offset = nodeWorldOffset(node, center, transformOfModel);
      const sx = toScreenX(mx + offset.x * NODE_SPACING);
      const sy = toScreenY(my + offset.y * NODE_SPACING);
      ctx.beginPath();
      ctx.arc(sx, sy, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A multi-selection gets a box per member instead of handles - handles only make sense on a
  // single model, since each has its own rotation and its own scale to change.
  if (props.selectedIds.length > 1) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.setLineDash([3, 3]);
    for (const model of props.models) {
      if (!isSelected(model)) continue;
      const b = modelWorldBounds(model, geometryFor(model));
      const x1 = toScreenX(b.minX);
      const x2 = toScreenX(b.maxX);
      const y1 = toScreenY(b.minY);
      const y2 = toScreenY(b.maxY);
      ctx.strokeRect(Math.min(x1, x2) - 3, Math.min(y1, y2) - 3, Math.abs(x2 - x1) + 6, Math.abs(y2 - y1) + 6);
    }
    ctx.setLineDash([]);
  }

  drawHandles(ctx, transform);

  if (marquee.value) {
    const { x1, y1, x2, y2 } = marquee.value;
    ctx.fillStyle = "rgba(232, 196, 104, 0.12)";
    ctx.strokeStyle = "#e8c468";
    ctx.setLineDash([4, 3]);
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.setLineDash([]);
  }
}

function screenBoxOf(model: ModelRecord, t: ReturnType<typeof computeTransform>) {
  const wb = modelWorldBounds(model, geometryFor(model));
  // World Y maps to screen Y flipped, so world-minY becomes the larger screen Y - take min/max
  // of the two projected corners rather than assuming an axis direction.
  const sx1 = t.toScreenX(wb.minX);
  const sx2 = t.toScreenX(wb.maxX);
  const sy1 = t.toScreenY(wb.minY);
  const sy2 = t.toScreenY(wb.maxY);
  return { left: Math.min(sx1, sx2), right: Math.max(sx1, sx2), top: Math.min(sy1, sy2), bottom: Math.max(sy1, sy2) };
}

function hitTest(sx: number, sy: number, rect: { width: number; height: number }): ModelRecord | null {
  const t = computeTransform(rect);
  for (let i = props.models.length - 1; i >= 0; i--) {
    const model = props.models[i]!;
    const box = screenBoxOf(model, t);
    if (sx >= box.left - 8 && sx <= box.right + 8 && sy >= box.top - 8 && sy <= box.bottom + 8) return model;
  }
  return null;
}

function handleHitTest(sx: number, sy: number, rect: { width: number; height: number }): Handle | null {
  const sole = soleSelectedModel();
  if (!sole) return null;
  const t = computeTransform(rect);
  const half = localHalfExtents(sole.model, sole.geo);
  if (half.halfW <= 0 || half.halfH <= 0) return null;
  for (const h of HANDLES) {
    const { sx: hx, sy: hy } = handleScreenPos(sole.model, half, h, t);
    if (Math.abs(sx - hx) <= HANDLE_HALF + HANDLE_HIT_PAD && Math.abs(sy - hy) <= HANDLE_HALF + HANDLE_HIT_PAD) return h;
  }
  return null;
}

function pointerPos(e: PointerEvent): { x: number; y: number; rect: DOMRect } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
}

function onPointerDown(e: PointerEvent): void {
  const pos = pointerPos(e);
  if (!pos) return;
  const { x, y, rect } = pos;
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;

  // Handles sit on top of the model they belong to, so they get first refusal on the pointer.
  const handle = handleHitTest(x, y, rect);
  if (handle) {
    const sole = soleSelectedModel();
    if (sole) {
      const base = transformedHalfExtents(sole.geo, { scale: 1, scaleY: 1, rotateDeg: 0 });
      // Scale is derived from the *unscaled* extents every move, rather than multiplied into
      // the current one - accumulating a ratio per pointermove drifts over a long drag.
      resizeState = { modelId: sole.model.id, handle, baseHalfW: base.halfW, baseHalfH: base.halfH };
      canvasRef.value?.setPointerCapture(e.pointerId);
      hoverCursor.value = handle.cursor;
    }
    return;
  }

  const hit = hitTest(x, y, rect);

  if (!hit) {
    // Empty space: start a marquee. Without a modifier this also clears the selection, but only
    // once the drag ends - clearing on pointerdown would make a marquee that starts on empty
    // space feel like it deselected before you'd drawn anything.
    marqueeState = { startX: x, startY: y, additive };
    marquee.value = { x1: x, y1: y, x2: x, y2: y };
    canvasRef.value?.setPointerCapture(e.pointerId);
    return;
  }

  let selection = props.selectedIds;
  if (additive) {
    selection = isSelected(hit) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
    emit("select", selection);
    if (!selection.includes(hit.id)) return; // just removed it - don't start dragging it
  } else if (!isSelected(hit)) {
    // Clicking an unselected model selects just it; clicking one that's already part of a
    // multi-selection keeps the whole selection so the group can be dragged together.
    selection = [hit.id];
    emit("select", selection);
  }

  const t = computeTransform(rect);
  const worldX = t.toWorldX(x);
  const worldY = t.toWorldY(y);
  const grabs = new Map<number, { dx: number; dy: number }>();
  for (const model of props.models) {
    if (!selection.includes(model.id)) continue;
    const p = positionFor(model);
    grabs.set(model.id, { dx: worldX - p.x, dy: worldY - p.y });
  }
  dragState = { grabs };
  canvasRef.value?.setPointerCapture(e.pointerId);
  hoverCursor.value = "grabbing";
}

function onPointerMove(e: PointerEvent): void {
  const pos = pointerPos(e);
  if (!pos) return;
  const { x, y, rect } = pos;

  if (resizeState) {
    const model = props.models.find((m) => m.id === resizeState!.modelId);
    if (!model) return;
    const t = computeTransform(rect);
    const anchor = positionFor(model);
    // Into the model's own unrotated frame, where a handle's meaning is unambiguous.
    const rad = ((model.screen.rotate ?? 0) * Math.PI) / 180;
    const wx = t.toWorldX(x) - anchor.x;
    const wy = t.toWorldY(y) - anchor.y;
    const lx = (wx * Math.cos(-rad) - wy * Math.sin(-rad)) / NODE_SPACING;
    const ly = (wx * Math.sin(-rad) + wy * Math.cos(-rad)) / NODE_SPACING;

    const current = transformFor(model);
    const currentScaleX = current.scale ?? 1;
    const currentScaleY = current.scaleY ?? currentScaleX;
    const MIN_SCALE = 0.02;
    const { handle, baseHalfW, baseHalfH } = resizeState;
    const nextScaleX = handle.axes === "y" || baseHalfW <= 0 ? currentScaleX : Math.max(MIN_SCALE, Math.abs(lx) / baseHalfW);
    const nextScaleY = handle.axes === "x" || baseHalfH <= 0 ? currentScaleY : Math.max(MIN_SCALE, Math.abs(ly) / baseHalfH);
    resizePreview.value = { modelId: model.id, scale: nextScaleX, scaleY: nextScaleY };
    draw();
    return;
  }

  if (marqueeState) {
    marquee.value = { x1: marqueeState.startX, y1: marqueeState.startY, x2: x, y2: y };
    draw();
    return;
  }

  if (dragState) {
    const t = computeTransform(rect);
    const worldX = t.toWorldX(x);
    const worldY = t.toWorldY(y);
    const next = new Map<number, { x: number; y: number }>();
    for (const [id, grab] of dragState.grabs) next.set(id, { x: worldX - grab.dx, y: worldY - grab.dy });
    dragPos.value = next;
    draw();
    return;
  }

  hoverCursor.value = handleHitTest(x, y, rect)?.cursor ?? (hitTest(x, y, rect) ? "grab" : "default");
}

function onPointerUp(e: PointerEvent): void {
  if (resizeState && resizePreview.value) {
    emit("resize", resizeState.modelId, resizePreview.value.scale, resizePreview.value.scaleY);
  } else if (marqueeState && marquee.value) {
    const canvas = canvasRef.value;
    const rect = canvas?.getBoundingClientRect();
    if (rect) {
      const t = computeTransform(rect);
      const { x1, y1, x2, y2 } = marquee.value;
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      // A click (no meaningful drag) on empty space clears the selection; an actual band
      // selects everything it touches. Intersection, not containment - a band that clips the
      // edge of a big matrix should still catch it.
      const dragged = Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3;
      let ids: number[] = [];
      if (dragged) {
        ids = props.models
          .filter((model) => {
            const box = screenBoxOf(model, t);
            return box.left <= right && box.right >= left && box.top <= bottom && box.bottom >= top;
          })
          .map((m) => m.id);
        if (marqueeState.additive) ids = [...new Set([...props.selectedIds, ...ids])];
      }
      emit("select", ids);
    }
  } else if (dragState && dragPos.value) {
    const moves = [...dragPos.value.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    if (moves.length > 0) emit("move", moves);
  }

  canvasRef.value?.releasePointerCapture?.(e.pointerId);
  dragState = null;
  resizeState = null;
  marqueeState = null;
  dragPos.value = null;
  resizePreview.value = null;
  marquee.value = null;
  hoverCursor.value = "default";
  draw();
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
  emit("create", type, toWorldX(e.clientX - rect.left), toWorldY(e.clientY - rect.top));
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => [props.models, props.selectedIds, props.viewObjects], draw, { deep: true });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="layout-canvas"
    :style="{ cursor: hoverCursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dragover.prevent
    @drop.prevent="onDrop"
  ></canvas>
</template>

<style scoped>
.layout-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
