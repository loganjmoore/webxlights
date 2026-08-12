<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { computeGeometryFromAttrs, DEFAULT_PALETTE, hexToRgba, renderRowAtMs, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord, SequenceBody } from "../lib/api";
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";

const props = defineProps<{
  models: ModelRecord[];
  body: SequenceBody;
  playheadMs: number;
  frameMs: number;
}>();

const SEED = 12345;
const NODE_SPACING = 4; // matches LayoutCanvas's local-unit-to-px scale

const containerRef = ref<HTMLDivElement | null>(null);
let setup: SceneSetup | null = null;
let points: THREE.Points | null = null;
let rafId: number | null = null;

interface RowEntry {
  model: ModelRecord;
  geometry: ModelGeometry;
  offset: number; // index into the flat position/color buffers
}

let rowEntries: RowEntry[] = [];

function buildGeometryCache(): void {
  rowEntries = [];
  let offset = 0;
  for (const model of props.models) {
    if (!model.supported) continue;
    let geo: ModelGeometry | null;
    try {
      geo = computeGeometryFromAttrs(model.type, model.raw_attrs);
    } catch {
      geo = null;
    }
    if (!geo || geo.nodes.length === 0) continue;
    rowEntries.push({ model, geometry: geo, offset });
    offset += geo.nodes.length;
  }
}

function totalNodeCount(): number {
  return rowEntries.reduce((sum, e) => sum + e.geometry.nodes.length, 0);
}

function buildPositions(): Float32Array {
  const total = totalNodeCount();
  const positions = new Float32Array(total * 3);
  for (const entry of rowEntries) {
    const mx = entry.model.screen.x ?? 0;
    const my = entry.model.screen.y ?? 0;
    const scale = entry.model.screen.scale ?? 1;
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      positions[idx] = mx + node.screenX * NODE_SPACING * scale;
      positions[idx + 1] = my + node.screenY * NODE_SPACING * scale;
      positions[idx + 2] = 0;
    });
  }
  return positions;
}

function updateColors(): void {
  if (!points) return;
  const colorAttr = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  const arr = colorAttr.array as Float32Array;

  for (const entry of rowEntries) {
    const rowEffects = props.body.rows
      .filter((r) => r.elementType === "model" && r.elementId === entry.model.id)
      .flatMap((r) => r.effects)
      .map((e) => ({ ...e, palette: e.palette?.map(hexToRgba) }));
    const nodeColors = renderRowAtMs({ geometry: entry.geometry, effects: rowEffects }, props.playheadMs, props.frameMs, SEED, DEFAULT_PALETTE);
    nodeColors.forEach((c, i) => {
      const idx = (entry.offset + i) * 3;
      const brightness = c.a / 255;
      arr[idx] = (c.r / 255) * brightness;
      arr[idx + 1] = (c.g / 255) * brightness;
      arr[idx + 2] = (c.b / 255) * brightness;
    });
  }
  colorAttr.needsUpdate = true;
}

function fitCameraToScene(): void {
  if (!setup) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const entry of rowEntries) {
    const mx = entry.model.screen.x ?? 0;
    const my = entry.model.screen.y ?? 0;
    minX = Math.min(minX, mx - 40);
    maxX = Math.max(maxX, mx + 40);
    minY = Math.min(minY, my - 40);
    maxY = Math.max(maxY, my + 40);
  }
  if (!Number.isFinite(minX)) { minX = -100; maxX = 100; minY = -100; maxY = 100; }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 10);
  const { camera } = setup;
  camera.position.set(cx, cy, span * 1.3);
  camera.lookAt(cx, cy, 0);
  camera.near = 1;
  camera.far = span * 5;
  camera.updateProjectionMatrix();
}

function initScene(): void {
  const container = containerRef.value;
  if (!container) return;

  setup = createScene(container);

  buildGeometryCache();
  const positions = buildPositions();
  const colors = new Float32Array(positions.length);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 3, vertexColors: true, sizeAttenuation: false });
  points = new THREE.Points(geo, material);
  setup.scene.add(points);

  fitCameraToScene();
  updateColors();

  const animate = () => {
    if (setup) setup.renderer.render(setup.scene, setup.camera);
    rafId = requestAnimationFrame(animate);
  };
  animate();
}

function handleResize(): void {
  const container = containerRef.value;
  if (!container || !setup) return;
  resizeScene(setup, container);
}

onMounted(() => {
  initScene();
  window.addEventListener("resize", handleResize);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  if (rafId) cancelAnimationFrame(rafId);
  if (setup && containerRef.value) disposeScene(setup, containerRef.value);
});

watch(() => [props.playheadMs, props.body], updateColors, { deep: true });
watch(
  () => props.models,
  () => {
    buildGeometryCache();
    if (!points) return;
    const positions = buildPositions();
    points.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    points.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    fitCameraToScene();
    updateColors();
  },
);
</script>

<template>
  <div ref="containerRef" class="house-preview"></div>
</template>

<style scoped>
.house-preview {
  width: 100%;
  height: 100%;
}
.house-preview :deep(canvas) {
  display: block;
}
</style>
