<script setup lang="ts">
import { computed } from "vue";
import {
  DEFAULT_PALETTE_HEX,
  EFFECT_SCHEMAS,
  PATTERNED_TRANSITION_TYPES,
  TRANSITION_TYPES,
  isValueCurve,
  type BlendMode,
  type EffectParamSpec,
  type TransitionSpec,
  type TransitionType,
} from "@webxlights/engine";
import type { EffectParamValue, SequenceEffect } from "../lib/api";
import ValueCurveEditor from "./ValueCurveEditor.vue";

const MAX_COLORS = 6; // matches real xLights' Color tab swatch count

// The 10 of 24 real xLights "Layer Method" modes this engine implements (see blend.ts).
const BLEND_MODES: BlendMode[] = [
  "Normal",
  "Effect 1",
  "Effect 2",
  "Average",
  "Additive",
  "Subtractive",
  "Max",
  "Min",
  "1 reveals 2",
  "2 reveals 1",
];

const props = defineProps<{ effect: SequenceEffect | null }>();
const emit = defineEmits<{
  update: [params: Record<string, EffectParamValue>];
  updatePalette: [palette: string[]];
  updateBlend: [patch: { blendMode?: BlendMode; mix?: number }];
  updateTransition: [transition: TransitionSpec];
}>();

const schema = computed(() => (props.effect ? EFFECT_SCHEMAS[props.effect.name] : undefined));
const palette = computed(() => props.effect?.palette ?? DEFAULT_PALETTE_HEX);

function setParam(key: string, value: EffectParamValue): void {
  if (!props.effect) return;
  emit("update", { ...props.effect.params, [key]: value });
}

function setColor(index: number, hex: string): void {
  const next = [...palette.value];
  next[index] = hex;
  emit("updatePalette", next);
}
function addColor(): void {
  emit("updatePalette", [...palette.value, "#ffffff"]);
}
function removeColor(index: number): void {
  if (palette.value.length <= 1) return;
  emit("updatePalette", palette.value.filter((_, i) => i !== index));
}

function setBlendMode(mode: string): void {
  emit("updateBlend", { blendMode: mode as BlendMode });
}
function setMix(pct: string): void {
  emit("updateBlend", { mix: Number(pct) / 100 });
}
// The whole TransitionSpec is emitted every time: SequencerPage replaces `transition` wholesale
// (like every other effect patch), so sending only the changed key would drop the rest.
function patchTransition(changes: Partial<TransitionSpec>): void {
  if (!props.effect) return;
  emit("updateTransition", { ...props.effect.transition, ...changes });
}
function setTransitionMs(field: "inDurationMs" | "outDurationMs", ms: string): void {
  const value = Number(ms);
  if (Number.isNaN(value)) return;
  patchTransition({ [field]: Math.max(0, value) });
}

const transition = computed<TransitionSpec>(() => props.effect?.transition ?? {});
// Blinds/Slide Bars/Checkerboard are the types whose "adjust" knob means anything (it sets the
// pattern's density); showing the slider for a Fade would be a control that does nothing.
const inPatterned = computed(() => PATTERNED_TRANSITION_TYPES.has(transition.value.inType ?? "Fade"));
const outPatterned = computed(() => PATTERNED_TRANSITION_TYPES.has(transition.value.outType ?? "Fade"));

// A value curve replaces the param's flat value, so the slider is hidden while one is on -
// leaving both visible would show a number that isn't what the effect is rendering.
function hasCurve(key: string): boolean {
  return isValueCurve(props.effect?.params[key]);
}
// Only the numeric sliders have a range for a curve to sweep between. A checkbox or a choice
// has nothing to interpolate, and the schema never marks those as curve-able anyway.
function curveable(p: EffectParamSpec): boolean {
  return Boolean(p.valueCurve) && (p.type === "intSlider" || p.type === "floatSlider");
}
</script>

<template>
  <div class="props-panel">
    <template v-if="!effect">
      <p class="empty">Select an effect to edit its parameters.</p>
    </template>
    <template v-else-if="!schema">
      <p class="empty">"{{ effect.name }}" has no parameter schema yet (render lands in a later milestone).</p>
    </template>
    <template v-else>
      <h3>{{ effect.name }}</h3>

      <div class="color-panel">
        <h4>Color</h4>
        <div class="swatches">
          <div v-for="(hex, i) in palette" :key="i" class="swatch">
            <input type="color" :value="hex" @input="setColor(i, ($event.target as HTMLInputElement).value)" />
            <button v-if="palette.length > 1" class="remove-swatch" title="Remove color" @click="removeColor(i)">×</button>
          </div>
          <button v-if="palette.length < MAX_COLORS" class="add-swatch" title="Add color" @click="addColor">+</button>
        </div>
      </div>

      <div class="blend-panel">
        <h4>Layer Blending</h4>
        <label class="blend-row">
          Blend Mode
          <select :value="effect.blendMode ?? 'Normal'" @change="setBlendMode(($event.target as HTMLSelectElement).value)">
            <option v-for="m in BLEND_MODES" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>
        <label class="blend-row">
          Mix
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="(effect.mix ?? 0) * 100"
              @input="setMix(($event.target as HTMLInputElement).value)"
            />
            <span class="value">{{ Math.round((effect.mix ?? 0) * 100) }}</span>
          </span>
        </label>
      </div>

      <div class="blend-panel">
        <h4>Transitions</h4>
        <label class="blend-row">
          In
          <select
            :value="transition.inType ?? 'Fade'"
            @change="patchTransition({ inType: ($event.target as HTMLSelectElement).value as TransitionType })"
          >
            <option v-for="t in TRANSITION_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="blend-row">
          In Duration (ms)
          <input
            type="number"
            min="0"
            :value="transition.inDurationMs ?? 0"
            @change="setTransitionMs('inDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="inPatterned" class="blend-row">
          In Adjust
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="transition.inAdjust ?? 50"
              @input="patchTransition({ inAdjust: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ transition.inAdjust ?? 50 }}</span>
          </span>
        </label>
        <label class="blend-row">
          In Reverse
          <input
            type="checkbox"
            :checked="transition.inReverse ?? false"
            @change="patchTransition({ inReverse: ($event.target as HTMLInputElement).checked })"
          />
        </label>

        <label class="blend-row">
          Out
          <select
            :value="transition.outType ?? 'Fade'"
            @change="patchTransition({ outType: ($event.target as HTMLSelectElement).value as TransitionType })"
          >
            <option v-for="t in TRANSITION_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="blend-row">
          Out Duration (ms)
          <input
            type="number"
            min="0"
            :value="transition.outDurationMs ?? 0"
            @change="setTransitionMs('outDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="outPatterned" class="blend-row">
          Out Adjust
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="transition.outAdjust ?? 50"
              @input="patchTransition({ outAdjust: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ transition.outAdjust ?? 50 }}</span>
          </span>
        </label>
        <label class="blend-row">
          Out Reverse
          <input
            type="checkbox"
            :checked="transition.outReverse ?? false"
            @change="patchTransition({ outReverse: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <p class="hint">A transition only shows with a duration above 0.</p>
      </div>

      <div v-for="p in schema.params" :key="p.key" class="param">
        <label>{{ p.label }}</label>
        <template v-if="hasCurve(p.key)">
          <!-- the curve is the value now, so the flat slider would be showing a stale number -->
        </template>
        <input
          v-else-if="p.type === 'intSlider'"
          type="range"
          :min="p.min"
          :max="p.max"
          :value="effect.params[p.key] ?? p.default"
          @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="p.type === 'floatSlider'"
          type="range"
          :min="p.min"
          :max="p.max"
          :step="p.step ?? 0.1"
          :value="effect.params[p.key] ?? p.default"
          @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="p.type === 'checkbox'"
          type="checkbox"
          :checked="Boolean(effect.params[p.key] ?? p.default)"
          @change="setParam(p.key, ($event.target as HTMLInputElement).checked)"
        />
        <select
          v-else-if="p.type === 'choice'"
          :value="effect.params[p.key] ?? p.default"
          @change="setParam(p.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in p.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <span v-if="!hasCurve(p.key)" class="value">{{ effect.params[p.key] ?? p.default }}</span>
        <ValueCurveEditor
          v-if="curveable(p)"
          :model-value="effect.params[p.key] ?? p.default"
          :label="p.label"
          :min="p.min ?? 0"
          :max="p.max ?? 100"
          @update:model-value="setParam(p.key, $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.props-panel {
  padding: 0.75rem;
  font-size: 0.85rem;
}
.props-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.empty {
  color: #666;
}
.param {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.param label {
  grid-column: 1 / -1;
  color: #aaa;
  font-size: 0.75rem;
}
.hint {
  margin: 0.2rem 0 0;
  color: #666;
  font-size: 0.65rem;
}
.value {
  text-align: right;
  color: #888;
  font-size: 0.75rem;
  min-width: 2.5rem;
}
.color-panel {
  margin-bottom: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid #333;
}
.color-panel h4 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: normal;
  color: #888;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.swatch {
  position: relative;
  width: 1.75rem;
  height: 1.75rem;
}
.swatch input[type="color"] {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  background: none;
}
.remove-swatch {
  position: absolute;
  top: -0.4rem;
  right: -0.4rem;
  width: 1rem;
  height: 1rem;
  line-height: 1;
  font-size: 0.65rem;
  color: #ddd;
  background: #1e1e26;
  border: 1px solid #444;
  border-radius: 50%;
  cursor: pointer;
}
.add-swatch {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 1rem;
  color: #888;
  background: #1e1e26;
  border: 1px dashed #444;
  border-radius: 4px;
  cursor: pointer;
}
.add-swatch:hover {
  color: #ddd;
  border-color: #666;
}
.blend-panel {
  margin-bottom: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid #333;
}
.blend-panel h4 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: normal;
  color: #888;
}
.blend-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.4rem;
  gap: 0.5rem;
}
.blend-row select,
.blend-row input[type="number"] {
  width: 7rem;
  font-size: 0.75rem;
}
.blend-inline {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.blend-inline input[type="range"] {
  width: 5rem;
}
.blend-inline .value {
  min-width: 1.5rem;
  text-align: right;
  color: #888;
}
</style>
