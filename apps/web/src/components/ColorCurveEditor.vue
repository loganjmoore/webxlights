<script setup lang="ts">
import { computed } from "vue";
import {
  COLOR_CURVE_DIRECTIONS,
  MAX_COLOR_CURVE_POINTS,
  colorCurveAt,
  type ColorCurve,
  type ColorCurveDirection,
} from "@webxlights/engine";

// The editor for one swatch that changes rather than holding still (engine/colorCurve.ts).
//
// xLights' own control is a strip with draggable markers. This is the same data behind a plainer
// surface: a list of markers, each a position and a colour, plus the mode/blend/direction that
// decide how they are read. The preview strip above them is the important part - a curve is very
// hard to reason about from four numbers and much easier to see.

const props = defineProps<{ curve: ColorCurve }>();
const emit = defineEmits<{ update: [curve: ColorCurve]; remove: [] }>();

function patch(changes: Partial<ColorCurve>): void {
  emit("update", { ...props.curve, ...changes });
}

const sorted = computed(() => [...props.curve.points].sort((a, b) => a.x - b.x));

function setPoint(index: number, changes: { x?: number; color?: string }): void {
  const points = props.curve.points.map((p, i) => (i === index ? { ...p, ...changes } : p));
  patch({ points });
}
function addPoint(): void {
  if (props.curve.points.length >= MAX_COLOR_CURVE_POINTS) return;
  // New markers land in the largest gap rather than at the end, so adding one to a two-marker
  // curve puts it in the middle where it is useful instead of on top of an existing one.
  const list = sorted.value;
  let bestGap = 0;
  let at = 0.5;
  for (let i = 0; i < list.length - 1; i++) {
    const gap = list[i + 1]!.x - list[i]!.x;
    if (gap > bestGap) {
      bestGap = gap;
      at = (list[i]!.x + list[i + 1]!.x) / 2;
    }
  }
  const color = rgbHex(colorCurveAt(props.curve, at));
  patch({ points: [...props.curve.points, { x: at, color }] });
}
function removePoint(index: number): void {
  // One marker is the floor: a curve with none has no colour at all, which would render white.
  if (props.curve.points.length <= 1) return;
  patch({ points: props.curve.points.filter((_, i) => i !== index) });
}

function rgbHex(c: { r: number; g: number; b: number }): string {
  const two = (v: number) => v.toString(16).padStart(2, "0");
  return `#${two(c.r)}${two(c.g)}${two(c.b)}`;
}

// The strip the markers add up to, sampled often enough to look continuous.
const gradientCss = computed(() => {
  const stops: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    stops.push(`${rgbHex(colorCurveAt(props.curve, t))} ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
});
</script>

<template>
  <div class="color-curve">
    <div class="preview" :style="{ background: gradientCss }" />

    <label class="row">
      Changes
      <select :value="curve.mode" @change="patch({ mode: ($event.target as HTMLSelectElement).value as ColorCurve['mode'] })">
        <option value="Time">Over the effect</option>
        <option value="Spatial">Across the model</option>
      </select>
    </label>

    <label class="row">
      Blend
      <select :value="curve.blend" @change="patch({ blend: ($event.target as HTMLSelectElement).value as ColorCurve['blend'] })">
        <option value="Gradient">Gradient</option>
        <option value="None">None (sharp)</option>
      </select>
    </label>

    <label v-if="curve.mode === 'Spatial'" class="row">
      Direction
      <select
        :value="curve.direction ?? 'Left to Right'"
        @change="patch({ direction: ($event.target as HTMLSelectElement).value as ColorCurveDirection })"
      >
        <option v-for="d in COLOR_CURVE_DIRECTIONS" :key="d" :value="d">{{ d }}</option>
      </select>
    </label>

    <div v-for="(point, i) in curve.points" :key="i" class="marker">
      <input type="color" :value="point.color" @input="setPoint(i, { color: ($event.target as HTMLInputElement).value })" />
      <input
        type="range"
        min="0"
        max="100"
        :value="Math.round(point.x * 100)"
        @input="setPoint(i, { x: Number(($event.target as HTMLInputElement).value) / 100 })"
      />
      <span class="at">{{ Math.round(point.x * 100) }}%</span>
      <button v-if="curve.points.length > 1" class="drop" title="Remove marker" @click="removePoint(i)">×</button>
    </div>

    <div class="actions">
      <button v-if="curve.points.length < MAX_COLOR_CURVE_POINTS" @click="addPoint">Add marker</button>
      <button class="plain" @click="emit('remove')">Back to a plain colour</button>
    </div>
  </div>
</template>

<style scoped>
.color-curve {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.4rem;
  margin-top: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.preview {
  height: 14px;
  border-radius: 3px;
  border: 1px solid #ccc;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: #555;
}
.marker {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.marker input[type="range"] {
  flex: 1;
}
.marker input[type="color"] {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid #ccc;
}
.at {
  font-size: 0.65rem;
  color: #888;
  width: 2.4rem;
  text-align: right;
}
.drop,
.actions button {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  cursor: pointer;
}
.actions {
  display: flex;
  gap: 0.3rem;
  justify-content: space-between;
}
.actions .plain {
  color: #666;
}
</style>
