<script setup lang="ts">
import { computed } from "vue";
import { DEFAULT_PALETTE_HEX, EFFECT_SCHEMAS, type BlendMode } from "@webxlights/engine";
import type { SequenceEffect } from "../lib/api";

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
  update: [params: Record<string, number | boolean | string>];
  updatePalette: [palette: string[]];
  updateBlend: [patch: { blendMode?: BlendMode; mix?: number }];
  updateTransition: [transition: { inDurationMs?: number; outDurationMs?: number }];
}>();

const schema = computed(() => (props.effect ? EFFECT_SCHEMAS[props.effect.name] : undefined));
const palette = computed(() => props.effect?.palette ?? DEFAULT_PALETTE_HEX);

function setParam(key: string, value: number | boolean | string): void {
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
function setTransition(field: "inDurationMs" | "outDurationMs", ms: string): void {
  if (!props.effect) return;
  const value = Number(ms);
  if (Number.isNaN(value)) return;
  emit("updateTransition", { ...props.effect.transition, [field]: value });
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
        <label class="blend-row">
          Fade In (ms)
          <input
            type="number"
            min="0"
            :value="effect.transition?.inDurationMs ?? 0"
            @change="setTransition('inDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="blend-row">
          Fade Out (ms)
          <input
            type="number"
            min="0"
            :value="effect.transition?.outDurationMs ?? 0"
            @change="setTransition('outDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <div v-for="p in schema.params" :key="p.key" class="param">
        <label>
          {{ p.label }}
          <span v-if="p.valueCurve" class="vc-badge" title="Value curve (stubbed until M6)">VC</span>
        </label>
        <input
          v-if="p.type === 'intSlider'"
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
        <span class="value">{{ effect.params[p.key] ?? p.default }}</span>
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
.vc-badge {
  color: #e8c468;
  border: 1px solid #e8c468;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 0.6rem;
  margin-left: 0.3rem;
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
