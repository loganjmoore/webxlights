<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AUDIO_REACTIVE_EFFECTS,
  EFFECT_SCHEMAS,
  PATTERNED_TRANSITION_TYPES,
  TRANSITION_TYPES,
  isValueCurve,
  type EffectParamSpec,
  type TransitionSpec,
  type TransitionType,
} from "@webxlights/engine";
import type { EffectParamValue, SequenceEffect } from "../lib/api";
import { decodeImageForEffect, MAX_PICTURE_EDGE } from "../lib/pictureImport";
import ValueCurveEditor from "./ValueCurveEditor.vue";

const props = defineProps<{ effect: SequenceEffect | null; hasAudio: boolean }>();
const emit = defineEmits<{
  update: [params: Record<string, EffectParamValue>];
  updateTransition: [transition: TransitionSpec];
}>();

const schema = computed(() => (props.effect ? EFFECT_SCHEMAS[props.effect.name] : undefined));
const needsAudio = computed(() => !!props.effect && AUDIO_REACTIVE_EFFECTS.has(props.effect.name));
const transition = computed<TransitionSpec>(() => props.effect?.transition ?? {});
const showTransitions = ref(false);
const imageError = ref("");

function valueOf(p: EffectParamSpec): EffectParamValue {
  return props.effect?.params[p.key] ?? (p.default as EffectParamValue);
}

// A curved param has no single number to show in the slider, so the slider is replaced by the
// curve editor; this reports the curve's range instead of "[object Object]".
function displayValue(p: EffectParamSpec): string {
  const value = valueOf(p);
  if (isValueCurve(value)) return `${value.min}–${value.max}`;
  if (typeof value === "object") return "";
  return String(value);
}

function isCurved(p: EffectParamSpec): boolean {
  return isValueCurve(valueOf(p));
}

function setParam(key: string, value: EffectParamValue): void {
  if (!props.effect) return;
  emit("update", { ...props.effect.params, [key]: value });
}

function setTransition(changes: Partial<TransitionSpec>): void {
  emit("updateTransition", { ...transition.value, ...changes });
}

async function onImagePicked(key: string, e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  imageError.value = "";
  try {
    setParam(key, await decodeImageForEffect(file));
  } catch (err) {
    imageError.value = err instanceof Error ? err.message : "Couldn't read that image";
  }
}

function imageSummary(value: EffectParamValue): string {
  if (typeof value === "object" && value !== null && "width" in value) {
    return `${(value as { width: number }).width}×${(value as { height: number }).height}`;
  }
  return "No image chosen";
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

      <p v-if="needsAudio && !hasAudio" class="warn">
        This effect reacts to the audio track — load one above and it will start responding.
      </p>

      <div v-for="p in schema.params" :key="p.key" class="param">
        <!-- a <div>, not a <label>: a label forwards clicks to the first form control it
             contains, which would hijack every click on the curve editor's point canvas -->
        <div class="param-label">
          {{ p.label }}
          <ValueCurveEditor
            v-if="p.valueCurve"
            :model-value="valueOf(p)"
            :label="p.label"
            :min="p.min ?? 0"
            :max="p.max ?? 100"
            @update:model-value="setParam(p.key, $event)"
          />
        </div>

        <template v-if="!isCurved(p)">
          <input
            v-if="p.type === 'intSlider'"
            type="range"
            :min="p.min"
            :max="p.max"
            :value="valueOf(p)"
            @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
          />
          <input
            v-else-if="p.type === 'floatSlider'"
            type="range"
            :min="p.min"
            :max="p.max"
            :step="p.step ?? 0.1"
            :value="valueOf(p)"
            @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
          />
          <input
            v-else-if="p.type === 'checkbox'"
            type="checkbox"
            :checked="Boolean(valueOf(p))"
            @change="setParam(p.key, ($event.target as HTMLInputElement).checked)"
          />
          <input
            v-else-if="p.type === 'text'"
            class="text-input"
            type="text"
            :value="valueOf(p)"
            @input="setParam(p.key, ($event.target as HTMLInputElement).value)"
          />
          <template v-else-if="p.type === 'image'">
            <input type="file" accept="image/*" class="file-input" @change="onImagePicked(p.key, $event)" />
            <span class="value">{{ imageSummary(valueOf(p)) }}</span>
          </template>
          <select
            v-else-if="p.type === 'choice'"
            :value="valueOf(p)"
            @change="setParam(p.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in p.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </template>
        <span v-if="p.type !== 'image'" class="value">{{ displayValue(p) }}</span>
      </div>

      <p v-if="imageError" class="warn">{{ imageError }}</p>
      <p v-if="schema.params.some((p) => p.type === 'image')" class="note">
        Images are downscaled to {{ MAX_PICTURE_EDGE }}px on the long edge — they're stored in the sequence itself, and
        pixel matrices are smaller than that anyway.
      </p>

      <button class="section-toggle" @click="showTransitions = !showTransitions">
        {{ showTransitions ? "▾" : "▸" }} Transitions
      </button>

      <div v-if="showTransitions" class="transitions">
        <div v-for="side in (['in', 'out'] as const)" :key="side" class="transition-side">
          <h4>{{ side === "in" ? "In" : "Out" }}</h4>
          <label>
            Duration
            <input
              type="range"
              min="0"
              max="4000"
              step="50"
              :value="side === 'in' ? (transition.inDurationMs ?? 0) : (transition.outDurationMs ?? 0)"
              @input="
                setTransition(
                  side === 'in'
                    ? { inDurationMs: Number(($event.target as HTMLInputElement).value) }
                    : { outDurationMs: Number(($event.target as HTMLInputElement).value) },
                )
              "
            />
            <span class="value">{{ (side === "in" ? (transition.inDurationMs ?? 0) : (transition.outDurationMs ?? 0)) }}ms</span>
          </label>

          <select
            :value="(side === 'in' ? transition.inType : transition.outType) ?? 'Fade'"
            @change="
              setTransition(
                side === 'in'
                  ? { inType: ($event.target as HTMLSelectElement).value as TransitionType }
                  : { outType: ($event.target as HTMLSelectElement).value as TransitionType },
              )
            "
          >
            <option v-for="t in TRANSITION_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>

          <label
            v-if="PATTERNED_TRANSITION_TYPES.has(((side === 'in' ? transition.inType : transition.outType) ?? 'Fade') as TransitionType)"
          >
            Pattern
            <input
              type="range"
              min="0"
              max="100"
              :value="side === 'in' ? (transition.inAdjust ?? 50) : (transition.outAdjust ?? 50)"
              @input="
                setTransition(
                  side === 'in'
                    ? { inAdjust: Number(($event.target as HTMLInputElement).value) }
                    : { outAdjust: Number(($event.target as HTMLInputElement).value) },
                )
              "
            />
          </label>

          <label class="inline">
            <input
              type="checkbox"
              :checked="(side === 'in' ? transition.inReverse : transition.outReverse) ?? false"
              @change="
                setTransition(
                  side === 'in'
                    ? { inReverse: ($event.target as HTMLInputElement).checked }
                    : { outReverse: ($event.target as HTMLInputElement).checked },
                )
              "
            />
            Reverse
          </label>
        </div>
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
.warn {
  color: #e8c468;
  font-size: 0.75rem;
  margin: 0 0 0.5rem;
}
.note {
  color: #666;
  font-size: 0.7rem;
  margin: 0 0 0.5rem;
}
.param {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.param-label {
  grid-column: 1 / -1;
  color: #aaa;
  font-size: 0.75rem;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.25rem;
}
.value {
  text-align: right;
  color: #888;
  font-size: 0.75rem;
  min-width: 2.5rem;
}
.text-input,
.file-input {
  grid-column: 1 / -1;
  width: 100%;
  font-size: 0.75rem;
}
.section-toggle {
  width: 100%;
  text-align: left;
  margin-top: 0.5rem;
  font-size: 0.75rem;
}
.transitions {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.5rem;
}
.transition-side h4 {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  color: #aaa;
}
.transition-side label {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.25rem;
  color: #888;
  font-size: 0.7rem;
}
.transition-side label.inline {
  grid-template-columns: auto 1fr;
  justify-content: start;
}
.transition-side select {
  width: 100%;
  margin: 0.2rem 0;
  font-size: 0.75rem;
}
</style>
