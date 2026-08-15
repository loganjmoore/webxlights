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
import { createScene, disposeScene, resizeScene, type SceneSetup } from "../lib/sceneSetup";

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
    const transform = {
      scale: entry.model.screen.scale ?? 1,
      scaleY: entry.model.screen.scaleY,
      scaleZ: entry.model.screen.scaleZ,
      rotateDeg: entry.model.screen.rotate ?? 0,
    };
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

function updateColors(): void {
  if (!points) return;
  const colorAttr = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  const arr = colorAttr.array as Float32Array;

  // Group rows first: a group says what the whole yard is doing, so it is the base a model's own
  // effects sit on top of. Rendered once per group rather than once per member, because that is
  // the point of a group render style - one buffer spanning several props.
  const groupBase = new Map<number, RGBA[]>();
  for (const job of planGroupRendering(groupRenderSpecs(props.groups ?? [], geometryByModelId(), props.body))) {
    const colors = renderRowAtMs(job.row, props.playheadMs, props.frameMs, SEED, DEFAULT_PALETTE, props.audio);
    scatterGroupColors(job, colors, groupBase);
  }

  for (const entry of rowEntries) {
    // The compose order lives in lib/composeModel.ts so the screen's copy of these rules can be
    // tested: nothing in this suite mounts a Vue component, and the .fseq export carries its own
    // copy of the same rules. Two implementations, one of them unobserved, is how a show comes to
    // look right on screen and play wrong in the yard.
    const nodeColors = composeModel({
      geometry: entry.geometry,
      own: toRenderableEffects(
        props.body.rows
          .filter((r) => r.elementType === "model" && r.elementId === entry.model.id)
          .flatMap((r) => r.effects),
        { timingTracks: props.body.timingTracks, model: entry.model },
      ),
      strands: new Map(
        strandSpecs(entry.geometry).map((spec) => [
          spec.name,
          toRenderableEffects(
            props.body.rows
              .filter((r) => r.elementType === "strand" && r.elementId === entry.model.id && r.subName === spec.name)
              .flatMap((r) => r.effects),
            { timingTracks: props.body.timingTracks },
          ),
        ]),
      ),
      // A sub-model row gets the timing tracks but not the parent's state definitions: a state's
      // node ranges are numbered against the model they were defined on, so applying them to a
      // sub-model's own numbering would light the wrong nodes.
      subModels: (entry.model.sub_models ?? []).map((spec) => ({
        spec,
        effects: toRenderableEffects(
          props.body.rows
            .filter((r) => r.elementType === "submodel" && r.elementId === entry.model.id && r.subName === spec.name)
            .flatMap((r) => r.effects),
          { timingTracks: props.body.timingTracks },
        ),
      })),
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

// Two watchers, not one. They used to share a `deep: true` watch, which meant every playhead
// change re-traversed the whole sequence body to decide whether it had changed too - affordable
// four times a second, not sixty, and the playhead is the one that moves every frame.
watch(() => props.playheadMs, updateColors);
watch(() => props.body, updateColors, { deep: true });
// `audio` arrives after the track is analysed, which is a repaint even at a stationary
// playhead - without it a VU Meter sits dark until the next scrub. Watched by identity, not
// deeply: the series is thousands of frames, and traversing it on every playhead tick would
// cost more than the render it triggers.
watch(() => props.audio, updateColors);
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
