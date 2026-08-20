<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import {
  computeGeometryFromAttrs,
  strandSpecs,
  DEFAULT_PALETTE,
  geometryCenter,
  nodeWorldOffset,
  planGroupRendering,
  scatterGroupColors,
  renderRowAtMs,
  type AudioSeries,
  type ModelGeometry,
  type RGBA,
} from "@webxlights/engine";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "../lib/api";
import { groupRenderSpecs } from "../lib/groupRendering";
import { composeModel, type RenderRow } from "../lib/composeModel";
import { toRenderableEffects } from "../lib/renderableEffects";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";
import { transformForModel } from "../lib/modelTransform";

const props = defineProps<{
  models: ModelRecord[];
  // A group row renders across several models at once, so the preview needs the memberships as
  // well as the models themselves.
  groups?: ModelGroupRecord[];
  body: SequenceBody;
  playheadMs: number;
  frameMs: number;
  // The analysed track. Undefined means "no audio loaded", which audio-reactive effects render
  // differently from a silent frame of a loaded one (renderFrame.ts).
  audio?: AudioSeries;
  // xLights' Sequence Settings > "Allow Blending Between Models". Off, a model's own effects
  // replace the group wherever they draw; on, they composite over it.
  blendBetweenModels?: boolean;
}>();

const SEED = 12345;
const NODE_SPACING = 4; // matches LayoutCanvas's local-unit-to-px scale

const containerRef = ref<HTMLDivElement | null>(null);
let setup: SceneSetup | null = null;
let points: THREE.Points | null = null;
let orbit: OrbitControls | null = null;
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

function geometryByModelId(): Map<number, ModelGeometry> {
  return new Map(rowEntries.map((e) => [e.model.id, e.geometry]));
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
    const mz = entry.model.screen.z ?? 0;
    // Shares the layout canvases' transform so the show previews in the same shape it's laid
    // out in - per-axis scale, rotation and real per-node depth, not a flat scale on raw
    // screenX/screenY (which ignored rotation and squashed a 360-degree tree into a triangle).
    const transform = transformForModel(entry.model);
    const center = geometryCenter(entry.geometry);
    entry.geometry.nodes.forEach((node, i) => {
      const idx = (entry.offset + i) * 3;
      const off = nodeWorldOffset(node, center, transform);
      positions[idx] = mx + off.x * NODE_SPACING;
      positions[idx + 1] = my + off.y * NODE_SPACING;
      positions[idx + 2] = mz + off.z * NODE_SPACING;
    });
  }
  return positions;
}

/**
 * Everything the compose step needs that does NOT depend on the playhead.
 *
 * All of this used to be rebuilt inside the per-frame loop: for each model, a
 * filter over every row in the body for its own effects, then another full-body
 * filter per strand, then another per sub-model, each feeding a fresh
 * toRenderableEffects() and a new Map. At 100 rows that is thousands of array
 * scans and allocations per frame for data that only changes when the sequence
 * is edited. Rows are indexed once and the per-model inputs are memoised; the
 * group render plan is hoisted the same way, since only the renderRowAtMs call
 * inside it depends on time.
 */
interface ComposeInputs {
  own: ReturnType<typeof toRenderableEffects>;
  strands: Map<string, ReturnType<typeof toRenderableEffects>>;
  subModels: { spec: NonNullable<ModelRecord["sub_models"]>[number]; effects: ReturnType<typeof toRenderableEffects> }[];
}
let composeInputs: ComposeInputs[] = [];
let groupJobs: ReturnType<typeof planGroupRendering> = [];

function rebuildComposeCache(): void {
  // key -> effects, so a row lookup is a hash hit instead of a full-body scan.
  const byKey = new Map<string, SequenceBody["rows"][number]["effects"]>();
  for (const r of props.body.rows) {
    const key = `${r.elementType}|${r.elementId}|${r.subName ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.push(...r.effects);
    else byKey.set(key, [...r.effects]);
  }
  const at = (type: string, id: number, sub?: string) => byKey.get(`${type}|${id}|${sub ?? ""}`) ?? [];
  const tracks = props.body.timingTracks;

  composeInputs = rowEntries.map((entry) => ({
    own: toRenderableEffects(at("model", entry.model.id), { timingTracks: tracks, model: entry.model }),
    strands: new Map(
      strandSpecs(entry.geometry).map((spec) => [
        spec.name,
        toRenderableEffects(at("strand", entry.model.id, spec.name), { timingTracks: tracks }),
      ]),
    ),
    // A sub-model row gets the timing tracks but not the parent's state definitions: a state's
    // node ranges are numbered against the model they were defined on, so applying them to a
    // sub-model's own numbering would light the wrong nodes.
    subModels: (entry.model.sub_models ?? []).map((spec) => ({
      spec,
      effects: toRenderableEffects(at("submodel", entry.model.id, spec.name), { timingTracks: tracks }),
    })),
  }));

  groupJobs = planGroupRendering(groupRenderSpecs(props.groups ?? [], geometryByModelId(), props.body));
}

function updateColors(): void {
  if (!points) return;
  const colorAttr = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  const arr = colorAttr.array as Float32Array;

  // Group rows first: a group says what the whole yard is doing, so it is the base a model's own
  // effects sit on top of. Rendered once per group rather than once per member, because that is
  // the point of a group render style - one buffer spanning several props.
  const groupBase = new Map<number, RGBA[]>();
  for (const job of groupJobs) {
    const colors = renderRowAtMs(job.row, props.playheadMs, props.frameMs, SEED, DEFAULT_PALETTE, props.audio);
    scatterGroupColors(job, colors, groupBase);
  }

  for (let e = 0; e < rowEntries.length; e++) {
    const entry = rowEntries[e]!;
    const inputs = composeInputs[e];
    if (!inputs) continue;
    // The compose order lives in lib/composeModel.ts so the screen's copy of these rules can be
    // tested: nothing in this suite mounts a Vue component, and the .fseq export carries its own
    // copy of the same rules. Two implementations, one of them unobserved, is how a show comes to
    // look right on screen and play wrong in the yard.
    const nodeColors = composeModel({
      geometry: entry.geometry,
      own: inputs.own,
      strands: inputs.strands,
      subModels: inputs.subModels,
      groupBase: groupBase.get(entry.model.id),
      blendGroup: props.blendBetweenModels === true,
      render: ((geometry, effects) =>
        renderRowAtMs({ geometry, effects }, props.playheadMs, props.frameMs, SEED, DEFAULT_PALETTE, props.audio)) as RenderRow,
    });

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

// Same first-load rule as the layout canvas: the fit at mount measures a scene the models have
// not arrived in yet, so the opening view was never the one Reset view gives.
let hasFittedToModels = false;

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
  camera.near = 1;
  // Far enough to keep the yard in view after the camera has been pulled well back by hand -
  // the old span x 5 clipped the show out of existence a couple of wheel notches out.
  camera.far = span * 40;
  camera.updateProjectionMatrix();
  // Orbiting turns about this point, so it has to be told where the show is; setting it after
  // the camera means lookAt is redundant - OrbitControls.update() does it.
  if (orbit) {
    orbit.target.set(cx, cy, 0);
    orbit.update();
  } else {
    camera.lookAt(cx, cy, 0);
  }
}

function initScene(): void {
  const container = containerRef.value;
  if (!container) return;

  setup = createScene(container);

  // Look around the show while it plays: drag to orbit, right-drag to pan, wheel to zoom. The
  // preview is a 3D scene and always has been - it just had a fixed camera pointed at the whole
  // yard, which is the one view that can't show you whether the far side of a mega tree is
  // lighting up, or what a prop at the back is doing.
  //
  // Damping off: it keeps animating for a beat after the pointer stops, and this component
  // already redraws every frame during playback. "Reset view" is how you get back.
  orbit = new OrbitControls(setup.camera, setup.renderer.domElement);
  orbit.enableDamping = false;

  buildGeometryCache();
  rebuildComposeCache();
  const positions = buildPositions();
  const colors = new Float32Array(positions.length);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 3, vertexColors: true, sizeAttenuation: false });
  points = new THREE.Points(geo, material);
  setup.scene.add(points);

  fitCameraToScene();
  hasFittedToModels = rowEntries.length > 0;
  updateColors();

  const animate = () => {
    orbit?.update();
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

// Two watchers, not one. They used to share a `deep: true` watch, which meant every playhead
// change re-traversed the whole sequence body to decide whether it had changed too - affordable
// four times a second, not sixty, and the playhead is the one that moves every frame.
watch(() => props.playheadMs, updateColors);
// The body watcher also refreshes the memoised compose inputs: they are derived from
// the body, so anything that invalidates one invalidates the other.
watch(
  () => props.body,
  () => {
    rebuildComposeCache();
    updateColors();
  },
  { deep: true },
);
// Group memberships feed the hoisted group render plan.
watch(
  () => props.groups,
  () => {
    rebuildComposeCache();
    updateColors();
  },
  { deep: true },
);
// `audio` arrives after the track is analysed, which is a repaint even at a stationary
// playhead - without it a VU Meter sits dark until the next scrub. Watched by identity, not
// deeply: the series is thousands of frames, and traversing it on every playhead tick would
// cost more than the render it triggers.
watch(() => props.audio, updateColors);
watch(
  () => props.models,
  () => {
    buildGeometryCache();
    rebuildComposeCache();
    if (!points) return;
    const positions = buildPositions();
    points.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    points.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    // Only the first time models arrive. This used to re-fit on every change, which threw away
    // the camera the moment anything in the show was edited - now that the preview can be
    // orbited, that is a view someone chose.
    if (!hasFittedToModels && rowEntries.length > 0) {
      hasFittedToModels = true;
      fitCameraToScene();
    }
    updateColors();
  },
);
</script>

<template>
  <div class="house-preview-wrap">
    <div ref="containerRef" class="house-preview"></div>
    <div class="view-controls">
      <button type="button" title="Zoom out" @click="zoomView(1.25)">−</button>
      <button type="button" title="Zoom in" @click="zoomView(0.8)">+</button>
      <button type="button" title="Back to the whole yard" @click="fitCameraToScene">Reset view</button>
    </div>
  </div>
</template>

<style scoped>
.house-preview-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.view-controls {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  display: flex;
  gap: 0.15rem;
  /* Only in the way while you are looking at the corner they sit in. */
  opacity: 0.55;
}
.view-controls:hover {
  opacity: 1;
}
.view-controls button {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: rgba(20, 20, 26, 0.85);
  color: #cfcfd8;
  border: 1px solid #3a3a44;
  cursor: pointer;
}
.house-preview {
  width: 100%;
  height: 100%;
}
.house-preview :deep(canvas) {
  display: block;
}
</style>
