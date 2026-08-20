<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { computeGeometryFromAttrs, geometryCenter, nodeWorldOffset, transformedHalfExtents, type ModelGeometry, type ScreenTransform } from "@webxlights/engine";
import type { ModelRecord, ViewObjectRecord } from "../lib/api";
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";
import { displayY, transformForModel } from "../lib/modelTransform";
import { groundedAnchorY, resizeFromCorner } from "../lib/resizeModel";

const props = defineProps<{ models: ModelRecord[]; viewObjects?: ViewObjectRecord[]; selectedModelId: number | null }>();
const emit = defineEmits<{
  select: [modelId: number | null];
  move: [modelId: number, x: number, y: number, z: number];
  create: [type: string, x: number, y: number];
  resize: [modelId: number, screen: { scale: number; scaleY: number; scaleZ: number; y: number }];
}>();

// Must match ModelPalette.vue's dragstart payload exactly.
const MODEL_DRAG_MIME = "application/x-webxlights-model-type";

const NODE_SPACING = 4; // matches LayoutCanvas (2D) and HousePreview's local-unit-to-px scale
const PICK_DEPTH = 12; // flat 2D models get a thin box for raycasting, not zero-volume
const CLICK_SLOP = 4; // px of pointer travel still counted as a click rather than a drag
const GROUND_GRID_SPAN = 4000;
const GROUND_GRID_SPACING = 100;

// Y is up in this scene, so the ground is the XZ plane and Z is depth into the yard. A drag
// therefore moves a prop along the house (X) and up the wall (Y) by default, which is what
// nearly every placement is; depth is the rarer one and gets an explicit modifier rather than
// being mixed into the same gesture. Free 3D dragging - what DragControls does, moving in
// whatever plane happens to face the camera - makes the other two axes drift every time you
// nudge one, which is why this drags itself rather than using DragControls.
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const zAxisMode = ref(false);

const containerRef = ref<HTMLDivElement | null>(null);
let setup: SceneSetup | null = null;
let orbit: OrbitControls | null = null;
let points: THREE.Points | null = null;
let selectionHelper: THREE.BoxHelper | null = null;
let rafId: number | null = null;
let gridLines: THREE.LineSegments[] = [];
let groundGrid: THREE.LineSegments | null = null;

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

  // Without a ground you can see, "nothing goes below the ground" is a rule that fires
  // invisibly - a prop stops moving and it reads as a bug. A show that carries its own
  // Gridlines gets that; everything else gets a faint default one at the same height.
  if (groundGrid) {
    setup.scene.remove(groundGrid);
    groundGrid = null;
  }
  if (gridLines.length === 0) {
    groundGrid = buildGridLines(GROUND_GRID_SPAN, GROUND_GRID_SPAN, GROUND_GRID_SPACING);
    groundGrid.position.set(0, groundY(), 0);
    (groundGrid.material as THREE.LineBasicMaterial).opacity = 0.18;
    setup.scene.add(groundGrid);
  }
}

interface RowEntry {
  model: ModelRecord;
  /** Depth scale, which the 2D transform doesn't carry but a resize still has to track. */
  scaleZ: number;
  geometry: ModelGeometry;
  center: { x: number; y: number };
  transform: ScreenTransform;
  offset: number;
  pickMesh: THREE.Mesh;
  /** How far the anchor has to sit above the ground for the model's lowest node to rest on it. */
  halfHeightWorld: number;
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
  return transformForModel(model);
}

function buildPositions(): Float32Array {
  const total = rowEntries.reduce((sum, e) => sum + e.geometry.nodes.length, 0);
  const positions = new Float32Array(total * 3);
  for (const entry of rowEntries) {
    // The pick box is where the model actually is - it already carries the ground rule, and
    // reading the record again here is how the drawn nodes and the box they are picked by came
    // to be able to disagree.
    const { x: mx, y: my, z: mz } = entry.pickMesh.position;
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      const off = nodeWorldOffset(node, entry.center, entry.transform);
      positions[idx] = mx + off.x * NODE_SPACING;
      positions[idx + 1] = my + off.y * NODE_SPACING;
      // real per-node depth (models/types.ts) - a 360-degree tree is a cone, not a flat plane
      positions[idx + 2] = mz + off.z * NODE_SPACING;
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
    // A ground-standing model is drawn with its base on the lawn rather than at whatever Y it
    // was stored with. The stored position is the model's *centre*, so how high that has to be
    // depends on how tall we work the model out to be - and a tree's height changed when strand
    // folding landed, which left every one of them hanging in the air. Planting it here rather
    // than writing it back means nothing rewrites a position somebody set, and the pick box uses
    // the same answer so a model doesn't jump when it is grabbed.
    mesh.position.set(
      model.screen.x ?? 0,
      displayY(model, halfH * NODE_SPACING, groundY(), keepOnGround.value),
      model.screen.z ?? 0,
    );
    mesh.userData.modelId = model.id;
    setup.scene.add(mesh);
    rowEntries.push({
      model,
      scaleZ: model.screen.scaleZ ?? model.screen.scale ?? 1,
      geometry: geo,
      center: geometryCenter(geo),
      transform,
      offset,
      pickMesh: mesh,
      halfHeightWorld: halfH * NODE_SPACING,
    });
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
  buildHandles();
}

/**
 * Keep a prop's feet on the lawn.
 *
 * On by default because it is true of almost everything in a yard, and because the failure it
 * prevents is quiet: a prop sunk halfway into the ground still renders, it just looks wrong in
 * the preview and nowhere else. Turned off for the things it isn't true of - a star on a roof
 * peak, lights along a gutter.
 */
const keepOnGround = ref(true);
// Turning it off should put a planted model back where its record says it is, so the scene has to
// be rebuilt rather than only the next drag behaving differently.
watch(keepOnGround, () => buildScene());

/**
 * Resize every axis together rather than X and Y separately.
 *
 * For anything with a round footprint - a mega tree, a wreath, a sphere - X and Y independently
 * is the wrong control: making it taller without making it wider turns a cone into a spike, and
 * the depth would stay behind either way. Off by default, because a matrix or a roofline is
 * exactly the case where you do want to stretch one axis alone.
 */
const uniformScale = ref(false);

// Little square grips at the corners of the selected model's box. Cubes rather than sprites or
// screen-space quads: a cube is pickable from any camera angle, including the orbits where the
// model's own plane is edge-on and a flat handle would vanish.
const HANDLE_MIN_WORLD = 6;
const HANDLE_FRACTION = 0.1; // of the smaller half-extent, so a big prop gets bigger grips
let handleMeshes: THREE.Mesh[] = [];

function clearHandles(): void {
  if (!setup) return;
  for (const h of handleMeshes) {
    setup.scene.remove(h);
    h.geometry.dispose();
  }
  handleMaterial?.dispose();
  handleMaterial = null;
  handleMeshes = [];
}
let handleMaterial: THREE.MeshBasicMaterial | null = null;

/** The four corners of a model's box, as (+/-1, +/-1) signs and world positions. */
function handleCornersFor(entry: RowEntry): { sx: number; sy: number; pos: THREE.Vector3 }[] {
  const { halfW, halfH } = worldHalfExtents(entry);
  const p = entry.pickMesh.position;
  const corners: { sx: number; sy: number; pos: THREE.Vector3 }[] = [];
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      corners.push({ sx, sy, pos: new THREE.Vector3(p.x + sx * halfW, p.y + sy * halfH, p.z) });
    }
  }
  return corners;
}

function worldHalfExtents(entry: RowEntry): { halfW: number; halfH: number } {
  const { halfW, halfH } = transformedHalfExtents(entry.geometry, entry.transform);
  return { halfW: Math.max(halfW * NODE_SPACING, 8), halfH: Math.max(halfH * NODE_SPACING, 8) };
}

/** Local half-extents at scale 1, which is what a world size has to be divided by to get a scale. */
function unitHalfExtents(entry: RowEntry): { halfW: number; halfH: number } {
  // Every rotation, not just Z. A model tipped on X is a different height on screen than the same
  // model upright, and measuring it as though it were upright makes a corner drag resize it by the
  // wrong factor.
  const { halfW, halfH } = transformedHalfExtents(entry.geometry, {
    scale: 1,
    scaleY: 1,
    scaleZ: 1,
    rotateDeg: entry.transform.rotateDeg,
    rotateXDeg: entry.transform.rotateXDeg,
    rotateYDeg: entry.transform.rotateYDeg,
  });
  return { halfW: Math.max(halfW, 1e-6), halfH: Math.max(halfH, 1e-6) };
}

function buildHandles(): void {
  if (!setup) return;
  clearHandles();
  const entry = rowEntries.find((r) => r.model.id === props.selectedModelId);
  if (!entry) return;
  const { halfW, halfH } = worldHalfExtents(entry);
  const size = Math.max(Math.min(halfW, halfH) * HANDLE_FRACTION, HANDLE_MIN_WORLD);
  handleMaterial = new THREE.MeshBasicMaterial({ color: 0xe8c468, depthTest: false });
  for (const corner of handleCornersFor(entry)) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), handleMaterial);
    mesh.position.copy(corner.pos);
    mesh.renderOrder = 999; // drawn over the model, so a grip inside a dense prop stays visible
    setup.scene.add(mesh);
    handleMeshes.push(mesh);
  }
}

function moveHandlesTo(entry: RowEntry): void {
  const corners = handleCornersFor(entry);
  handleMeshes.forEach((mesh, i) => {
    const corner = corners[i];
    if (corner) mesh.position.copy(corner.pos);
  });
}

interface ResizeState {
  entry: RowEntry;
  unit: { halfW: number; halfH: number };
  startScaleZ: number;
  startScale: number;
  changed: boolean;
}
let resizeState: ResizeState | null = null;

/**
 * Where a resize drag puts the model's scale.
 *
 * Measured from the model's centre to the pointer, because the centre is the anchor everything
 * else is defined against (transform.ts): the model stays put and grows around it, rather than
 * the opposite corner staying put and the anchor sliding - which would fight the position the
 * user already set.
 */
function applyResize(hit: THREE.Vector3): void {
  if (!resizeState) return;
  const { entry, unit, startScale, startScaleZ } = resizeState;
  const centre = entry.pickMesh.position;
  const { scale, scaleY, scaleZ } = resizeFromCorner({
    halfWidthWorld: Math.abs(hit.x - centre.x),
    halfHeightWorld: Math.abs(hit.y - centre.y),
    unitHalfWidth: unit.halfW,
    unitHalfHeight: unit.halfH,
    unitsPerLocal: NODE_SPACING,
    startScale,
    startScaleZ,
    uniform: uniformScale.value,
  });

  entry.transform = { ...entry.transform, scale, scaleY };
  entry.scaleZ = scaleZ;
  const next = entry.pickMesh.position.clone();
  if (keepOnGround.value) {
    // Grown about the centre, so the base drops by half of whatever height was added. Planting
    // it back on the floor is what makes a resize read as "this prop got bigger" rather than
    // "this prop got bigger and sank".
    next.y = groundedAnchorY(groundY(), transformedHalfExtents(entry.geometry, entry.transform).halfH * NODE_SPACING);
  }
  resizeState.changed = true;
  applyDragPosition(entry, next);
  moveHandlesTo(entry);
}

/**
 * Whether the camera has ever been fitted to a scene that actually had something in it.
 *
 * The fit used to happen once, at mount - before the models had loaded, so it measured an empty
 * scene and fell back to a fixed +/-100 box. Every layout therefore opened on a view that was
 * nothing like the one Reset view gives you, and pressing the button was the only way to get it.
 * Fitting on the first load that brings models in makes the opening view and the reset view the
 * same thing.
 *
 * Only the first: re-fitting on every change would yank the camera back every time a model was
 * dragged, which is the opposite of useful while arranging a yard.
 */
let hasFittedToModels = false;

/** Moves the camera towards or away from what it is looking at. */
function zoomView(factor: number): void {
  if (!setup || !orbit) return;
  const camera = setup.camera;
  const fromTarget = camera.position.clone().sub(orbit.target).multiplyScalar(factor);
  camera.position.copy(orbit.target.clone().add(fromTarget));
  orbit.update();
}

function fitCameraToScene(): void {
  if (!setup) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const entry of rowEntries) {
    const { x: mx, y: my } = entry.pickMesh.position;
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
  camera.position.set(cx, Math.max(cy + span * 0.12, groundY() + span * 0.1), span * 1.15);
  camera.near = 1;
  camera.far = span * 6;
  camera.updateProjectionMatrix();
  if (orbit) {
    orbit.target.set(cx, cy, 0);
    orbit.update();
  }
}

// The ground the layout stands on. A show that carries a Gridlines view object puts it where
// that object sits; anything else gets y=0, which is where every importer writes a prop that
// rests on the lawn.
function groundY(): number {
  for (const obj of props.viewObjects ?? []) {
    if (obj.type !== "Gridlines" || obj.raw_attrs.Active === "0") continue;
    const y = parseFloat(obj.raw_attrs.WorldPosY ?? "");
    if (Number.isFinite(y)) return y;
  }
  return 0;
}

// Lowest the anchor can go before the model's own lowest node would be underground.
function floorFor(entry: RowEntry): number {
  return groundY() + entry.halfHeightWorld;
}

function pointerRay(e: PointerEvent): THREE.Ray | null {
  if (!setup) return null;
  const rect = setup.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, setup.camera);
  return raycaster.ray;
}

// Where a ray crosses the constant-depth plane a model currently sits in.
function rayOnDepthPlane(ray: THREE.Ray, depth: number): THREE.Vector3 | null {
  const plane = new THREE.Plane(AXIS_Z.clone(), -depth);
  const hit = new THREE.Vector3();
  return ray.intersectPlane(plane, hit) ? hit : null;
}

/**
 * A model dragged out of the palette and dropped on the scene.
 *
 * Dropped onto the z=0 plane, which is where a new model belongs: it is the plane the grid marks
 * out and the one every drag-created model has sat in since there was a 2D canvas to create them
 * on. Depth is something you set afterwards, by dragging with Z held.
 *
 * A drop that misses the plane entirely - possible when the camera has been orbited until the
 * plane is edge-on or behind the viewer - is ignored rather than guessed at, because the guess
 * would put a model somewhere the user cannot see it.
 */
function onDrop(e: DragEvent): void {
  const type = e.dataTransfer?.getData(MODEL_DRAG_MIME);
  if (!type || !setup) return;
  const rect = setup.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, setup.camera);
  const hit = rayOnDepthPlane(raycaster.ray, 0);
  if (!hit) return;
  emit("create", type, hit.x, hit.y);
}

function projectToScreen(p: THREE.Vector3): THREE.Vector2 | null {
  if (!setup) return null;
  const rect = setup.renderer.domElement.getBoundingClientRect();
  const v = p.clone().project(setup.camera);
  return new THREE.Vector2((v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height);
}

// How pointer movement turns into depth, worked out once per drag.
//
// Geometry can't answer this on its own. The obvious constructions - intersect a plane holding
// the axis, or take the closest point between the axis and the pointer ray - both collapse in
// exactly the view a depth drag is most wanted from: looking at the front of the house, where
// the depth axis points straight at the camera. The first sends the intersection to infinity,
// the second divides by zero. Measuring the axis on screen instead degrades gracefully: while
// there is a direction to project onto, the model tracks the pointer along it; once the axis is
// too close to head-on to have one, vertical movement drives depth, dragging down bringing a
// prop towards the viewer.
const AXIS_PROBE = 100; // world units, long enough to measure a direction from
const HEAD_ON_PX = 20; // shorter than this on screen and the axis has no usable direction

interface DepthMapping {
  dir: THREE.Vector2 | null; // screen direction of +Z, null when head-on
  unitsPerPixel: number;
}

function depthMappingAt(origin: THREE.Vector3): DepthMapping {
  const a0 = projectToScreen(origin);
  const along = projectToScreen(origin.clone().addScaledVector(AXIS_Z, AXIS_PROBE));
  const up = projectToScreen(origin.clone().add(new THREE.Vector3(0, AXIS_PROBE, 0)));
  if (!a0 || !along) return { dir: null, unitsPerPixel: 1 };

  // The vertical scale is the yardstick for how fast any drag should move, and the ceiling on
  // how fast this one may: as the axis turns towards the camera its screen length collapses, and
  // world-units-per-pixel taken straight from it runs away - a 130px drag moved a prop eleven
  // hundred units before this cap, which is most of a yard.
  const upLen = up ? up.clone().sub(a0).length() : 0;
  const verticalUnitsPerPixel = AXIS_PROBE / Math.max(upLen, 1);

  const screenAxis = along.clone().sub(a0);
  const len = screenAxis.length();
  if (len >= HEAD_ON_PX) {
    return {
      dir: screenAxis.divideScalar(len),
      unitsPerPixel: Math.min(AXIS_PROBE / len, verticalUnitsPerPixel),
    };
  }
  return { dir: null, unitsPerPixel: verticalUnitsPerPixel };
}

interface DragState {
  entry: RowEntry;
  start: THREE.Vector3;
  /** Offset from the pointer to the anchor at grab time, so the model doesn't jump to the cursor. */
  grabPlane: THREE.Vector3;
  pointer: { x: number; y: number };
  depth: DepthMapping;
  moved: boolean;
}
let dragState: DragState | null = null;

function applyDragPosition(entry: RowEntry, position: THREE.Vector3): void {
  const mesh = entry.pickMesh;
  mesh.position.copy(position);
  if (!points) return;
  const posAttr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  entry.geometry.nodes.forEach((node, i) => {
    const idx = (entry.offset + i) * 3;
    const off = nodeWorldOffset(node, entry.center, entry.transform);
    arr[idx] = mesh.position.x + off.x * NODE_SPACING;
    arr[idx + 1] = mesh.position.y + off.y * NODE_SPACING;
    arr[idx + 2] = mesh.position.z + off.z * NODE_SPACING;
  });
  posAttr.needsUpdate = true;
  if (selectionHelper && selectionHelper.object === mesh) selectionHelper.update();
}

function onPointerDown(e: PointerEvent): void {
  downPoint = { x: e.clientX, y: e.clientY };
  if (!setup) return;
  const ray = pointerRay(e);
  if (!ray) return;
  const raycaster = new THREE.Raycaster();
  raycaster.set(ray.origin, ray.direction);

  // Grips first. They sit on the model's own outline, so a raycast that tested the body first
  // would swallow every corner drag and turn it into a move.
  const grip = raycaster.intersectObjects(handleMeshes)[0];
  const selected = rowEntries.find((r) => r.model.id === props.selectedModelId);
  if (grip && selected) {
    // Which corner was grabbed doesn't need recording: the new size is the distance from the
    // model's centre to the pointer, and that is the same measurement from any of the four.
    resizeState = {
      entry: selected,
      unit: unitHalfExtents(selected),
      startScale: selected.transform.scale ?? 1,
      startScaleZ: selected.scaleZ,
      changed: false,
    };
    if (orbit) orbit.enabled = false;
    return;
  }

  const hit = raycaster.intersectObjects(rowEntries.map((r) => r.pickMesh))[0];
  if (!hit) return;

  const entry = rowEntries.find((r) => r.pickMesh === hit.object);
  if (!entry) return;
  const start = entry.pickMesh.position.clone();
  const planeHit = rayOnDepthPlane(ray, start.z);
  dragState = {
    entry,
    start,
    grabPlane: planeHit ? start.clone().sub(planeHit) : new THREE.Vector3(),
    pointer: { x: e.clientX, y: e.clientY },
    depth: depthMappingAt(start),
    moved: false,
  };
  if (orbit) orbit.enabled = false;
  emit("select", entry.model.id);
}

function onPointerMove(e: PointerEvent): void {
  if (resizeState) {
    const ray = pointerRay(e);
    if (!ray) return;
    const hit = rayOnDepthPlane(ray, resizeState.entry.pickMesh.position.z);
    if (hit) applyResize(hit);
    return;
  }
  if (!dragState) return;
  const ray = pointerRay(e);
  if (!ray) return;
  const { entry, start, grabPlane, pointer, depth } = dragState;
  const next = start.clone();

  if (zAxisMode.value) {
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    next.z = start.z + (depth.dir ? (dx * depth.dir.x + dy * depth.dir.y) : dy) * depth.unitsPerPixel;
  } else {
    const planeHit = rayOnDepthPlane(ray, start.z);
    if (!planeHit) return;
    next.x = planeHit.x + grabPlane.x;
    next.y = planeHit.y + grabPlane.y;
  }

  // A prop can rest on the lawn but never sink into it, whichever axis is being dragged. The
  // floor is never above where the model already was: a show that places something below ground
  // on purpose shouldn't have it yanked upwards the first time it's nudged sideways.
  if (keepOnGround.value) next.y = Math.max(next.y, Math.min(floorFor(entry), start.y));
  dragState.moved = true;
  applyDragPosition(entry, next);
}

function onPointerUp(e: PointerEvent): void {
  if (resizeState) {
    const { entry, changed } = resizeState;
    resizeState = null;
    downPoint = null;
    if (orbit) orbit.enabled = true;
    if (changed) {
      emit("resize", entry.model.id, {
        scale: entry.transform.scale ?? 1,
        scaleY: entry.transform.scaleY ?? entry.transform.scale ?? 1,
        scaleZ: entry.scaleZ,
        y: entry.pickMesh.position.y,
      });
    }
    return;
  }
  if (dragState) {
    const { entry, moved } = dragState;
    dragState = null;
    downPoint = null;
    if (orbit) orbit.enabled = true;
    if (moved) {
      const p = entry.pickMesh.position;
      emit("move", entry.model.id, p.x, p.y, p.z);
      return;
    }
    emit("select", entry.model.id);
    return;
  }

  if (!downPoint || !setup) return;
  const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y);
  downPoint = null;
  if (moved > CLICK_SLOP) return; // a camera-orbit drag, not a plain click

  const ray = pointerRay(e);
  if (!ray) return;
  const raycaster = new THREE.Raycaster();
  raycaster.set(ray.origin, ray.direction);
  const hit = raycaster.intersectObjects(rowEntries.map((r) => r.pickMesh))[0];
  emit("select", hit ? ((hit.object.userData.modelId as number) ?? null) : null);
}

// Held, not toggled: a modifier you have to keep down can't be left on by accident, and the
// hint in the corner says which mode a drag is about to use.
function onKeyDown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (e.key === "z" || e.key === "Z") zAxisMode.value = true;
}
function onKeyUp(e: KeyboardEvent): void {
  if (e.key === "z" || e.key === "Z") zAxisMode.value = false;
}
// Releasing the key over another window would otherwise leave depth mode stuck on.
function onWindowBlur(): void {
  zAxisMode.value = false;
}

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;
  setup = createScene(container, { transparent: true });
  orbit = new OrbitControls(setup.camera, setup.renderer.domElement);
  orbit.enableDamping = true;
  buildScene();
  buildViewObjects();
  fitCameraToScene();
  hasFittedToModels = rowEntries.length > 0;

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);

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
  container?.removeEventListener("pointermove", onPointerMove);
  container?.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onWindowBlur);
  if (rafId) cancelAnimationFrame(rafId);
  orbit?.dispose();
  if (setup && container) disposeScene(setup, container);
});

watch(
  () => props.models,
  () => {
    buildScene();
    if (!hasFittedToModels && rowEntries.length > 0) {
      hasFittedToModels = true;
      fitCameraToScene();
    }
  },
  { deep: true },
);
watch(() => props.viewObjects, buildViewObjects, { deep: true });
watch(() => props.selectedModelId, updateSelectionHighlight);
</script>

<template>
  <div class="layout-canvas-3d-wrap" @dragover.prevent @drop.prevent="onDrop">
    <div ref="containerRef" class="layout-canvas-3d"></div>
    <div class="view-hud">
      <span class="axis-hint" :class="{ active: zAxisMode }">
        {{ zAxisMode ? "Dragging depth (Z)" : "Dragging X / Y — hold Z for depth" }}
      </span>
      <label class="hud-toggle" title="Keep a prop's feet on the lawn when it is moved or resized">
        <input type="checkbox" v-model="keepOnGround" />
        Keep on the ground
      </label>
      <label class="hud-toggle" title="Resize every axis together - what a tree or a wreath wants">
        <input type="checkbox" v-model="uniformScale" />
        Scale all axes
      </label>
      <span class="zoom-group">
        <button type="button" title="Zoom out" @click="zoomView(1.25)">−</button>
        <button type="button" title="Zoom in" @click="zoomView(0.8)">+</button>
      </span>
      <button type="button" @click="fitCameraToScene">Reset view</button>
    </div>
  </div>
</template>

<style scoped>
.layout-canvas-3d-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.layout-canvas-3d {
  width: 100%;
  height: 100%;
}
.view-hud {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}
.hud-toggle {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: rgba(20, 20, 26, 0.75);
  color: #cfcfd8;
  white-space: nowrap;
  cursor: pointer;
}
.hud-toggle input {
  cursor: pointer;
}
.zoom-group {
  display: inline-flex;
  gap: 0.15rem;
}
.zoom-group button {
  width: 22px;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0.1rem 0;
}
.axis-hint {
  padding: 0.2rem 0.45rem;
  border-radius: 3px;
  background: rgba(17, 17, 22, 0.8);
  color: #888;
}
.axis-hint.active {
  color: #111;
  background: #e8c468;
}
.view-hud button {
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  color: #ddd;
  background: rgba(17, 17, 22, 0.85);
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
}
.view-hud button:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.layout-canvas-3d :deep(canvas) {
  display: block;
}
</style>
