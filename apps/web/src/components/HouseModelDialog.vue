<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import ModalPanel from "./ModalPanel.vue";
import HousePreview from "./HousePreview.vue";
import { api, type HouseDraft, type SequenceBody } from "../lib/api";
import { fitHouseToLayout, houseModelFrom, type HouseModel } from "../lib/houseModel";
import { prepareBackground } from "../lib/backgroundImage";

// Photos first, proportionate geometry fitted to the layout, then one explicit save.
// Existing layout data stays in place while photos and a new draft are being inspected.
const props = defineProps<{ layoutId: number }>();
const emit = defineEmits<{ close: []; saved: [house: HouseModel | null] }>();
const emptyBody: SequenceBody = { timingTracks: [], rows: [] };
const revision = ref("");
const draft = ref<HouseModel | null>(null);
const result = ref<HouseDraft | null>(null);
const hadHouse = ref(false);
const phase = ref<"loading" | "ready" | "generating" | "saving">("loading");
const error = ref("");
const uploads = ref<{ name: string; dataUrl: string }[]>([]);
const preparingPhotos = ref(false);
const requestId = ref(crypto.randomUUID());
const aborter = new AbortController();
const busy = computed(() => phase.value !== "ready" || preparingPhotos.value);
const renderHouse = computed(() => houseModelFrom({ houseModel: draft.value }));
const status = computed(() => preparingPhotos.value ? "Preparing photos…" : ({ loading: "Loading house settings…", ready: "", generating: "Building your house from the photos. This can take a few minutes…", saving: "Saving house…" })[phase.value]);
function message(e: unknown): string {
  if (e instanceof Error) {
    try { const body = JSON.parse(e.message); if (typeof body.message === "string") return body.message; } catch { /* Plain error text. */ }
    return e.message;
  }
  return "The house could not be updated. Please try again.";
}
function close(): void { if (phase.value !== "saving") emit("close"); }
function newRequest(): void { requestId.value = crypto.randomUUID(); draft.value = null; result.value = null; }
function fitToLayout(): void {
  if (draft.value) draft.value = fitHouseToLayout(toRaw(draft.value));
}

async function generate(): Promise<void> {
  if (busy.value || !uploads.value.length) return;
  phase.value = "generating"; error.value = "";
  try {
    const next = await api.generateHouse(props.layoutId, null, requestId.value, uploads.value.map(p => p.dataUrl), aborter.signal);
    const valid = houseModelFrom({ houseModel: next.houseModel });
    if (!valid) throw new Error("The generated house could not be read. Your layout is unchanged.");
    draft.value = fitHouseToLayout(valid); result.value = next;
  } catch (e) {
    if (!aborter.signal.aborted) { error.value = message(e); }
  } finally { phase.value = "ready"; }
}
async function pickPhotos(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = "";
  if (files.length + uploads.value.length > 4) { error.value = "Use up to four house photos."; return; }
  if (!files.length) return;
  newRequest(); preparingPhotos.value = true; error.value = "";
  try {
    for (const file of files) {
      const prepared = await prepareBackground(file);
      if (!prepared.image) throw new Error(prepared.error);
      uploads.value.push({ name: file.name, dataUrl: prepared.image.dataUrl });
    }
    requestId.value = crypto.randomUUID();
  } catch (e) { error.value = message(e); }
  finally { preparingPhotos.value = false; }
}
function removePhoto(index: number): void { uploads.value.splice(index, 1); newRequest(); }
async function save(remove = false): Promise<void> {
  if (busy.value || !revision.value || (!remove && !draft.value)) return;
  phase.value = "saving"; error.value = "";
  try {
    // Existing layout snapshots are the recovery mechanism for house replacements and removal.
    await api.snapshotLayout(props.layoutId);
    const saved = await api.replaceHouseModel(props.layoutId, remove ? null : draft.value, revision.value);
    revision.value = saved.revision;
    emit("saved", saved.houseModel); emit("close");
  } catch (e) { error.value = message(e); }
  finally { phase.value = "ready"; }
}
onMounted(async () => {
  try {
    const existing = await api.getHouseModel(props.layoutId);
    revision.value = existing.revision; hadHouse.value = !!existing.houseModel;
    draft.value = houseModelFrom({ houseModel: existing.houseModel });
  } catch (e) { error.value = message(e); }
  finally { phase.value = "ready"; }
});
onBeforeUnmount(() => aborter.abort());
</script>

<template>
  <ModalPanel title="Model my house" id="house-model" wide @close="close">
    <div class="house-workflow">
      <section class="photos-section" aria-labelledby="house-photos-title">
        <h3 id="house-photos-title">Add photos of your house</h3>
        <p class="help">Start with a clear front view. Add angled and side views with the roof and porch visible. Use 1–4 photos you own or have permission to use.</p>
        <input aria-label="House photos" type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="busy || uploads.length >= 4" @change="pickPhotos" />
        <div v-if="uploads.length" class="photo-strip">
          <div v-for="(photo, index) in uploads" :key="index"><img :src="photo.dataUrl" :alt="photo.name" /><span>{{ index === 0 ? 'Front view' : `View ${index + 1}` }}</span><button :disabled="busy" @click="removePhoto(index)">Remove photo {{ index + 1 }}</button></div>
        </div>
        <p class="help">No address or measurements needed. We estimate the proportions and fit the house to your layout view.</p>
        <button :class="{ primary: !draft }" :disabled="busy || !revision || !uploads.length" @click="generate">{{ draft ? 'Regenerate from photos' : 'Create 3D draft' }}</button>
      </section>
      <p v-if="status" class="status" role="status">{{ status }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="draft">
        <div class="draft-grid">
          <div class="house-stage"><HousePreview :house-model="renderHouse" :models="[]" :body="emptyBody" :playhead-ms="0" :frame-ms="50" /></div>
          <div class="measurements">
            <h3>Ready to place lights</h3>
            <p class="help">{{ draft.surfaces.length }} exterior surfaces. Proportions are estimated from your photos, not measured.</p>
            <button :disabled="busy" @click="fitToLayout">Fit to default layout</button>
            <details><summary>Adjust placement</summary>
              <label>Rotation (°)<input v-model.number="draft.placement.rotationY" type="number" min="-360" max="360" :disabled="busy" /></label>
              <label>Layout scale<input v-model.number="draft.placement.worldUnitsPerMeter" type="number" min="0.1" max="1000" step="0.1" :disabled="busy" /></label>
              <label v-for="(label, i) in ['Left / right', 'Up / down', 'Forward / back']" :key="label">{{ label }}<input v-model.number="draft.placement.position[i]" type="number" min="-100000" max="100000" :disabled="busy" /></label>
            </details>
          </div>
        </div>
        <details class="sources"><summary>Estimated details and sources</summary>
          <p v-if="result?.evidence" class="help">{{ result.evidence }}</p>
          <p class="source-notes">{{ draft.source.notes }}</p>
          <p v-for="warning in result?.warnings ?? []" :key="warning" class="help">{{ warning }}</p>
          <p v-for="(credit, index) in draft.source.credits ?? []" :key="index"><a :href="credit.url" target="_blank" rel="noopener noreferrer">{{ credit.label }}</a> · {{ credit.license }}</p>
        </details>
      </template>
      <p class="privacy">Photos are sent to Anthropic to generate an untextured house exterior. The saved house is visible to members of this project.</p>
      <footer>
        <button v-if="hadHouse" class="remove" :disabled="busy" @click="save(true)">Remove house</button>
        <span class="spacer"></span><button :disabled="phase === 'saving'" @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="busy || !draft || !revision || !houseModelFrom({houseModel: draft})" @click="save()">Save house to layout</button>
      </footer>
    </div>
  </ModalPanel>
</template>

<style scoped>
.house-workflow { display: grid; gap: 1rem; color: var(--text); font-size: 0.8rem; }
footer { display: flex; align-items: center; gap: 0.5rem; }
input:not([type="radio"]):not([type="file"]), select { min-height: 32px; box-sizing: border-box; background: var(--bg-control); color: var(--text); border: 1px solid var(--border-strong); border-radius: 4px; padding: 0.3rem 0.5rem; }
button { min-height: 32px; padding: 0.3rem 0.7rem; background: var(--bg-control); color: var(--text); border: 1px solid var(--border-strong); border-radius: 4px; cursor: pointer; }
button:hover:not(:disabled) { background: var(--bg-hover); }
button.primary { background: var(--accent); color: var(--accent-ink); }
button.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
p { margin: 0; line-height: 1.5; }
.help, .privacy, .source-notes { color: var(--text-muted); }
.privacy { font-size: 0.7rem; }
.source-notes { white-space: pre-line; }
.error { color: var(--danger); }
.status { color: var(--text); }
summary { cursor: pointer; color: var(--text-muted); }
details[open] > summary { margin-bottom: 0.5rem; }
.photos-section { display: grid; justify-items: start; gap: 0.75rem; min-width: 0; }
.photos-section input { max-width: 100%; }
.photo-strip { max-width: 100%; display: flex; gap: 0.75rem; overflow-x: auto; padding: 0.5rem 0; }
.photo-strip > div { display: grid; gap: 0.25rem; }
.photo-strip img { width: 180px; height: 120px; object-fit: contain; background: var(--bg); }
.draft-grid { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 1rem; }
.house-stage { height: 340px; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
.measurements { display: grid; align-content: start; gap: 0.5rem; }
h3 { font-size: 0.8rem; font-weight: 500; margin: 0; flex: 1; }
.measurements details label { display: grid; gap: 0.25rem; margin-bottom: 0.5rem; }
.measurements details input { width: 100%; }
a { color: var(--info); }
.sources p { margin-top: 0.4rem; }
.spacer { flex: 1; }
footer { border-top: 1px solid var(--border); padding-top: 0.75rem; flex-wrap: wrap; }
.remove { color: var(--danger); }
@media (max-width: 700px) { .draft-grid { grid-template-columns: 1fr; } .house-stage { height: 300px; } }
</style>
