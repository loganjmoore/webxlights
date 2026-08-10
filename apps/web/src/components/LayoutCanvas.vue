<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { computeGeometryFromAttrs, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord } from "../lib/api";

const props = defineProps<{ models: ModelRecord[] }>();
const canvasRef = ref<HTMLCanvasElement | null>(null);

const NODE_SPACING = 4; // px per local geometry unit, before the auto-fit scale
const NODE_RADIUS = 2;

function geometryFor(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function worldBounds(models: ModelRecord[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const model of models) {
    const x = model.screen.x ?? 0;
    const y = model.screen.y ?? 0;
    const scale = model.screen.scale ?? 1;
    const geo = geometryFor(model);
    const halfW = geo ? (geo.width * NODE_SPACING * scale) / 2 : 20;
    const halfH = geo ? (geo.height * NODE_SPACING * scale) / 2 : 20;
    minX = Math.min(minX, x - halfW);
    maxX = Math.max(maxX, x + halfW);
    minY = Math.min(minY, y - halfH);
    maxY = Math.max(maxY, y + halfH);
  }

  if (!Number.isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
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

  const bounds = worldBounds(props.models);
  const worldW = Math.max(bounds.maxX - bounds.minX, 1);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 40;
  const fitScale = Math.min((rect.width - padding * 2) / worldW, (rect.height - padding * 2) / worldH);
  const toScreenX = (x: number) => (x - bounds.minX) * fitScale + padding;
  // flip Y: model-space origin is bottom-left, canvas origin is top-left
  const toScreenY = (y: number) => rect.height - ((y - bounds.minY) * fitScale + padding);

  for (const model of props.models) {
    const mx = model.screen.x ?? 0;
    const my = model.screen.y ?? 0;
    const scale = model.screen.scale ?? 1;
    const geo = geometryFor(model);

    if (!geo) {
      // Unsupported type or missing geometry: draw a labeled placeholder box so nothing
      // imported is silently invisible.
      const sx = toScreenX(mx);
      const sy = toScreenY(my);
      ctx.strokeStyle = "#555";
      ctx.strokeRect(sx - 15, sy - 15, 30, 30);
      ctx.fillStyle = "#888";
      ctx.font = "10px system-ui";
      ctx.fillText(model.name, sx - 15, sy + 25);
      continue;
    }

    ctx.fillStyle = "#e8c468";
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

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => props.models, draw, { deep: true });
</script>

<template>
  <canvas ref="canvasRef" class="layout-canvas"></canvas>
</template>

<style scoped>
.layout-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
