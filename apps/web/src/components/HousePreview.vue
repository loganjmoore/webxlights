<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { computeGeometryFromAttrs, renderRowAtMs, type AudioSeries, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord, SequenceBody } from "../lib/api";
import { DEFAULT_PALETTE, PREVIEW_SEED } from "../lib/renderSettings";

const props = defineProps<{
  models: ModelRecord[];
  body: SequenceBody;
  playheadMs: number;
  frameMs: number;
  audio?: AudioSeries;
  expanded?: boolean;
}>();
const emit = defineEmits<{ "toggle-expand": [] }>();

const NODE_SPACING = 4; // matches LayoutCanvas's local-unit-to-px scale

const containerRef = ref<HTMLDivElement | null>(null);
const nodeSize = ref(6);
const showGrid = ref(true);
const glow = ref(true);
const cameraMode = ref<"front" | "left" | "right" | "top" | "free">("front");
const nodeCount = ref(0);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let points: THREE.Points | null = null;
let haloPoints: THREE.Points | null = null;
let grid: THREE.GridHelper | null = null;
let rafId: number | null = null;
let sceneCenter = new THREE.Vector3();
let sceneSpan = 100;
let lastRenderedFrame = -1;

interface RowEntry {
  model: ModelRecord;
  geometry: ModelGeometry;
  offset: number; // index into the flat position/color buffers
}

let rowEntries: RowEntry[] = [];

// A round, soft-edged sprite so nodes read as bulbs rather than square pixels. Generated
// rather than shipped as an asset: it's a two-stop radial gradient, and a data URI in the
// bundle costs more than the eight lines that draw it.
function makeBulbTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// xLights layouts carry a Z position per model (WorldPosZ in rgbeffects.xml) - reading it is
// what makes this an actual 3D view of the yard rather than a flat wall drawn in perspective.
function modelDepth(model: ModelRecord): number {
  const raw = model.raw_attrs?.WorldPosZ;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  nodeCount.value = offset;
}

function buildPositions(): Float32Array {
  const positions = new Float32Array(nodeCount.value * 3);
  for (const entry of rowEntries) {
    const mx = entry.model.screen.x ?? 0;
    const my = entry.model.screen.y ?? 0;
    const mz = modelDepth(entry.model);
    const scale = entry.model.screen.scale ?? 1;
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      positions[idx] = mx + node.screenX * NODE_SPACING * scale;
      positions[idx + 1] = my + node.screenY * NODE_SPACING * scale;
      positions[idx + 2] = mz;
    });
  }
  return positions;
}

function updateColors(force = false): void {
  if (!points) return;

  // The preview is driven at display refresh rate but a sequence only has a new frame every
  // `frameMs`; re-rendering the engine more often than that is pure waste.
  const frameIndex = Math.floor(props.playheadMs / Math.max(1, props.frameMs));
  if (!force && frameIndex === lastRenderedFrame) return;
  lastRenderedFrame = frameIndex;

  const colorAttr = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  const arr = colorAttr.array as Float32Array;

  for (const entry of rowEntries) {
    const rowEffects = props.body.rows
      .filter((r) => r.elementType === "model" && r.elementId === entry.model.id)
      .flatMap((r) => r.effects);
    const nodeColors = renderRowAtMs(
      { geometry: entry.geometry, effects: rowEffects },
      props.playheadMs,
      props.frameMs,
      PREVIEW_SEED,
      DEFAULT_PALETTE,
      props.audio,
    );
    nodeColors.forEach((c, i) => {
      const idx = (entry.offset + i) * 3;
      const brightness = c.a / 255;
      arr[idx] = (c.r / 255) * brightness;
      arr[idx + 1] = (c.g / 255) * brightness;
      arr[idx + 2] = (c.b / 255) * brightness;
    });
  }
  colorAttr.needsUpdate = true;
  if (haloPoints) (haloPoints.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
}

function measureScene(): void {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const positions = points?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (positions && positions.count > 0) {
    for (let i = 0; i < positions.count; i++) {
      minX = Math.min(minX, positions.getX(i));
      maxX = Math.max(maxX, positions.getX(i));
      minY = Math.min(minY, positions.getY(i));
      maxY = Math.max(maxY, positions.getY(i));
      minZ = Math.min(minZ, positions.getZ(i));
      maxZ = Math.max(maxZ, positions.getZ(i));
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -50; maxX = 50; minY = -50; maxY = 50; minZ = 0; maxZ = 0;
  }
  sceneCenter = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  sceneSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 20);

  if (grid) {
    scene?.remove(grid);
    grid.dispose();
  }
  // Sized to the show, not to the view: a grid several times the model bounds reads as the
  // subject of the scene instead of as ground under it.
  grid = new THREE.GridHelper(sceneSpan * 1.6, 16, 0x24242c, 0x18181e);
  // GridHelper lies in the XZ plane; the layout's "ground" is the bottom of the model bounds
  grid.position.set(sceneCenter.x, minY - sceneSpan * 0.05, sceneCenter.z);
  grid.visible = showGrid.value;
  scene?.add(grid);
}

function applyCamera(mode: typeof cameraMode.value): void {
  if (!camera || !controls) return;
  cameraMode.value = mode;
  const d = sceneSpan * 1.4;
  const from: Record<typeof mode, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0, d),
    left: new THREE.Vector3(-d, 0, d * 0.6),
    right: new THREE.Vector3(d, 0, d * 0.6),
    top: new THREE.Vector3(0, d, 0.001),
    free: camera.position.clone().sub(sceneCenter),
  };
  camera.position.copy(sceneCenter).add(from[mode]);
  camera.near = Math.max(0.1, sceneSpan / 100);
  camera.far = sceneSpan * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(sceneCenter);
  controls.update();
}

function initScene(): void {
  const container = containerRef.value;
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080b);
  scene.fog = new THREE.Fog(0x08080b, 1, 5000);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 1, 5000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // any manual camera move drops the preset back to "free" so the buttons reflect reality
  controls.addEventListener("start", () => {
    cameraMode.value = "free";
  });

  buildGeometryCache();
  const positions = buildPositions();
  const colors = new Float32Array(positions.length);
  const bulb = makeBulbTexture();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: nodeSize.value, map: bulb, vertexColors: true, transparent: true, depthWrite: false }),
  );
  scene.add(points);

  // A second, larger and dimmer pass over the same buffers gives the bulbs a bloom without a
  // full post-processing chain (which would need EffectComposer and a render target per frame).
  haloPoints = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: nodeSize.value * 3,
      map: bulb,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  haloPoints.visible = glow.value;
  scene.add(haloPoints);

  measureScene();
  applyCamera("front");
  updateColors(true);

  const animate = (): void => {
    controls?.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  };
  animate();
}

function handleResize(): void {
  const container = containerRef.value;
  if (!container || !renderer || !camera) return;
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
  camera.updateProjectionMatrix();
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initScene();
  window.addEventListener("resize", handleResize);
  // the panel also changes size when it's expanded, which no window resize event covers
  if (containerRef.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  controls?.dispose();
  points?.geometry.dispose();
  (points?.material as THREE.PointsMaterial | undefined)?.dispose();
  (haloPoints?.material as THREE.PointsMaterial | undefined)?.dispose();
  grid?.dispose();
  renderer?.dispose();
});

watch(() => props.playheadMs, () => updateColors());
watch(() => props.body, () => updateColors(true), { deep: true });
watch(() => props.audio, () => updateColors(true));

watch(
  () => props.models,
  () => {
    buildGeometryCache();
    if (!points) return;
    const positions = buildPositions();
    points.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    points.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    measureScene();
    applyCamera(cameraMode.value === "free" ? "front" : cameraMode.value);
    updateColors(true);
  },
);

watch(nodeSize, (size) => {
  if (points) (points.material as THREE.PointsMaterial).size = size;
  if (haloPoints) (haloPoints.material as THREE.PointsMaterial).size = size * 3;
});
watch(showGrid, (visible) => {
  if (grid) grid.visible = visible;
});
watch(glow, (on) => {
  if (haloPoints) haloPoints.visible = on;
});
</script>

<template>
  <div class="preview-root">
    <div ref="containerRef" class="house-preview"></div>

    <div class="overlay">
      <div class="camera-buttons">
        <button
          v-for="mode in (['front', 'left', 'right', 'top'] as const)"
          :key="mode"
          :class="{ active: cameraMode === mode }"
          @click="applyCamera(mode)"
        >
          {{ mode }}
        </button>
        <button @click="applyCamera(cameraMode === 'free' ? 'front' : cameraMode)">fit</button>
      </div>

      <label class="slider">
        Size
        <input v-model.number="nodeSize" type="range" min="1" max="20" step="1" />
      </label>
      <label class="check"><input v-model="glow" type="checkbox" /> Glow</label>
      <label class="check"><input v-model="showGrid" type="checkbox" /> Grid</label>
      <button class="expand" @click="emit('toggle-expand')">{{ expanded ? "Collapse" : "Expand" }}</button>
    </div>

    <div class="readout">
      <span>{{ (playheadMs / 1000).toFixed(2) }}s</span>
      <span>{{ nodeCount }} nodes</span>
      <span v-if="cameraMode === 'free'">drag to orbit &middot; scroll to zoom</span>
    </div>
  </div>
</template>

<style scoped>
.preview-root {
  position: relative;
  width: 100%;
  height: 100%;
}
.house-preview {
  width: 100%;
  height: 100%;
}
.house-preview :deep(canvas) {
  display: block;
}
.overlay {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: #aaa;
  background: rgba(10, 10, 14, 0.72);
  padding: 0.3rem 0.45rem;
  border-radius: 4px;
}
.camera-buttons {
  display: flex;
  gap: 0.2rem;
}
.overlay button {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  text-transform: capitalize;
}
.overlay button.active {
  background: #e8c468;
  color: #111;
}
.slider,
.check {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.slider input {
  width: 70px;
}
.readout {
  position: absolute;
  bottom: 0.4rem;
  right: 0.5rem;
  display: flex;
  gap: 0.6rem;
  font-size: 0.7rem;
  color: #666;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
</style>
