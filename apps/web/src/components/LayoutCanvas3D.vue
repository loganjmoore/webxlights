<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";
import { computeGeometryFromAttrs, type ModelGeometry } from "@webxlights/engine";
import type { ModelRecord } from "../lib/api";
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";

const props = defineProps<{ models: ModelRecord[]; selectedModelId: number | null }>();
const emit = defineEmits<{
  select: [modelId: number | null];
  move: [modelId: number, x: number, y: number, z: number];
}>();

const NODE_SPACING = 4; // matches LayoutCanvas (2D) and HousePreview's local-unit-to-px scale
const PICK_DEPTH = 12; // flat 2D models get a thin box for raycasting, not zero-volume

const containerRef = ref<HTMLDivElement | null>(null);
let setup: SceneSetup | null = null;
let orbit: OrbitControls | null = null;
let dragControls: DragControls | null = null;
let points: THREE.Points | null = null;
let selectionHelper: THREE.BoxHelper | null = null;
let rafId: number | null = null;

interface RowEntry {
  model: ModelRecord;
  geometry: ModelGeometry;
  offset: number;
  pickMesh: THREE.Mesh;
}
let rowEntries: RowEntry[] = [];
let downPoint: { x: number; y: number } | null = null;

function geometryFor(model: ModelRecord): ModelGeometry | null {
  if (!model.supported) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
}

function halfExtents(model: ModelRecord, geo: ModelGeometry): { halfW: number; halfH: number } {
  const scale = model.screen.scale ?? 1;
  return { halfW: Math.max((geo.width * NODE_SPACING * scale) / 2, 10), halfH: Math.max((geo.height * NODE_SPACING * scale) / 2, 10) };
}

function buildPositions(): Float32Array {
  const total = rowEntries.reduce((sum, e) => sum + e.geometry.nodes.length, 0);
  const positions = new Float32Array(total * 3);
  for (const entry of rowEntries) {
    const mx = entry.model.screen.x ?? 0;
    const my = entry.model.screen.y ?? 0;
    const mz = entry.model.screen.z ?? 0;
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

// Points at sizeAttenuation:false makes the Raycaster's Points-picking threshold camera-
// distance-dependent - reliably wrong when zoomed in or out. Pick against one invisible
// Box3-derived mesh per model instead; the Points stay display-only (points.raycast is a
// no-op below). See DECISIONS.md M12 / the trap this was called out to avoid.
function buildScene(): void {
  if (!setup) return;
  for (const entry of rowEntries) setup.scene.remove(entry.pickMesh);
  rowEntries = [];
  let offset = 0;
  for (const model of props.models) {
    const geo = geometryFor(model);
    if (!geo || geo.nodes.length === 0) continue;
    const { halfW, halfH } = halfExtents(model, geo);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, halfH * 2, PICK_DEPTH),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    mesh.position.set(model.screen.x ?? 0, model.screen.y ?? 0, model.screen.z ?? 0);
    mesh.userData.modelId = model.id;
    setup.scene.add(mesh);
    rowEntries.push({ model, geometry: geo, offset, pickMesh: mesh });
    offset += geo.nodes.length;
  }

  const positions = buildPositions();
  if (points) setup.scene.remove(points);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ size: 3, color: 0xe8c468, sizeAttenuation: false });
  points = new THREE.Points(geo, material);
  points.raycast = () => {}; // display only - never the pick target, see comment above
  setup.scene.add(points);

  if (dragControls) dragControls.dispose();
  dragControls = new DragControls(
    rowEntries.map((e) => e.pickMesh),
    setup.camera,
    setup.renderer.domElement,
  );
  dragControls.addEventListener("dragstart", (e) => {
    if (orbit) orbit.enabled = false;
    const modelId = (e.object as THREE.Object3D).userData.modelId as number;
    emit("select", modelId);
  });
  dragControls.addEventListener("drag", (e) => {
    const mesh = e.object as THREE.Object3D;
    const entry = rowEntries.find((r) => r.pickMesh === mesh);
    if (!entry || !points) return;
    const posAttr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const scale = entry.model.screen.scale ?? 1;
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      arr[idx] = mesh.position.x + node.screenX * NODE_SPACING * scale;
      arr[idx + 1] = mesh.position.y + node.screenY * NODE_SPACING * scale;
      arr[idx + 2] = mesh.position.z;
    });
    posAttr.needsUpdate = true;
    if (selectionHelper && selectionHelper.object === mesh) selectionHelper.update();
  });
  dragControls.addEventListener("dragend", (e) => {
    if (orbit) orbit.enabled = true;
    const mesh = e.object as THREE.Object3D;
    const modelId = mesh.userData.modelId as number;
    emit("move", modelId, mesh.position.x, mesh.position.y, mesh.position.z);
  });

  updateSelectionHighlight();
}

function updateSelectionHighlight(): void {
  if (!setup) return;
  if (selectionHelper) {
    setup.scene.remove(selectionHelper);
    selectionHelper = null;
  }
  const entry = rowEntries.find((r) => r.model.id === props.selectedModelId);
  if (entry) {
    selectionHelper = new THREE.BoxHelper(entry.pickMesh, 0xe8c468);
    setup.scene.add(selectionHelper);
  }
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
  camera.position.set(cx, cy - span * 0.6, span * 1.1);
  camera.near = 1;
  camera.far = span * 6;
  camera.updateProjectionMatrix();
  if (orbit) {
    orbit.target.set(cx, cy, 0);
    orbit.update();
  }
}

function onPointerDown(e: PointerEvent): void {
  downPoint = { x: e.clientX, y: e.clientY };
}
function onPointerUp(e: PointerEvent): void {
  if (!downPoint || !setup) return;
  const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y);
  downPoint = null;
  if (moved > 4) return; // a camera-orbit drag or a model drag, not a plain click

  const rect = setup.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, setup.camera);
  const hit = raycaster.intersectObjects(rowEntries.map((r) => r.pickMesh))[0];
  emit("select", hit ? ((hit.object.userData.modelId as number) ?? null) : null);
}

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;
  setup = createScene(container);
  orbit = new OrbitControls(setup.camera, setup.renderer.domElement);
  orbit.enableDamping = true;
  buildScene();
  fitCameraToScene();

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", handleResize);

  const animate = () => {
    orbit?.update();
    if (setup) setup.renderer.render(setup.scene, setup.camera);
    rafId = requestAnimationFrame(animate);
  };
  animate();
});

function handleResize(): void {
  const container = containerRef.value;
  if (!container || !setup) return;
  resizeScene(setup, container);
}

onBeforeUnmount(() => {
  const container = containerRef.value;
  container?.removeEventListener("pointerdown", onPointerDown);
  container?.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("resize", handleResize);
  if (rafId) cancelAnimationFrame(rafId);
  dragControls?.dispose();
  orbit?.dispose();
  if (setup && container) disposeScene(setup, container);
});

watch(() => props.models, buildScene, { deep: true });
watch(() => props.selectedModelId, updateSelectionHighlight);
</script>

<template>
  <div ref="containerRef" class="layout-canvas-3d"></div>
</template>

<style scoped>
.layout-canvas-3d {
  width: 100%;
  height: 100%;
}
.layout-canvas-3d :deep(canvas) {
  display: block;
}
</style>
