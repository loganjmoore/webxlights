<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";
import { computeGeometryFromAttrs, geometryCenter, nodeWorldOffset, transformedHalfExtents, type ModelGeometry, type ScreenTransform } from "@webxlights/engine";
import type { ModelRecord, ViewObjectRecord } from "../lib/api";
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";

const props = defineProps<{ models: ModelRecord[]; viewObjects?: ViewObjectRecord[]; selectedModelId: number | null }>();
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
let gridLines: THREE.LineSegments[] = [];

// M15.7: real xLights' Gridlines view_object - a flat reference grid, most commonly used as a
// ground plane (RotateX=-90 in the real file this was verified against). Three.js's built-in
// GridHelper is square-only; xLights' Grid Width/Height are independent, so this builds the
// line segments directly instead of reaching for GridHelper and silently rounding to square.
function buildGridLines(width: number, height: number, spacingIn: number): THREE.LineSegments {
  const halfW = width / 2;
  const halfH = height / 2;
  // Guards a malformed/near-zero spacing from generating an unbounded number of lines.
  const spacing = Math.max(spacingIn, Math.max(width, height) / 500, 0.01);
  const verts: number[] = [];
  for (let x = -halfW; x <= halfW + 1e-6; x += spacing) verts.push(x, 0, -halfH, x, 0, halfH);
  for (let z = -halfH; z <= halfH + 1e-6; z += spacing) verts.push(-halfW, 0, z, halfW, 0, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x4a7a4a, transparent: true, opacity: 0.4 }));
}

function buildViewObjects(): void {
  if (!setup) return;
  for (const g of gridLines) setup.scene.remove(g);
  gridLines = [];
  for (const obj of props.viewObjects ?? []) {
    if (obj.type !== "Gridlines" || obj.raw_attrs.Active === "0") continue;
    const a = obj.raw_attrs;
    const num = (key: string, fallback: number) => {
      const n = parseFloat(a[key] ?? "");
      return Number.isFinite(n) ? n : fallback;
    };
    const mesh = buildGridLines(num("GridWidth", 1000), num("GridHeight", 1000), num("GridLineSpacing", 50));
    mesh.position.set(num("WorldPosX", 0), num("WorldPosY", 0), num("WorldPosZ", 0));
    mesh.rotation.set(
      THREE.MathUtils.degToRad(num("RotateX", -90)),
      THREE.MathUtils.degToRad(num("RotateY", 0)),
      THREE.MathUtils.degToRad(num("RotateZ", 0)),
    );
    setup.scene.add(mesh);
    gridLines.push(mesh);
  }
}

interface RowEntry {
  model: ModelRecord;
  geometry: ModelGeometry;
  center: { x: number; y: number };
  transform: ScreenTransform;
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

// Real xLights writes WorldPosX/Y as a model's *center*, and RotateZ pivots around that same
// center - `model.screen.x/y/z` is that anchor. See packages/engine/src/models/transform.ts's
// module doc for why every model type (not just the coincidentally-centered ones) needs this.
function transformFor(model: ModelRecord): ScreenTransform {
  return { scale: model.screen.scale ?? 1, scaleY: model.screen.scaleY, rotateDeg: model.screen.rotate ?? 0 };
}

function buildPositions(): Float32Array {
  const total = rowEntries.reduce((sum, e) => sum + e.geometry.nodes.length, 0);
  const positions = new Float32Array(total * 3);
  for (const entry of rowEntries) {
    const mx = entry.model.screen.x ?? 0;
    const my = entry.model.screen.y ?? 0;
    const mz = entry.model.screen.z ?? 0;
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      const off = nodeWorldOffset(node, entry.center, entry.transform);
      positions[idx] = mx + off.x * NODE_SPACING;
      positions[idx + 1] = my + off.y * NODE_SPACING;
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
    const transform = transformFor(model);
    const { halfW, halfH } = transformedHalfExtents(geo, transform);
    // Every node is already placed relative to the shape's own center (see nodeWorldOffset),
    // so a symmetric box at the anchor lines up with the rendered points directly - no
    // re-centering translate needed here the way an axis-aligned, buffer-dimension-sized box
    // used to require. Floor is a half-extent minimum (matches the pre-existing clickability
    // floor for tiny/degenerate shapes), not a full-size one.
    const halfWWorld = Math.max(halfW * NODE_SPACING, 10);
    const halfHWorld = Math.max(halfH * NODE_SPACING, 10);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfWWorld * 2, halfHWorld * 2, PICK_DEPTH),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    mesh.position.set(model.screen.x ?? 0, model.screen.y ?? 0, model.screen.z ?? 0);
    mesh.userData.modelId = model.id;
    setup.scene.add(mesh);
    rowEntries.push({ model, geometry: geo, center: geometryCenter(geo), transform, offset, pickMesh: mesh });
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
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      const off = nodeWorldOffset(node, entry.center, entry.transform);
      arr[idx] = mesh.position.x + off.x * NODE_SPACING;
      arr[idx + 1] = mesh.position.y + off.y * NODE_SPACING;
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
    // Real half-extents, not a flat 40-unit guess - a scaled-up or rotated model could
    // exceed that margin and clip against the camera's frustum edges.
    const { halfW, halfH } = transformedHalfExtents(entry.geometry, entry.transform);
    const marginX = Math.max(halfW * NODE_SPACING, 40);
    const marginY = Math.max(halfH * NODE_SPACING, 40);
    minX = Math.min(minX, mx - marginX);
    maxX = Math.max(maxX, mx + marginX);
    minY = Math.min(minY, my - marginY);
    maxY = Math.max(maxY, my + marginY);
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
  buildViewObjects();
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
watch(() => props.viewObjects, buildViewObjects, { deep: true });
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
