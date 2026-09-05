<script setup lang="ts">
import { computed, ref } from "vue";
import {
  MAPPING_FILE_EXTENSION,
  autoMapping,
  mergeMapping,
  parseMappingFile,
  serializeMapping,
  unusedDonors,
  type DonorRow,
  type EffectMapping,
  type MappingTarget,
} from "../lib/importMapping";

// xLights' Import Effects mapping dialog (manual: Menus > Import).
//
// Its own is drag-and-drop between two lists. This is a select per row, which is the same
// operation — say where this model's effects come from — and works with a keyboard and on a
// touchscreen, neither of which drag-and-drop between two scrolling lists does well.
//
// The donor's effect counts are shown because that is what the choice is made on: a row with two
// effects and a row with two hundred look identical by name.

const props = defineProps<{
  targets: MappingTarget[];
  donors: DonorRow[];
  timingTrackNames: string[];
  fileName: string;
}>();
const emit = defineEmits<{
  confirm: [mapping: EffectMapping, timingTracks: string[]];
  cancel: [];
}>();

const mapping = ref<EffectMapping>(autoMapping(props.targets, props.donors));
const chosenTimingTracks = ref<string[]>([...props.timingTrackNames]);
const loadMessage = ref("");

const donorByName = computed(() => new Map(props.donors.map((d) => [d.name, d])));
const usedDonorNames = computed(() => new Set(Object.values(mapping.value)));
const mappedCount = computed(
  () => Object.entries(mapping.value).filter(([, donor]) => (donorByName.value.get(donor)?.effectCount ?? 0) > 0).length,
);
const leftBehind = computed(() => unusedDonors(props.donors, mapping.value));

function setMapping(key: string, donorName: string): void {
  const next = { ...mapping.value };
  if (donorName) next[key] = donorName;
  else delete next[key];
  mapping.value = next;
}

function clearAll(): void {
  mapping.value = {};
}

function autoMap(): void {
  mapping.value = autoMapping(props.targets, props.donors);
}

function toggleTimingTrack(name: string, on: boolean): void {
  chosenTimingTracks.value = on
    ? [...chosenTimingTracks.value, name]
    : chosenTimingTracks.value.filter((t) => t !== name);
}

function saveMapping(): void {
  const blob = new Blob([serializeMapping(mapping.value, chosenTimingTracks.value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.fileName.replace(/[^a-z0-9._ -]/gi, "_") || "mapping"}${MAPPING_FILE_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadMapping(e: Event, mode: "replace" | "add"): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const loaded = parseMappingFile(await file.text());
  if (!loaded) {
    loadMessage.value = "That file isn't a saved mapping.";
    return;
  }
  mapping.value = mergeMapping(mapping.value, loaded.mapping, mode);
  if (loaded.timingTracks.length > 0) chosenTimingTracks.value = loaded.timingTracks;
  const kept = Object.keys(loaded.mapping).filter((k) => props.targets.some((t) => t.key === k)).length;
  loadMessage.value =
    kept === Object.keys(loaded.mapping).length
      ? `Loaded ${kept} mappings.`
      : `Loaded ${kept} of ${Object.keys(loaded.mapping).length} mappings — the rest name models this layout hasn't got.`;
}
</script>

<template>
  <div class="mapping-backdrop">
    <div class="mapping-dialog">
      <header>
        <h2>Import effects from {{ fileName }}</h2>
        <p class="hint">
          Say where each of your models gets its effects from. Names are matched for you where they
          line up, which for a sequence built on someone else's layout is usually nowhere — the
          numbers next to each donor row are how many effects it has.
        </p>
      </header>

      <div class="mapping-actions">
        <button @click="autoMap">Match by name</button>
        <button @click="clearAll">Clear all</button>
        <button @click="saveMapping">Save mapping</button>
        <label class="file-button">
          Load (replace)
          <input type="file" accept=".json" @change="loadMapping($event, 'replace')" />
        </label>
        <label class="file-button">
          Load (add)
          <input type="file" accept=".json" @change="loadMapping($event, 'add')" />
        </label>
        <span v-if="loadMessage" class="hint">{{ loadMessage }}</span>
      </div>

      <div class="mapping-body">
        <div class="mapping-list">
          <table>
            <thead>
              <tr><th>Your model</th><th>Gets effects from</th></tr>
            </thead>
            <tbody>
              <tr v-for="target in targets" :key="target.key">
                <td :class="{ group: target.elementType === 'group' }">{{ target.name }}</td>
                <td>
                  <select :value="mapping[target.key] ?? ''" @change="setMapping(target.key, ($event.target as HTMLSelectElement).value)">
                    <option value="">—</option>
                    <!-- A donor row already in use stays selectable: xLights greys them but keeps
                         them usable, because one donor prop often drives several of yours. -->
                    <option v-for="donor in donors" :key="donor.name" :value="donor.name" :class="{ used: usedDonorNames.has(donor.name) }">
                      {{ donor.name }} ({{ donor.effectCount }})
                    </option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="timing-list">
          <h3>Timing tracks</h3>
          <label v-for="name in timingTrackNames" :key="name" class="timing-check">
            <input type="checkbox" :checked="chosenTimingTracks.includes(name)" @change="toggleTimingTrack(name, ($event.target as HTMLInputElement).checked)" />
            {{ name }}
          </label>
          <p v-if="timingTrackNames.length === 0" class="hint">This sequence has none.</p>
        </div>
      </div>

      <footer>
        <span class="hint">
          {{ mappedCount }} of {{ targets.length }} mapped<template v-if="leftBehind.length">
            — leaving behind {{ leftBehind.length }} donor {{ leftBehind.length === 1 ? "row" : "rows" }} with effects
          </template>
        </span>
        <span class="footer-actions">
          <button @click="emit('cancel')">Cancel</button>
          <button class="primary" @click="emit('confirm', mapping, chosenTimingTracks)">Import</button>
        </span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Same chrome as every other panel (DESIGN.md): dark, one accent, tokens only. */
.mapping-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.mapping-dialog {
  background: var(--bg-panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel, 0 12px 40px rgba(0, 0, 0, 0.55));
  padding: 0.9rem;
  width: min(48rem, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;
}
h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
h3 {
  margin: 0 0 0.3rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted);
}
.hint {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.mapping-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}
.file-button {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  padding: 0.15rem 0.4rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.file-button input {
  display: none;
}
.mapping-body {
  display: flex;
  gap: 0.8rem;
  overflow: hidden;
}
.mapping-list {
  flex: 1 1 auto;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
th {
  text-align: left;
  font-weight: 500;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-strong);
  padding: 0.25rem 0.2rem;
}
td {
  padding: 0.15rem 0.2rem;
  border-bottom: 1px solid var(--border);
}
/* Groups are blue in xLights' own dialog, and telling them apart matters: mapping onto a group
   spreads one donor row across every prop in it. */
td.group {
  color: var(--info);
}
td select {
  width: 100%;
}
option.used {
  color: var(--text-dim);
}
.timing-list {
  flex: 0 0 12rem;
  overflow: auto;
}
.timing-check {
  display: block;
  font-size: 0.75rem;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.footer-actions {
  display: flex;
  gap: 0.3rem;
}
.primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  font-weight: 500;
}
</style>
