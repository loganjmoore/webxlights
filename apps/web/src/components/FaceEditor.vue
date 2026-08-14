<script setup lang="ts">
import { computed } from "vue";
import { emptyFaceSpec, parseNodeRanges, type FaceSpec, type ModelGeometry } from "@webxlights/engine";

// The in-app face editor (xLights: Layout tab, the model's Faces property).
//
// This covers the two node-range face types — the manual's "Single Node" and "Node Ranges", which
// are the coro faces. Its Matrix type is a picture per mouth position and needs image storage this
// doesn't have, so it isn't offered here rather than being offered and not working.
//
// The phoneme rows are editable names, not a fixed list. The manual only shows the set in
// screenshots, so a hardcoded list would be a guess that silently mismatched an imported
// definition — and a mouth this face hasn't got renders as a closed mouth with no explanation.

const props = defineProps<{ faces: FaceSpec[]; geometry: ModelGeometry | null }>();
const emit = defineEmits<{ update: [faces: FaceSpec[]] }>();

const PARTS = [
  { key: "eyesOpen", label: "Eyes open" },
  { key: "eyesClosed", label: "Eyes closed" },
  { key: "outline", label: "Outline" },
  { key: "outline2", label: "Outline 2" },
  { key: "eyesOpen2", label: "Eyes open 2" },
  { key: "eyesClosed2", label: "Eyes closed 2" },
  { key: "eyesOpen3", label: "Eyes open 3" },
  { key: "eyesClosed3", label: "Eyes closed 3" },
] as const;

function patch(index: number, changes: Partial<FaceSpec>): void {
  emit(
    "update",
    props.faces.map((f, i) => (i === index ? { ...f, ...changes } : f)),
  );
}

function addFace(): void {
  const names = new Set(props.faces.map((f) => f.name));
  let name = "Face1";
  for (let n = 1; names.has(name); n++) name = `Face${n + 1}`;
  emit("update", [...props.faces, emptyFaceSpec(name)]);
}

function removeFace(index: number): void {
  emit("update", props.faces.filter((_, i) => i !== index));
}

function patchMouth(index: number, mouthIndex: number, changes: Partial<FaceSpec["mouths"][number]>): void {
  patch(index, { mouths: (props.faces[index]?.mouths ?? []).map((m, i) => (i === mouthIndex ? { ...m, ...changes } : m)) });
}

function addMouth(index: number): void {
  patch(index, { mouths: [...(props.faces[index]?.mouths ?? []), { name: "", nodes: "" }] });
}

function removeMouth(index: number, mouthIndex: number): void {
  patch(index, { mouths: (props.faces[index]?.mouths ?? []).filter((_, i) => i !== mouthIndex) });
}

function setMouthColor(index: number, mouthIndex: number, value: string | null): void {
  const mouths = (props.faces[index]?.mouths ?? []).map((m, i) => {
    if (i !== mouthIndex) return m;
    if (value === null) {
      const cleared = { ...m };
      delete cleared.color;
      return cleared;
    }
    return { ...m, color: value };
  });
  patch(index, { mouths });
}

const nodeCount = computed(() => props.geometry?.nodes.length ?? 0);

function countFor(ranges: string | undefined): { count: number; past: number } {
  const parsed = parseNodeRanges(ranges ?? "");
  return { count: parsed.length, past: nodeCount.value > 0 ? parsed.filter((n) => n >= nodeCount.value).length : 0 };
}
</script>

<template>
  <div class="faces">
    <div class="head">
      <h4>Faces</h4>
      <button @click="addFace">Add face</button>
    </div>
    <p class="hint">
      Which nodes are the mouth in each position, and which are the eyes and outline. A phoneme
      timing track drives them: each cell's label is a mouth position. Node numbers are 1-based:
      <code>1-12,24-30</code>.
      <template v-if="nodeCount"> This model has {{ nodeCount }} nodes.</template>
    </p>

    <div v-for="(face, i) in faces" :key="i" class="definition">
      <div class="row">
        <input
          :value="face.name"
          type="text"
          placeholder="Face1"
          @input="patch(i, { name: ($event.target as HTMLInputElement).value })"
        />
        <button title="Remove this face" @click="removeFace(i)">×</button>
      </div>

      <p class="sub-head">Mouths</p>
      <div v-for="(mouth, m) in face.mouths" :key="m" class="row entry">
        <input
          class="phoneme"
          :value="mouth.name"
          type="text"
          placeholder="AI"
          @input="patchMouth(i, m, { name: ($event.target as HTMLInputElement).value })"
        />
        <input
          class="nodes"
          :value="mouth.nodes"
          type="text"
          placeholder="1-12"
          @input="patchMouth(i, m, { nodes: ($event.target as HTMLInputElement).value })"
        />
        <input
          type="color"
          :value="mouth.color ?? '#ffffff'"
          :class="{ unset: !mouth.color }"
          title="Force a colour for this mouth"
          @input="setMouthColor(i, m, ($event.target as HTMLInputElement).value)"
        />
        <button v-if="mouth.color" title="Take the colour from the effect instead" @click="setMouthColor(i, m, null)">⟲</button>
        <span class="count" :class="{ bad: countFor(mouth.nodes).past }">
          {{ countFor(mouth.nodes).count }}
          <template v-if="countFor(mouth.nodes).past"> — {{ countFor(mouth.nodes).past }} past the end</template>
        </span>
        <button title="Remove this mouth" @click="removeMouth(i, m)">×</button>
      </div>
      <div class="row"><button @click="addMouth(i)">Add mouth</button></div>

      <p class="sub-head">Eyes and outline</p>
      <div v-for="part in PARTS" :key="part.key" class="row entry">
        <span class="phoneme part-label">{{ part.label }}</span>
        <input
          class="nodes"
          :value="face[part.key] ?? ''"
          type="text"
          placeholder="—"
          @input="patch(i, { [part.key]: ($event.target as HTMLInputElement).value })"
        />
        <span class="count" :class="{ bad: countFor(face[part.key]).past }">{{ countFor(face[part.key]).count }}</span>
      </div>
    </div>

    <p v-if="faces.length === 0" class="hint">None yet.</p>
  </div>
</template>

<style scoped>
.faces {
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
.definition {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.sub-head {
  margin: 0.25rem 0 0;
  font-size: 0.7rem;
  color: #555;
  font-weight: 600;
}
.row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}
.row input[type="text"] {
  min-width: 0;
}
.entry .phoneme {
  flex: 0 0 5.5rem;
}
.entry .nodes {
  flex: 1 1 auto;
}
.part-label {
  font-size: 0.7rem;
  color: #666;
}
/* An unset forced colour still needs a swatch to click, so it is dimmed rather than hidden. */
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
