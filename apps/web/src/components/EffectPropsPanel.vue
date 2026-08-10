<script setup lang="ts">
import { computed } from "vue";
import { EFFECT_SCHEMAS } from "@webxlights/engine";
import type { SequenceEffect } from "../lib/api";

const props = defineProps<{ effect: SequenceEffect | null }>();
const emit = defineEmits<{ update: [params: Record<string, number | boolean | string>] }>();

const schema = computed(() => (props.effect ? EFFECT_SCHEMAS[props.effect.name] : undefined));

function setParam(key: string, value: number | boolean | string): void {
  if (!props.effect) return;
  emit("update", { ...props.effect.params, [key]: value });
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
</style>
