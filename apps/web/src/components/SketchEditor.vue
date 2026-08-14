<script setup lang="ts">
import { computed, ref } from "vue";
import { parseSketchPaths, sketchToDefinition, type SketchPoint } from "@webxlights/engine";

// The tracing surface for the Sketch effect — xLights puts this in its Effect Assist panel.
//
// Click to drop a point, and the line follows. "Finish stroke" starts a new path, which is what
// gives the next palette colour its own line. The canvas is square and in 0..1 coordinates, so a
// sketch traced here renders on any prop it is later put on, whatever shape that prop is.
//
// The background-image tracing aid isn't here. The manual is explicit that "the image is not
// rendered into the effect output — it is only there to help you trace", so its absence changes
// nothing about what a sketch renders.

const props = defineProps<{ sketch: string }>();
const emit = defineEmits<{ update: [sketch: string] }>();

const SIZE = 160; // px; the coordinates it produces are 0..1 regardless

const paths = computed<SketchPoint[][]>(() => parseSketchPaths(props.sketch));
// Which path new points land on. A fresh stroke is only started when asked for, so a normal trace
// is one continuous line rather than a scatter of one-point paths.
const startNewPath = ref(false);

function commit(next: SketchPoint[][]): void {
  emit("update", sketchToDefinition(next));
}

function onClick(e: MouseEvent): void {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const point: SketchPoint = {
    x: clamp01((e.clientX - box.left) / box.width),
    // Buffer coordinates are y-up and the screen is y-down, so the click has to be flipped or
    // every sketch would render upside down against the canvas it was drawn on.
    y: clamp01(1 - (e.clientY - box.top) / box.height),
  };

  const next = paths.value.map((p) => [...p]);
  if (startNewPath.value || next.length === 0) {
    next.push([point]);
    startNewPath.value = false;
  } else {
    next[next.length - 1]!.push(point);
  }
  commit(next);
}

function finishStroke(): void {
  startNewPath.value = true;
}
function undoPoint(): void {
  const next = paths.value.map((p) => [...p]);
  const last = next[next.length - 1];
  if (!last) return;
  last.pop();
  if (last.length === 0) next.pop();
  commit(next);
}
function clearAll(): void {
  commit([]);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Screen-space polylines for the preview. Flipped back to y-down for drawing.
const polylines = computed(() =>
  paths.value.map((path) => path.map((p) => `${p.x * SIZE},${(1 - p.y) * SIZE}`).join(" ")),
);
const pointCount = computed(() => paths.value.reduce((sum, p) => sum + p.length, 0));
// Matches the engine's own rule: each separate path takes the next palette colour.
const STROKE_COLORS = ["#ffc878", "#50a0ff", "#9ee493", "#ff8fb1", "#c9a0ff", "#ffe066"];
</script>

<template>
  <div class="sketch-editor">
    <svg
      :width="SIZE"
      :height="SIZE"
      :viewBox="`0 0 ${SIZE} ${SIZE}`"
      class="canvas"
      @click="onClick"
    >
      <rect :width="SIZE" :height="SIZE" class="ground" />
      <polyline
        v-for="(points, i) in polylines"
        :key="i"
        :points="points"
        :stroke="STROKE_COLORS[i % STROKE_COLORS.length]"
        fill="none"
        stroke-width="2"
      />
      <template v-for="(path, i) in paths" :key="`pts-${i}`">
        <circle
          v-for="(p, j) in path"
          :key="j"
          :cx="p.x * SIZE"
          :cy="(1 - p.y) * SIZE"
          r="2.5"
          :fill="STROKE_COLORS[i % STROKE_COLORS.length]"
        />
      </template>
    </svg>

    <div class="actions">
      <button :disabled="pointCount === 0" @click="finishStroke">Finish stroke</button>
      <button :disabled="pointCount === 0" @click="undoPoint">Undo point</button>
      <button :disabled="pointCount === 0" @click="clearAll">Clear</button>
    </div>
    <p class="hint">
      Click to trace. Each stroke uses the next palette colour. Coordinates are relative, so the
      same sketch renders on any prop.
    </p>
  </div>
</template>

<style scoped>
.sketch-editor {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.canvas {
  cursor: crosshair;
  border: 1px solid #444;
  border-radius: 4px;
  align-self: center;
}
.ground {
  fill: #14141a;
}
.actions {
  display: flex;
  gap: 0.3rem;
}
.actions button {
  font-size: 0.65rem;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
}
.hint {
  margin: 0;
  color: #666;
  font-size: 0.65rem;
}
</style>
