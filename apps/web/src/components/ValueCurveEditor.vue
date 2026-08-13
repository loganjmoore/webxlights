<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  PERIODIC_VALUE_CURVE_TYPES,
  VALUE_CURVE_TYPES,
  isValueCurve,
  sampleValueCurve,
  type ValueCurve,
  type ValueCurvePoint,
  type ValueCurveType,
} from "@webxlights/engine";
import type { EffectParamValue } from "../lib/api";

const props = defineProps<{
  modelValue: EffectParamValue;
  label: string;
  min: number;
  max: number;
}>();
const emit = defineEmits<{ "update:modelValue": [value: EffectParamValue] }>();

const CANVAS_W = 208;
const CANVAS_H = 84;
const canvasRef = ref<HTMLCanvasElement | null>(null);
const draggingPoint = ref<number | null>(null);

const curve = computed<ValueCurve | null>(() => (isValueCurve(props.modelValue) ? props.modelValue : null));
const isPeriodic = computed(() => (curve.value ? PERIODIC_VALUE_CURVE_TYPES.has(curve.value.type) : false));
const isCustom = computed(() => curve.value?.type === "Custom");

function patch(changes: Partial<ValueCurve>): void {
  if (!curve.value) return;
  emit("update:modelValue", { ...curve.value, ...changes });
}

// Turning a curve on seeds it from the param's current flat value, so enabling one never
// jumps the effect to an unrelated range.
function enableCurve(): void {
  const current = typeof props.modelValue === "number" ? props.modelValue : props.max;
  emit("update:modelValue", { type: "Ramp", min: props.min, max: current, cycles: 1, phase01: 0 });
}

// Turning it off collapses back to a single number - the curve's end value, which is what the
// effect was showing at the end of its last pass.
function disableCurve(): void {
  emit("update:modelValue", curve.value ? curve.value.max : props.max);
}

function setType(type: ValueCurveType): void {
  if (type === "Custom" && (!curve.value?.points || curve.value.points.length === 0)) {
    patch({ type, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    return;
  }
  patch({ type });
}

const PRESETS: Array<{ name: string; curve: Omit<ValueCurve, "min" | "max"> }> = [
  { name: "Fade in", curve: { type: "Ramp" } },
  { name: "Fade out", curve: { type: "Ramp", reverse: true } },
  { name: "Pulse", curve: { type: "Abs Sine", cycles: 4 } },
  { name: "Bounce", curve: { type: "Ramp Up/Down" } },
  { name: "Blink", curve: { type: "Square", cycles: 8 } },
  { name: "Swell", curve: { type: "Sine", cycles: 2 } },
];

function applyPreset(preset: (typeof PRESETS)[number]): void {
  if (!curve.value) return;
  emit("update:modelValue", { min: curve.value.min, max: curve.value.max, ...preset.curve });
}

// ---- Custom point editing -------------------------------------------------------------
// Points live in curve space (x, y both 0..1); the canvas maps them to pixels with y flipped.

function toCanvas(p: ValueCurvePoint): { cx: number; cy: number } {
  return { cx: p.x * (CANVAS_W - 1), cy: (1 - p.y) * (CANVAS_H - 1) };
}

function fromEvent(e: PointerEvent): ValueCurvePoint {
  const rect = canvasRef.value!.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1 - (e.clientY - rect.top) / rect.height;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

function nearestPointIndex(at: ValueCurvePoint): number | null {
  const points = curve.value?.points ?? [];
  let best: number | null = null;
  let bestDistance = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot((p.x - at.x) * CANVAS_W, (p.y - at.y) * CANVAS_H);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return bestDistance <= 10 ? best : null;
}

function onPointerDown(e: PointerEvent): void {
  if (!isCustom.value || !curve.value) return;
  const at = fromEvent(e);
  const hit = nearestPointIndex(at);

  if (e.shiftKey) {
    // shift-click removes a point, but never the last two (a curve needs a shape)
    if (hit !== null && (curve.value.points?.length ?? 0) > 2) {
      patch({ points: curve.value.points!.filter((_, i) => i !== hit) });
    }
    return;
  }

  if (hit === null) {
    const points = [...(curve.value.points ?? []), at].sort((a, b) => a.x - b.x);
    patch({ points });
    draggingPoint.value = points.indexOf(at);
  } else {
    draggingPoint.value = hit;
  }
  canvasRef.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (draggingPoint.value === null || !curve.value?.points) return;
  const at = fromEvent(e);
  const points = curve.value.points.map((p, i) => (i === draggingPoint.value ? at : p));
  patch({ points });
}

function onPointerUp(e: PointerEvent): void {
  if (draggingPoint.value !== null && curve.value?.points) {
    // keep the list sorted once the drag ends rather than re-sorting mid-drag (which would
    // renumber the point under the cursor and make it jump to a neighbour)
    patch({ points: [...curve.value.points].sort((a, b) => a.x - b.x) });
  }
  draggingPoint.value = null;
  canvasRef.value?.releasePointerCapture(e.pointerId);
}

// ---- Drawing --------------------------------------------------------------------------

function draw(): void {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !curve.value) return;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#141418";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.strokeStyle = "#2a2a30";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * CANVAS_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }

  const samples = sampleValueCurve(curve.value, CANVAS_W);
  ctx.strokeStyle = "#e8c468";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const y = (1 - s) * (CANVAS_H - 1);
    if (i === 0) ctx.moveTo(i, y);
    else ctx.lineTo(i, y);
  });
  ctx.stroke();

  if (isCustom.value) {
    ctx.fillStyle = "#fff";
    for (const p of curve.value.points ?? []) {
      const { cx, cy } = toCanvas(p);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

watch(() => props.modelValue, () => void nextTick(draw), { deep: true, immediate: true });
watch(canvasRef, () => void nextTick(draw));
onBeforeUnmount(() => {
  draggingPoint.value = null;
});
</script>

<template>
  <div class="vc-editor">
    <button v-if="!curve" class="vc-toggle" @click="enableCurve">VC</button>
    <template v-else>
      <div class="vc-head">
        <span class="vc-title">{{ label }} curve</span>
        <button class="vc-toggle on" @click="disableCurve" title="Back to a flat value">VC</button>
      </div>

      <select :value="curve.type" @change="setType(($event.target as HTMLSelectElement).value as ValueCurveType)">
        <option v-for="t in VALUE_CURVE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>

      <canvas
        ref="canvasRef"
        :width="CANVAS_W"
        :height="CANVAS_H"
        :class="{ editable: isCustom }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      ></canvas>
      <p v-if="isCustom" class="vc-hint">Click to add or drag a point &middot; shift-click to remove</p>

      <label class="vc-field">
        <span>Min {{ curve.min }}</span>
        <input
          type="range"
          :min="min"
          :max="max"
          :value="curve.min"
          @input="patch({ min: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <label class="vc-field">
        <span>Max {{ curve.max }}</span>
        <input
          type="range"
          :min="min"
          :max="max"
          :value="curve.max"
          @input="patch({ max: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>

      <template v-if="isPeriodic">
        <label class="vc-field">
          <span>Cycles {{ curve.cycles ?? 1 }}</span>
          <input
            type="range"
            min="1"
            max="20"
            :value="curve.cycles ?? 1"
            @input="patch({ cycles: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="vc-field">
          <span>Phase {{ Math.round((curve.phase01 ?? 0) * 100) }}%</span>
          <input
            type="range"
            min="0"
            max="100"
            :value="Math.round((curve.phase01 ?? 0) * 100)"
            @input="patch({ phase01: Number(($event.target as HTMLInputElement).value) / 100 })"
          />
        </label>
      </template>

      <label class="vc-check">
        <input type="checkbox" :checked="curve.reverse ?? false" @change="patch({ reverse: ($event.target as HTMLInputElement).checked })" />
        Reverse
      </label>

      <div class="vc-presets">
        <button v-for="p in PRESETS" :key="p.name" @click="applyPreset(p)">{{ p.name }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vc-editor {
  display: contents;
}
.vc-toggle {
  color: #e8c468;
  background: transparent;
  border: 1px solid #e8c468;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 0.6rem;
  cursor: pointer;
  /* `display: contents` puts this straight into the props panel's param grid, so the off-state
     button needs its own row rather than landing in the slider's value column. The on-state
     one lives inside .vc-head, which is a flex row, so it ignores this. */
  grid-column: 1 / -1;
  justify-self: start;
}
.vc-toggle.on {
  background: #e8c468;
  color: #111;
}
.vc-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.35rem;
}
.vc-title {
  color: #e8c468;
  font-size: 0.7rem;
}
.vc-editor select,
.vc-editor canvas,
.vc-field,
.vc-check,
.vc-presets,
.vc-hint {
  grid-column: 1 / -1;
}
.vc-editor canvas {
  width: 100%;
  height: auto;
  border: 1px solid #2a2a30;
  border-radius: 3px;
  display: block;
}
.vc-editor canvas.editable {
  cursor: crosshair;
}
.vc-hint {
  margin: 0.15rem 0 0;
  color: #666;
  font-size: 0.65rem;
}
.vc-field {
  display: grid;
  gap: 0.1rem;
  margin-top: 0.3rem;
}
.vc-field span {
  color: #888;
  font-size: 0.7rem;
}
.vc-check {
  color: #888;
  font-size: 0.7rem;
  margin-top: 0.3rem;
}
.vc-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0.4rem 0 0.2rem;
}
.vc-presets button {
  font-size: 0.65rem;
  padding: 0.1rem 0.3rem;
}
</style>
