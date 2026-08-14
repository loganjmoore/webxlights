<script setup lang="ts">
import { computed } from "vue";
import { emptyFaceSpec, isMatrixFace, parseNodeRanges, type FaceSpec, type ModelGeometry } from "@webxlights/engine";
import { decodeImageForEffect, MAX_PICTURE_EDGE } from "../lib/pictureImport";

// The in-app face editor (xLights: Layout tab, the model's Faces property).
//
// All three of the manual's face types. The two node-range ones — "Single Node" and "Node Ranges",
// the coro faces — assign nodes to each mouth position. The "Matrix" type assigns a picture
// instead, and offers the manual's Centered/Scaled placement.
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

function addFace(kind: "nodes" | "matrix"): void {
  const names = new Set(props.faces.map((f) => f.name));
  let name = kind === "matrix" ? "Matrix Face" : "Face1";
  for (let n = 1; names.has(name); n++) name = kind === "matrix" ? `Matrix Face ${n + 1}` : `Face${n + 1}`;
  emit("update", [...props.faces, emptyFaceSpec(name, kind)]);
}

function patchImage(index: number, imageIndex: number, changes: Partial<NonNullable<FaceSpec["images"]>[number]>): void {
  patch(index, { images: (props.faces[index]?.images ?? []).map((m, i) => (i === imageIndex ? { ...m, ...changes } : m)) });
}

function addImageRow(index: number): void {
  patch(index, { images: [...(props.faces[index]?.images ?? []), { name: "" }] });
}

function removeImageRow(index: number, imageIndex: number): void {
  patch(index, { images: (props.faces[index]?.images ?? []).filter((_, i) => i !== imageIndex) });
}

/**
 * Picks a picture for one mouth position.
 *
 * Decoded down to the model's own resolution rather than the full file. The manual warns about
 * this from the other direction — "High resolution image will not scale well to low resolution
 * matrices" — and here it is also what keeps a model row from carrying megabytes of JSON that is
 * fetched with every layout load: anything bigger than the matrix is downscaled when drawn anyway.
 */
async function pickFaceImage(index: number, imageIndex: number, key: "image" | "imageClosed", e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const edge = Math.min(MAX_PICTURE_EDGE, Math.max(8, props.geometry?.width ?? MAX_PICTURE_EDGE, props.geometry?.height ?? 0));
  patchImage(index, imageIndex, { [key]: await decodeImageForEffect(file, edge) });
}

function clearFaceImage(index: number, imageIndex: number, key: "image" | "imageClosed"): void {
  const images = (props.faces[index]?.images ?? []).map((m, i) => {
    if (i !== imageIndex) return m;
    const cleared = { ...m };
    delete cleared[key];
    return cleared;
  });
  patch(index, { images });
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
      <span class="head-actions">
        <button @click="addFace('nodes')">Add coro face</button>
        <button @click="addFace('matrix')">Add matrix face</button>
      </span>
    </div>
    <p class="hint">
      What the prop does in each mouth position — nodes for a coro face, a picture for a matrix
      one. A phoneme timing track drives them: each cell's label is a mouth position. Node numbers
      are 1-based: <code>1-12,24-30</code>.
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

      <template v-if="isMatrixFace(face)">
        <div class="row">
          <label class="part-label">Placement</label>
          <select :value="face.placement ?? 'Centered'" @change="patch(i, { placement: ($event.target as HTMLSelectElement).value as 'Centered' | 'Scaled' })">
            <option value="Centered">Centered</option>
            <option value="Scaled">Scaled</option>
          </select>
          <span class="hint">Centered draws the picture at its own size and only shrinks it; Scaled stretches it to fill the matrix.</span>
        </div>

        <p class="sub-head">Mouth pictures</p>
        <div v-for="(entry, m) in face.images ?? []" :key="m" class="row entry">
          <input
            class="phoneme"
            :value="entry.name"
            type="text"
            placeholder="AI"
            @input="patchImage(i, m, { name: ($event.target as HTMLInputElement).value })"
          />
          <label class="pick">
            <span :class="{ set: entry.image }">{{ entry.image ? `${entry.image.width}×${entry.image.height}` : "Eyes open…" }}</span>
            <input type="file" accept="image/*" @change="pickFaceImage(i, m, 'image', $event)" />
          </label>
          <button v-if="entry.image" title="Remove this picture" @click="clearFaceImage(i, m, 'image')">⟲</button>
          <label class="pick">
            <span :class="{ set: entry.imageClosed }">{{ entry.imageClosed ? `${entry.imageClosed.width}×${entry.imageClosed.height}` : "Eyes closed…" }}</span>
            <input type="file" accept="image/*" @change="pickFaceImage(i, m, 'imageClosed', $event)" />
          </label>
          <button v-if="entry.imageClosed" title="Use the open-eyes picture instead" @click="clearFaceImage(i, m, 'imageClosed')">⟲</button>
          <button title="Remove this mouth" @click="removeImageRow(i, m)">×</button>
        </div>
        <div class="row"><button @click="addImageRow(i)">Add mouth</button></div>
      </template>

      <template v-else>
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
      </template>
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
.pick {
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  color: #777;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
  cursor: pointer;
}
.pick input[type="file"] {
  display: none;
}
.pick .set {
  color: #2c6e3f;
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
