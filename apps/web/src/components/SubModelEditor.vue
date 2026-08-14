<script setup lang="ts">
import { computed } from "vue";
import { computeSubModel, parseNodeRanges, type ModelGeometry, type SubModelSpec } from "@webxlights/engine";

// The in-app sub-model editor (xLights: Layout tab > SubModels).
//
// Sub-models could already be imported, resolved and rendered; what was missing was any way to
// *make* one, or to fix one that came in wrong. That gap matters more than it sounds: a sub-model
// is how the star on a mega tree or one arch of a set gets its own sequencer row, and without an
// editor the only way to get one was to go back to xLights and re-import.
//
// The node count each spec actually resolves to is shown live, because a range list is very easy
// to get wrong by one and the symptom otherwise is a row that renders on nothing.

const props = defineProps<{ subModels: SubModelSpec[]; geometry: ModelGeometry | null }>();
const emit = defineEmits<{ update: [subModels: SubModelSpec[]] }>();

function patch(index: number, changes: Partial<SubModelSpec>): void {
  emit(
    "update",
    props.subModels.map((sm, i) => (i === index ? { ...sm, ...changes } : sm)),
  );
}

function add(): void {
  const names = new Set(props.subModels.map((s) => s.name));
  let name = "SubModel";
  for (let n = 1; names.has(name); n++) name = `SubModel ${n}`;
  emit("update", [...props.subModels, { name, type: "ranges", rows: [""], vertical: false }]);
}

function remove(index: number): void {
  emit("update", props.subModels.filter((_, i) => i !== index));
}

function setRow(index: number, rowIndex: number, value: string): void {
  const rows = [...(props.subModels[index]?.rows ?? [])];
  rows[rowIndex] = value;
  patch(index, { rows });
}
function addRow(index: number): void {
  patch(index, { rows: [...(props.subModels[index]?.rows ?? []), ""] });
}
function removeRow(index: number, rowIndex: number): void {
  const rows = (props.subModels[index]?.rows ?? []).filter((_, i) => i !== rowIndex);
  // One row is the floor: a range sub-model with none selects nothing and is dropped at render,
  // so it would vanish from the sequencer without ever saying why.
  patch(index, { rows: rows.length ? rows : [""] });
}

// What each spec resolves to against this model, so a typo shows up here rather than as a silent
// empty row in the sequencer.
const resolved = computed(() =>
  props.subModels.map((spec) => {
    if (!props.geometry) return { nodes: null as number | null, note: "" };
    const sub = computeSubModel(props.geometry, spec);
    if (!sub) return { nodes: 0, note: "selects no node this model has" };
    const outOfRange = spec.type === "ranges"
      ? spec.rows.flatMap(parseNodeRanges).filter((n) => n >= props.geometry!.nodes.length).length
      : 0;
    return {
      nodes: sub.geometry.nodes.length,
      note: outOfRange > 0 ? `${outOfRange} node${outOfRange === 1 ? "" : "s"} past the end of this model` : "",
    };
  }),
);

const nodeCount = computed(() => props.geometry?.nodes.length ?? 0);
</script>

<template>
  <div class="sub-models">
    <div class="head">
      <h4>Sub-models</h4>
      <button @click="add">Add sub-model</button>
    </div>
    <p class="hint">
      A named subset of this model's nodes, addressable in the sequencer as its own row. Node
      numbers are 1-based and inclusive: <code>1-25,40</code>. A descending range like
      <code>25-1</code> runs the other way along the string.
      <template v-if="nodeCount"> This model has {{ nodeCount }} nodes.</template>
    </p>

    <div v-for="(spec, i) in subModels" :key="i" class="sub-model">
      <div class="row">
        <input :value="spec.name" type="text" placeholder="Name" @input="patch(i, { name: ($event.target as HTMLInputElement).value })" />
        <select :value="spec.type" @change="patch(i, { type: ($event.target as HTMLSelectElement).value as SubModelSpec['type'] })">
          <option value="ranges">Node ranges</option>
          <option value="subbuffer">Sub-buffer</option>
        </select>
        <button title="Remove this sub-model" @click="remove(i)">×</button>
      </div>

      <template v-if="spec.type === 'ranges'">
        <div v-for="(row, r) in spec.rows" :key="r" class="row">
          <input
            :value="row"
            type="text"
            placeholder="1-25,40"
            @input="setRow(i, r, ($event.target as HTMLInputElement).value)"
          />
          <button title="Remove this row" @click="removeRow(i, r)">×</button>
        </div>
        <div class="row">
          <button @click="addRow(i)">Add row</button>
          <label class="inline">
            <input
              type="checkbox"
              :checked="spec.vertical === true"
              @change="patch(i, { vertical: ($event.target as HTMLInputElement).checked })"
            />
            Rows run down the buffer
          </label>
        </div>
      </template>
      <div v-else class="row">
        <input
          :value="spec.subBuffer ?? '0,0,100,100'"
          type="text"
          placeholder="x1,y1,x2,y2 as percentages"
          @input="patch(i, { subBuffer: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <p class="resolved" :class="{ bad: resolved[i]?.nodes === 0 }">
        <template v-if="resolved[i]?.nodes === null">Add this model's geometry to see what it selects.</template>
        <template v-else>
          {{ resolved[i]?.nodes }} node{{ resolved[i]?.nodes === 1 ? "" : "s" }}
          <span v-if="resolved[i]?.note"> — {{ resolved[i]?.note }}</span>
        </template>
      </p>
    </div>

    <p v-if="subModels.length === 0" class="hint">None yet.</p>
  </div>
</template>

<style scoped>
.sub-models {
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
.sub-model {
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
.inline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #555;
}
.hint,
.resolved {
  margin: 0;
  font-size: 0.65rem;
  color: #666;
}
/* A sub-model selecting nothing is dropped at render time, so its row would disappear from the
   sequencer without explanation. Saying so here is the only warning there is. */
.resolved.bad {
  color: #a8631a;
}
</style>
