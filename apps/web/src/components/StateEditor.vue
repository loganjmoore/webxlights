<script setup lang="ts">
import { computed } from "vue";
import {
  MAX_STATES_PER_DEFINITION,
  parseNodeRanges,
  sevenSegmentStateNames,
  type ModelGeometry,
  type StateSpec,
} from "@webxlights/engine";

// The in-app state editor (xLights: Layout tab, the model's State property).
//
// A state is a named set of this model's nodes, and the State effect turns them on by name from
// the words on a timing track. The manual's examples are what this is for: a reindeer whose eyes
// look left, right or wink, and a seven segment "tune to" sign whose every digit is a state.
//
// Two things are shown live because both fail silently otherwise: how many nodes a state actually
// resolves to, and whether any of its numbers are past the end of the model.

const props = defineProps<{ states: StateSpec[]; geometry: ModelGeometry | null }>();
const emit = defineEmits<{ update: [states: StateSpec[]] }>();

function patch(index: number, changes: Partial<StateSpec>): void {
  emit(
    "update",
    props.states.map((s, i) => (i === index ? { ...s, ...changes } : s)),
  );
}

function addDefinition(): void {
  const names = new Set(props.states.map((s) => s.name));
  let name = "State1";
  for (let n = 1; names.has(name); n++) name = `State${n + 1}`;
  emit("update", [...props.states, { name, entries: [{ name: "", nodes: "" }] }]);
}

/**
 * A whole seven-segment display's worth of states in one go.
 *
 * "These state names are predefined to work for a seven segment display. The nodes however can be
 * assigned to each State/Number as required." Typing 42 rows by hand before you can light a clock
 * is the kind of chore that stops the feature being used at all - the names are fixed, only the
 * node ranges are yours.
 */
function addSevenSegment(): void {
  const names = new Set(props.states.map((s) => s.name));
  let name = "Numbers";
  for (let n = 1; names.has(name); n++) name = `Numbers ${n}`;
  emit("update", [
    ...props.states,
    { name, entries: sevenSegmentStateNames(4).map((entry) => ({ name: entry, nodes: "" })) },
  ]);
}

function removeDefinition(index: number): void {
  emit("update", props.states.filter((_, i) => i !== index));
}

function patchEntry(index: number, entryIndex: number, changes: Partial<StateSpec["entries"][number]>): void {
  const entries = (props.states[index]?.entries ?? []).map((e, i) => (i === entryIndex ? { ...e, ...changes } : e));
  patch(index, { entries });
}

function addEntry(index: number): void {
  patch(index, { entries: [...(props.states[index]?.entries ?? []), { name: "", nodes: "" }] });
}

function removeEntry(index: number, entryIndex: number): void {
  patch(index, { entries: (props.states[index]?.entries ?? []).filter((_, i) => i !== entryIndex) });
}

function setForcedColor(index: number, entryIndex: number, value: string | null): void {
  // Null clears it back to "take the colour from the effect", which is the manual's default -
  // there is no colour that means "no colour", so it has to be removable.
  const entries = (props.states[index]?.entries ?? []).map((e, i) => {
    if (i !== entryIndex) return e;
    if (value === null) {
      const cleared = { ...e };
      delete cleared.color;
      return cleared;
    }
    return { ...e, color: value };
  });
  patch(index, { entries });
}

const nodeCount = computed(() => props.geometry?.nodes.length ?? 0);

// Per entry: how many nodes it turns on, and how many of them this model hasn't got.
const resolved = computed(() =>
  props.states.map((spec) =>
    spec.entries.map((entry) => {
      const nodes = parseNodeRanges(entry.nodes);
      const past = nodeCount.value > 0 ? nodes.filter((n) => n >= nodeCount.value).length : 0;
      return { count: nodes.length, past };
    }),
  ),
);
</script>

<template>
  <div class="states">
    <div class="head">
      <h4>States</h4>
      <span class="head-actions">
        <button @click="addSevenSegment">Add seven-segment</button>
        <button @click="addDefinition">Add definition</button>
      </span>
    </div>
    <p class="hint">
      A named set of this model's nodes that the State effect turns on by name. Put the same word
      on a timing track label and those nodes light. Node numbers are 1-based:
      <code>1,5,8</code> or <code>1-3,8</code>.
      <template v-if="nodeCount"> This model has {{ nodeCount }} nodes.</template>
    </p>

    <div v-for="(spec, i) in states" :key="i" class="definition">
      <div class="row">
        <input
          :value="spec.name"
          type="text"
          placeholder="State1"
          @input="patch(i, { name: ($event.target as HTMLInputElement).value })"
        />
        <button title="Remove this definition" @click="removeDefinition(i)">×</button>
      </div>

      <div v-for="(entry, e) in spec.entries" :key="e" class="row entry">
        <input
          class="state-name"
          :value="entry.name"
          type="text"
          placeholder="wink"
          @input="patchEntry(i, e, { name: ($event.target as HTMLInputElement).value })"
        />
        <input
          class="state-nodes"
          :value="entry.nodes"
          type="text"
          placeholder="1,5,8"
          @input="patchEntry(i, e, { nodes: ($event.target as HTMLInputElement).value })"
        />
        <!-- "Force Custom Colors": a colour here overrides whatever the effect would have used. -->
        <input
          type="color"
          :value="entry.color ?? '#ffffff'"
          :class="{ unset: !entry.color }"
          title="Force a colour for this state"
          @input="setForcedColor(i, e, ($event.target as HTMLInputElement).value)"
        />
        <button v-if="entry.color" title="Take the colour from the effect instead" @click="setForcedColor(i, e, null)">
          ⟲
        </button>
        <span class="count" :class="{ bad: resolved[i]?.[e]?.past }">
          {{ resolved[i]?.[e]?.count ?? 0 }}
          <template v-if="resolved[i]?.[e]?.past"> — {{ resolved[i]?.[e]?.past }} past the end</template>
        </span>
        <button title="Remove this state" @click="removeEntry(i, e)">×</button>
      </div>

      <div class="row">
        <button :disabled="spec.entries.length >= MAX_STATES_PER_DEFINITION" @click="addEntry(i)">Add state</button>
        <span class="hint">{{ spec.entries.length }} of {{ MAX_STATES_PER_DEFINITION }}</span>
      </div>
    </div>

    <p v-if="states.length === 0" class="hint">None yet.</p>
  </div>
</template>

<style scoped>
.states {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h4 {
  margin: 0;
  font-size: 0.8rem;
}
.head-actions {
  display: flex;
  gap: 0.25rem;
}
.definition {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}
.row input[type="text"] {
  flex: 1;
  min-width: 0;
}
.entry .state-name {
  flex: 0 1 6rem;
}
.entry .state-nodes {
  flex: 1 1 auto;
}
/* An unset forced colour still has to render as a swatch, so it is dimmed rather than hidden -
   otherwise there would be no way to set one. */
input[type="color"].unset {
  opacity: 0.35;
}
.hint,
.count {
  margin: 0;
  font-size: 0.65rem;
  color: #666;
  white-space: nowrap;
}
.count.bad {
  color: #a8631a;
}
</style>
