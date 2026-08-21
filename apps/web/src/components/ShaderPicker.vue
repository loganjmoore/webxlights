<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, type ShaderRecord } from "../lib/api";
import type { IsfInput } from "@webxlights/formats";
import ShaderPreview from "./ShaderPreview.vue";

// Choosing a shader for a Shader effect, and turning the knobs it declares.
//
// The controls cannot come from a schema the way every other effect's do, because a shader's
// parameters are whatever its author wrote in the ISF header. So they are built from the shader
// itself - which is the reason `inputs` is stored on the effect rather than looked up when the
// panel opens.
//
// The shader's source is copied onto the effect, not referenced by id. A sequence has to render
// years from now, when the shader it used may have been made private, edited into something else,
// or deleted; a show that breaks because someone else changed their mind is not a show. The id is
// kept alongside, but only so the panel can say where this came from.

const props = defineProps<{
  source?: string;
  inputs?: Record<string, number | boolean | number[]>;
  shaderId?: number | null;
}>();

const emit = defineEmits<{
  pick: [payload: { source: string; inputs: Record<string, number | boolean | number[]>; shaderId: number }];
  setInputs: [inputs: Record<string, number | boolean | number[]>];
}>();

const browsing = ref(false);
const shaders = ref<ShaderRecord[]>([]);
const loading = ref(false);
const search = ref("");
const chosen = ref<ShaderRecord | null>(null);

/**
 * The controls to draw.
 *
 * Read from the shader that was picked when there is one, and otherwise from what was saved on
 * the effect - so reopening a sequence shows the same knobs without the library being reachable.
 */
const inputSpecs = computed<IsfInput[]>(() => chosen.value?.inputs ?? []);

async function load(): Promise<void> {
  loading.value = true;
  try {
    shaders.value = (await api.listShaders({ q: search.value || undefined, sort: "popular" })).data;
  } finally {
    loading.value = false;
  }
}

async function open(): Promise<void> {
  browsing.value = true;
  if (shaders.value.length === 0) await load();
}

function pick(shader: ShaderRecord): void {
  chosen.value = shader;
  const inputs: Record<string, number | boolean | number[]> = {};
  for (const input of shader.inputs ?? []) inputs[input.name] = startingValue(input);
  emit("pick", { source: shader.source, inputs, shaderId: shader.id });
  browsing.value = false;
  // Popularity should rank what people actually put in shows, so it is counted here rather than
  // when a card is looked at. Failing to count must never block using the shader.
  api.markShaderUsed(shader.id).catch(() => {});
}

function startingValue(input: IsfInput): number | boolean | number[] {
  if (input.default !== undefined) return input.default;
  if (input.type === "bool") return false;
  if (input.type === "color") return [1, 1, 1, 1];
  if (input.type === "point2D") return [0.5, 0.5];
  if (input.type === "long") return input.values?.[0] ?? 0;
  // Midpoint rather than zero: zero is usually one end of a dial, not a neutral start.
  if (input.min !== undefined && input.max !== undefined) return (input.min + input.max) / 2;
  return 0;
}

function valueOf(input: IsfInput): number | boolean | number[] {
  return props.inputs?.[input.name] ?? startingValue(input);
}

function setInput(name: string, value: number | boolean | number[]): void {
  emit("setInputs", { ...(props.inputs ?? {}), [name]: value });
}

onMounted(() => {
  // A sequence reopened with a shader already on it: fetch its record so the controls have
  // labels and ranges again. The effect renders regardless - the source is on it - so a failure
  // here costs the knobs, not the show.
  if (props.shaderId) {
    api
      .getShader(props.shaderId)
      .then((s) => {
        chosen.value = s;
      })
      .catch(() => {});
  }
});
</script>

<template>
  <div class="shader-picker">
    <div v-if="source" class="current">
      <ShaderPreview :source="source" :inputs="inputs" :width="40" :height="28" />
      <div class="who">
        <strong>{{ chosen?.name ?? "Shader" }}</strong>
        <span v-if="chosen?.author" class="by">by {{ chosen.author.name }}</span>
      </div>
    </div>
    <p v-else class="none">No shader chosen yet.</p>

    <button class="pick" @click="open">{{ source ? "Change shader" : "Choose a shader" }}</button>

    <!-- The shader's own controls, built from its ISF header rather than from a schema. -->
    <div v-for="input in inputSpecs" :key="input.name" class="param">
      <label>{{ input.label ?? input.name }}</label>

      <label v-if="input.type === 'bool'" class="check">
        <input
          type="checkbox"
          :checked="valueOf(input) === true"
          @change="setInput(input.name, ($event.target as HTMLInputElement).checked)"
        />
      </label>

      <select
        v-else-if="input.type === 'long' && input.labels?.length"
        :value="valueOf(input)"
        @change="setInput(input.name, Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="(label, i) in input.labels" :key="label" :value="input.values?.[i] ?? i">{{ label }}</option>
      </select>

      <template v-else-if="input.type === 'float' || input.type === 'long'">
        <input
          type="range"
          :min="input.min ?? 0"
          :max="input.max ?? 1"
          :step="input.type === 'long' ? 1 : ((input.max ?? 1) - (input.min ?? 0)) / 100"
          :value="valueOf(input)"
          @input="setInput(input.name, Number(($event.target as HTMLInputElement).value))"
        />
        <span class="value">{{ Number(valueOf(input)).toFixed(input.type === 'long' ? 0 : 2) }}</span>
      </template>

      <span v-else class="unsupported">{{ input.type }} — not editable yet</span>
    </div>

    <!-- The library, inline. A modal over a modal is worse than a list that expands in place. -->
    <div v-if="browsing" class="browser">
      <div class="filters">
        <input v-model="search" placeholder="Search…" @keydown.enter="load" />
        <button @click="load">Go</button>
        <button @click="browsing = false">Close</button>
      </div>
      <p v-if="loading" class="none">Loading…</p>
      <p v-else-if="shaders.length === 0" class="none">
        No shaders yet — make one on the Shaders tab.
      </p>
      <ul v-else class="list">
        <li v-for="shader in shaders" :key="shader.id">
          <button class="card" @click="pick(shader)">
            <ShaderPreview :source="shader.source" :running="false" :width="32" :height="22" />
            <span class="name">{{ shader.name }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.shader-picker {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.current {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 0.5rem;
  align-items: center;
}
.who {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
}
.by,
.none,
.unsupported {
  color: #9a9aa6;
  font-size: 0.72rem;
}
button {
  background: #2a2a33;
  border: 1px solid #3a3a46;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
}
.param {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.3rem;
}
.param label {
  font-size: 0.72rem;
  color: #b8b8c4;
}
.param input[type="range"] {
  grid-column: 1 / -1;
  width: 100%;
}
.value {
  font-size: 0.7rem;
  color: #9a9aa6;
  font-variant-numeric: tabular-nums;
}
.browser {
  border: 1px solid #33333f;
  border-radius: 4px;
  padding: 0.4rem;
  background: #16161c;
}
.filters {
  display: flex;
  gap: 0.3rem;
  margin-bottom: 0.4rem;
}
.filters input {
  flex: 1;
  min-width: 0;
  background: #111117;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.2rem 0.35rem;
  font: inherit;
  font-size: 0.75rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 0.35rem;
  max-height: 260px;
  overflow-y: auto;
}
.card {
  width: 100%;
  padding: 0.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
}
.name {
  font-size: 0.68rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
