<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import ModalPanel from "./ModalPanel.vue";
import HousePreview from "./HousePreview.vue";
import { api, type HouseDraft, type SequenceBody } from "../lib/api";
import { calibrateHouseWidth, houseDimensions, houseModelFrom, type HouseModel } from "../lib/houseModel";
import { prepareBackground } from "../lib/backgroundImage";

// Extend the layout editor: address first, neutral geometry to review, then one explicit save.
// Existing layout data stays in place while photos and a new draft are being inspected.
const props = defineProps<{ layoutId: number }>();
const emit = defineEmits<{ close: []; saved: [house: HouseModel | null] }>();
const emptyBody: SequenceBody = { timingTracks: [], rows: [] };
const address = ref("");
const candidates = ref<{ token: string; label: string }[]>([]);
const selected = ref("");
const revision = ref("");
const draft = ref<HouseModel | null>(null);
const result = ref<HouseDraft | null>(null);
const hadHouse = ref(false);
const phase = ref<"loading" | "ready" | "searching" | "generating" | "saving">("loading");
const error = ref("");
const uploads = ref<{ name: string; dataUrl: string }[]>([]);
const showPhotos = ref(false);
const preparingPhotos = ref(false);
const requestId = ref(crypto.randomUUID());
const units = ref<"ft" | "m">("ft");
const knownWidth = ref<number | null>(null);
const aborter = new AbortController();
const busy = computed(() => phase.value !== "ready" || preparingPhotos.value);
const renderHouse = computed(() => houseModelFrom({ houseModel: draft.value }));
const size = computed(() => draft.value ? houseDimensions(draft.value) : null);
const unitFactor = computed(() => units.value === "ft" ? 3.28084 : 1);
const status = computed(() => ({ loading: "Loading house settings…", ready: "", searching: "Finding your address…", generating: "Finding exterior photos and building your 3D draft. This can take a few minutes…", saving: "Saving house…" })[phase.value]);
function message(e: unknown): string {
  if (e instanceof Error) {
    try { const body = JSON.parse(e.message); if (typeof body.message === "string") return body.message; } catch { /* Plain error text. */ }
    return e.message;
  }
  return "The house could not be updated. Please try again.";
}
function close(): void { if (phase.value !== "saving") emit("close"); }
function newRequest(): void { requestId.value = crypto.randomUUID(); draft.value = null; result.value = null; knownWidth.value = null; }
function changedAddress(): void {
  candidates.value = []; selected.value = ""; requestId.value = crypto.randomUUID();
  if (uploads.value.length) error.value = "Address changed. Add photos for this house before generating.";
  uploads.value = []; draft.value = null; result.value = null; knownWidth.value = null;
}

async function search(): Promise<void> {
  if (busy.value) return;
  error.value = ""; phase.value = "searching";
  try {
    candidates.value = (await api.lookupHouseAddress(props.layoutId, address.value.trim(), aborter.signal)).candidates;
    if (!candidates.value.length) error.value = "No house address matched. Include the house number, street, city, and postal code.";
    selected.value = candidates.value.length === 1 ? candidates.value[0]!.token : "";
    requestId.value = crypto.randomUUID();
  } catch (e) { if (!aborter.signal.aborted) error.value = message(e); }
  finally { phase.value = "ready"; }
  if (selected.value && !aborter.signal.aborted) await generate();
}
async function generate(): Promise<void> {
  if (busy.value || !selected.value) return;
  phase.value = "generating"; error.value = "";
  try {
    const next = await api.generateHouse(props.layoutId, selected.value, requestId.value, uploads.value.map(p => p.dataUrl), aborter.signal);
    const valid = houseModelFrom({ houseModel: next.houseModel });
    if (!valid) throw new Error("The generated house could not be read. Your layout is unchanged.");
    draft.value = valid; result.value = next; knownWidth.value = null;
  } catch (e) {
    if (!aborter.signal.aborted) { error.value = message(e); showPhotos.value = true; }
  } finally { phase.value = "ready"; }
}
async function pickPhotos(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []); input.value = "";
  if (files.length + uploads.value.length > 4) { error.value = "Use up to four house photos."; return; }
  preparingPhotos.value = true; error.value = "";
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
function removePhoto(index: number): void { uploads.value.splice(index, 1); requestId.value = crypto.randomUUID(); }
function calibrate(): void {
  if (!draft.value || knownWidth.value === null) return;
  try { draft.value = calibrateHouseWidth(toRaw(draft.value), knownWidth.value / unitFactor.value); error.value = ""; }
  catch (e) { error.value = message(e); }
}
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
    address.value = draft.value?.source.label ?? "";
  } catch (e) { error.value = message(e); }
  finally { phase.value = "ready"; }
});
onBeforeUnmount(() => aborter.abort());
</script>

<template>
  <ModalPanel title="Model my house" id="house-model" wide @close="close">
    <div class="house-workflow">
      <form class="address-form" @submit.prevent="search">
        <label for="house-address">Mailing address</label>
        <div class="address-row">
          <input id="house-address" v-model="address" @input="changedAddress" autocomplete="street-address" placeholder="House number, street, city, postal code" required minlength="8" maxlength="250" :disabled="busy" />
          <button class="primary" :disabled="busy || !revision || address.trim().length < 8">Create 3D draft</button>
        </div>
        <p class="help">An approximate exterior for placing lights: walls, roof, windows, doors, and porches where visible. No textures.</p>
      </form>
      <fieldset v-if="candidates.length > 1" :disabled="busy">
        <legend>Choose the matching address</legend>
        <label v-for="candidate in candidates" :key="candidate.token" class="candidate"><input type="radio" v-model="selected" :value="candidate.token" @change="newRequest" /> {{ candidate.label }}</label>
        <button :disabled="!selected" @click="generate">Generate selected house</button>
      </fieldset>
      <p v-else-if="candidates.length === 1" class="matched">{{ candidates[0]!.label }}</p>
      <p v-if="status" class="status" role="status">{{ status }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <details :open="showPhotos" class="photos-section" @toggle="showPhotos = ($event.target as HTMLDetailsElement).open">
        <summary>Add your own house photos</summary>
        <p class="help">Useful when street coverage is missing or outdated. Include the front and sides, with the roof and porch in view. Use photos you own or have permission to use; these replace the public photos for this draft.</p>
        <input aria-label="House photos" type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="busy || uploads.length >= 4" @change="pickPhotos" />
        <div v-if="uploads.length" class="photo-strip">
          <div v-for="(photo, index) in uploads" :key="index"><img :src="photo.dataUrl" :alt="photo.name" /><button :disabled="busy" @click="removePhoto(index)">Remove photo {{ index + 1 }}</button></div>
        </div>
        <button v-if="uploads.length && selected" :disabled="busy" @click="generate">Generate from these photos</button>
      </details>
      <template v-if="draft && size">
        <div class="draft-grid">
          <div class="house-stage"><HousePreview :house-model="renderHouse" :models="[]" :body="emptyBody" :playhead-ms="0" :frame-ms="50" /></div>
          <div class="measurements">
            <div class="dimension-head"><h3>Approximate dimensions</h3><select aria-label="Dimension units" v-model="units"><option value="ft">ft</option><option value="m">m</option></select></div>
            <dl><template v-for="(value, key) in size" :key="key"><dt>{{ key }}</dt><dd>{{ (value * unitFactor).toFixed(1) }} {{ units }}</dd></template></dl>
            <p class="help">{{ draft.surfaces.length }} exterior surfaces. Verify dimensions before buying or cutting lights.</p>
            <label for="known-house-width">Known width ({{ units }})</label>
            <div class="calibrate-row"><input id="known-house-width" v-model.number="knownWidth" type="number" min="1" step="0.1" :disabled="busy" /><button :disabled="busy || !knownWidth" @click="calibrate">Calibrate</button></div>
            <p class="help">Scales all dimensions proportionally.</p>
            <details><summary>Align with your layout</summary>
              <label>Rotation (°)<input v-model.number="draft.placement.rotationY" type="number" min="-360" max="360" :disabled="busy" /></label>
              <label>Layout units per meter<input v-model.number="draft.placement.worldUnitsPerMeter" type="number" min="0.1" max="1000" step="0.1" :disabled="busy" /></label>
              <label v-for="(label, i) in ['Left / right', 'Up / down', 'Forward / back']" :key="label">{{ label }}<input v-model.number="draft.placement.position[i]" type="number" min="-100000" max="100000" :disabled="busy" /></label>
            </details>
          </div>
        </div>
        <p v-if="result?.evidence" class="help">{{ result.evidence }}</p>
        <p class="source-notes">{{ draft.source.notes }}</p>
        <p v-for="warning in result?.warnings ?? []" :key="warning" class="help">{{ warning }}</p>
        <details class="sources"><summary>Photos and attribution</summary>
          <div v-if="result?.photos.length" class="photo-strip"><img v-for="(photo, index) in result.photos" :key="index" :src="photo.dataUrl" :alt="`Source photo ${index + 1} used for this draft`" /></div>
          <p v-for="(credit, index) in draft.source.credits ?? []" :key="index"><a :href="credit.url" target="_blank" rel="noopener noreferrer">{{ credit.label }}</a> · {{ credit.license }}</p>
          <p class="help">Derived geometry follows the source licenses shown above. KartaView-derived geometry is shared under CC BY-SA 4.0.</p>
        </details>
      </template>
      <p class="privacy">Address lookup uses Photon / OpenStreetMap. Exterior photos are sent to Anthropic for modeling. The saved house is visible to members of this project.</p>
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
.address-form { display: grid; gap: 0.4rem; }
.address-row, .calibrate-row, .dimension-head, footer { display: flex; align-items: center; gap: 0.5rem; }
.address-row input { flex: 1; min-width: 0; }
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
.status, .matched { color: var(--text); }
fieldset { border: 1px solid var(--border); display: grid; gap: 0.5rem; }
.candidate { display: flex; align-items: baseline; gap: 0.5rem; }
summary { cursor: pointer; color: var(--text-muted); }
details[open] > summary { margin-bottom: 0.5rem; }
.photos-section .help { margin-bottom: 0.5rem; }
.photo-strip { display: flex; gap: 0.75rem; overflow-x: auto; padding: 0.5rem 0; }
.photo-strip > div { display: grid; gap: 0.25rem; }
.photo-strip img { width: 180px; height: 120px; object-fit: contain; background: var(--bg); }
.draft-grid { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 1rem; }
.house-stage { height: 340px; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
.measurements { display: grid; align-content: start; gap: 0.5rem; }
h3 { font-size: 0.8rem; font-weight: 500; margin: 0; flex: 1; }
dl { display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; margin: 0.5rem 0; font-variant-numeric: tabular-nums; }
dt { text-transform: capitalize; color: var(--text-muted); } dd { margin: 0; }
.calibrate-row input { width: 100px; min-width: 0; flex: 1; }
.measurements details label { display: grid; gap: 0.25rem; margin-bottom: 0.5rem; }
.measurements details input { width: 100%; }
a { color: var(--info); }
.sources p { margin-top: 0.4rem; }
.spacer { flex: 1; }
footer { border-top: 1px solid var(--border); padding-top: 0.75rem; flex-wrap: wrap; }
.remove { color: var(--danger); }
@media (max-width: 700px) { .draft-grid { grid-template-columns: 1fr; } .address-row { flex-wrap: wrap; } .address-row input { flex-basis: 100%; } .house-stage { height: 300px; } }
</style>
