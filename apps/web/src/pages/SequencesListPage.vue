<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import MenuButton from "../components/MenuButton.vue";
import ModalPanel from "../components/ModalPanel.vue";
import { confirm } from "../lib/confirm";
import { relativeTime } from "../lib/relativeTime";
import { useRoute, useRouter } from "vue-router";
import { parseXsq } from "@webxlights/formats";
import { describeMapping, mapXsqToBody } from "../lib/xsqConvert";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { api, type MediaRecord, type ModelGroupRecord, type ModelRecord, type SequenceSummary } from "../lib/api";
import { loadPreferences } from "../lib/preferences";
import { decodeAudioFile } from "../lib/audio";
import { checkUploadSize } from "../lib/uploads";
import {
  applyMapping,
  donorRows,
  donorTimingTrackNames,
  mappingTargets,
  type DonorRow,
  type EffectMapping,
  type MappingTarget,
} from "../lib/importMapping";
import ImportMappingDialog from "../components/ImportMappingDialog.vue";
import type { ParsedXsq } from "@webxlights/formats";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));

const sequences = ref<SequenceSummary[]>([]);
// The new-sequence form is a dialog you ask for. The page is the list of what exists; making
// another is the exception, and it should not sit above the file you came for.
const showNew = ref(false);

function lengthOf(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
const name = ref("");
// Seeded from the preference (xLights' "Default Sequence Duration and FPS"), which exists so you
// aren't setting the same two numbers every time.
const newPrefs = loadPreferences(typeof localStorage === "undefined" ? null : localStorage);
const frameMs = ref(newPrefs.defaultFrameMs);
const audioFile = ref<File | null>(null);
// A song already in the project's Files, instead of uploading it again. Loaded when the dialog
// opens; picking one fetches it so its length can be read the same way as a picked file's.
const audioFiles = ref<MediaRecord[]>([]);
const fromFilesId = ref<number | "">("");
const creating = ref(false);
const creationStep = ref("Creating sequence…");
const audioInput = ref<HTMLInputElement | null>(null);
const error = ref("");
const importing = ref(false);
const importMessage = ref("");

const FRAME_OPTIONS = [20, 25, 33, 40, 50]; // SPEC ch6

async function load(): Promise<void> {
  sequences.value = await api.listSequences(projectId.value);
}

async function openNew(): Promise<void> {
  showNew.value = true;
  try {
    audioFiles.value = (await api.listMedia(projectId.value)).filter((f) => f.kind === "audio");
  } catch {
    audioFiles.value = [];
  }
}

// Sequence rows' own actions. A rename is the settings dialog's name field without opening the
// sequencer; delete asks first and never takes the soundtrack, which stays in Files.
const renaming = ref<{ id: number; name: string } | null>(null);

async function commitRename(): Promise<void> {
  const edit = renaming.value;
  if (!edit) return;
  const next = edit.name.trim();
  renaming.value = null;
  if (!next) return;
  await api.updateSequenceSettings(edit.id, { name: next });
  await load();
}

async function deleteSequence(s: SequenceSummary): Promise<void> {
  const ok = await confirm({
    title: `Delete ${s.name}?`,
    message: "The sequence and its saved versions will be removed. Its audio stays in Files. This can't be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteSequence(s.id);
    sequences.value = sequences.value.filter((x) => x.id !== s.id);
  } catch (err) {
    importMessage.value = err instanceof Error ? err.message : "Could not delete that sequence";
  }
}

function onFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  audioFile.value = input.files?.[0] ?? null;
  if (audioFile.value) fromFilesId.value = "";
  if (audioFile.value && !name.value) {
    name.value = audioFile.value.name.replace(/\.[^.]+$/, "");
  }
}

function onFromFilesPicked(): void {
  if (fromFilesId.value === "") return;
  audioFile.value = null;
  const chosen = audioFiles.value.find((f) => f.id === fromFilesId.value);
  if (chosen && !name.value) name.value = chosen.name;
}

async function createSequence(): Promise<void> {
  const chosen = fromFilesId.value === "" ? null : audioFiles.value.find((f) => f.id === fromFilesId.value) ?? null;
  if ((!audioFile.value && !chosen) || !name.value.trim()) return;
  creating.value = true;
  error.value = "";
  try {
    const upload = audioFile.value;
    if (upload) checkUploadSize(upload);
    creationStep.value = "Reading audio…";
    const file = upload ?? (await api.fetchMediaFile(chosen!));
    const buffer = await decodeAudioFile(file);
    const durationMs = Math.round(buffer.duration * 1000);
    let media = chosen;
    if (upload) {
      creationStep.value = "Uploading audio…";
      media = await api.uploadMedia(projectId.value, upload);
      // Keep a successful upload selected if sequence creation fails, so retry reuses it.
      audioFiles.value.push(media);
      fromFilesId.value = media.id;
      audioFile.value = null;
      if (audioInput.value) audioInput.value.value = "";
    }
    creationStep.value = "Creating sequence…";
    const record = await api.createSequence(projectId.value, {
      name: name.value.trim(),
      frame_ms: frameMs.value,
      duration_ms: durationMs,
      audio_filename: file.name,
      media_id: media?.id,
      blend_between_models: newPrefs.defaultBlendBetweenModels,
    });
    router.push({ name: "sequencer", params: { projectId: projectId.value, sequenceId: record.id } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not create sequence";
  } finally {
    creating.value = false;
  }
}

/**
 * A sequence with no soundtrack (xLights' "Media or Animated").
 *
 * The type has existed since Sequence Settings landed, and nothing could produce one: every path
 * to a new sequence went through picking an audio file, so "animated" was a setting you could
 * only reach by changing a sequence that already had a track. Its length comes from the
 * preference, because there is no audio to take it from - which is what that preference is for.
 */
async function createAnimatedSequence(): Promise<void> {
  if (!name.value.trim()) return;
  creationStep.value = "Creating sequence…";
  creating.value = true;
  error.value = "";
  try {
    const record = await api.createSequence(projectId.value, {
      name: name.value.trim(),
      frame_ms: frameMs.value,
      duration_ms: newPrefs.defaultSequenceMs,
      sequence_type: "animated",
      blend_between_models: newPrefs.defaultBlendBetweenModels,
    });
    router.push({ name: "sequencer", params: { projectId: projectId.value, sequenceId: record.id } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not create sequence";
  } finally {
    creating.value = false;
  }
}

// SPEC ch11 §4: import a .xsq. Model rows are matched to the layout's models by exact name
// only (xLights' full mapping dialog with fuzzy/manual matching is a documented ceiling);
// unmatched rows and effects with no param translation are reported, not silently dropped.
// xLights' Tools > Convert: turn a sequence file into another format without opening it.
//
// The mapping is the importer's own (lib/xsqConvert.ts), on purpose: a converter that mapped
// differently would produce an .fseq that didn't match what importing the same file would show,
// and the whole reason to convert rather than import is that you trust the two to agree.
//
// Nothing is written to the project - no sequence is created, nothing is saved. It reads a file
// and hands back a file.
const converting = ref(false);
const convertMessage = ref("");

async function convertXsqToFseq(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  converting.value = true;
  convertMessage.value = "";
  try {
    const parsed = parseXsq(await file.text());
    const layouts = await api.listLayouts(projectId.value);
    const layout = layouts[0];
    const [models, groups, controllers] = await Promise.all([
      layout ? api.listModels(layout.id) : Promise.resolve([]),
      layout ? api.listModelGroups(layout.id) : Promise.resolve([]),
      api.listControllers(projectId.value),
    ]);

    const mapped = mapXsqToBody(parsed, models, groups);
    const name = file.name.replace(/\.xsq$/i, "");
    const bytes = exportSequenceToFseq(
      models,
      mapped.body,
      // The .fseq's frame rate and length come from the file being converted, not from anything
      // in this project - converting must not quietly re-time someone's sequence.
      { id: 0, name, frame_ms: parsed.frameMs, duration_ms: parsed.durationMs } as never,
      controllers,
      undefined,
      groups,
    );
    downloadFseq(bytes, name);
    convertMessage.value = `Converted ${describeMapping(mapped, parsed)}`;
  } catch (err) {
    // A file picker is where the wrong file gets chosen, and an .xsq from a much larger show can
    // legitimately fail to map. Neither is worth taking the page down for.
    convertMessage.value = err instanceof Error ? err.message : "Couldn't convert that file.";
  } finally {
    converting.value = false;
  }
}

// Importing a `.xsq` is two steps now: read the file, then say where its effects land. The
// mapping step is the point of the feature - the manual's own use case is "importing purchased
// sequences from different vendors", where none of the donor's names are yours, and matching by
// name alone silently imported almost nothing.
const pendingImport = ref<{
  parsed: ParsedXsq;
  fileName: string;
  targets: MappingTarget[];
  donors: DonorRow[];
  timingTrackNames: string[];
} | null>(null);

async function importXsq(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  importing.value = true;
  importMessage.value = "";
  try {
    const parsed = parseXsq(await file.text());
    const layouts = await api.listLayouts(projectId.value);
    const layout = layouts[0];
    const [models, groups]: [ModelRecord[], ModelGroupRecord[]] = await Promise.all([
      layout ? api.listModels(layout.id) : Promise.resolve([]),
      layout ? api.listModelGroups(layout.id) : Promise.resolve([]),
    ]);

    const targets = mappingTargets(models, groups);
    if (targets.length === 0) {
      // The manual is blunt about this: "If there are no models or groups displayed on the
      // Sequencer, then you won't be presented with any models to import to."
      importMessage.value = "This project has no models yet, so there's nowhere for the effects to go.";
      return;
    }

    pendingImport.value = {
      parsed,
      fileName: file.name.replace(/\.xsq$/i, ""),
      targets,
      donors: donorRows(parsed),
      timingTrackNames: donorTimingTrackNames(parsed),
    };
  } catch (err) {
    importMessage.value = err instanceof Error ? `Import failed: ${err.message}` : "Import failed";
  } finally {
    importing.value = false;
  }
}

async function confirmImport(mapping: EffectMapping, timingTracks: string[]): Promise<void> {
  const pending = pendingImport.value;
  if (!pending) return;
  pendingImport.value = null;
  importing.value = true;
  try {
    const { parsed, fileName, targets } = pending;
    const applied = applyMapping(parsed, targets, mapping, timingTracks);
    const record = await api.createSequence(projectId.value, {
      name: fileName,
      frame_ms: parsed.frameMs,
      duration_ms: parsed.durationMs,
      audio_filename: parsed.mediaFilename || undefined,
    });
    await api.saveSequenceBody(record.id, applied.body);

    const parts = [`${applied.mappedCount} rows`];
    if (applied.unusedDonorNames.length) {
      parts.push(`left behind: ${applied.unusedDonorNames.join(", ")}`);
    }
    if (parsed.unsupportedEffectNames.length) {
      parts.push(`effects without full param translation: ${parsed.unsupportedEffectNames.join(", ")}`);
    }
    importMessage.value = `Imported ${parts.join(" — ")}`;

    // The sequencer route is where the user actually looks - a message set here would be thrown
    // away by this navigation, so it rides along as a query param instead of vanishing.
    router.push({
      name: "sequencer",
      params: { projectId: projectId.value, sequenceId: record.id },
      query: { importMessage: importMessage.value },
    });
  } catch (err) {
    importMessage.value = err instanceof Error ? `Import failed: ${err.message}` : "Import failed";
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="sequences-page">
    <AppBar :project-id="projectId" active="sequences" />
    <ImportMappingDialog
      v-if="pendingImport"
      :targets="pendingImport.targets"
      :donors="pendingImport.donors"
      :timing-track-names="pendingImport.timingTrackNames"
      :file-name="pendingImport.fileName"
      @cancel="pendingImport = null"
      @confirm="confirmImport"
    />
    <header class="page-toolbar">
      <h1>Sequences</h1>
      <button class="primary" @click="openNew">New sequence</button>
      <label class="btn">
        {{ importing ? "Importing…" : "Import .xsq" }}
        <input type="file" accept=".xsq" @change="importXsq" :disabled="importing" hidden />
      </label>
      <label class="btn" title="Turn an .xsq into an .fseq without creating a sequence">
        {{ converting ? "Converting…" : "Convert .xsq → .fseq" }}
        <input type="file" accept=".xsq" @change="convertXsqToFseq" :disabled="converting" hidden />
      </label>
      <span v-if="importMessage || convertMessage" class="status">{{ importMessage || convertMessage }}</span>
    </header>

    <div class="content">
      <table v-if="sequences.length" class="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Length</th>
            <th>Frame</th>
            <th>Audio</th>
            <th>Edited</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sequences" :key="s.id" @click="router.push({ name: 'sequencer', params: { projectId, sequenceId: s.id } })">
            <td class="name">{{ s.name }}</td>
            <td class="num">{{ lengthOf(s.duration_ms) }}</td>
            <td class="num">{{ Math.round(1000 / s.frame_ms) }} fps</td>
            <td class="muted">{{ s.sequence_type === "animated" ? "Animated" : (s.audio_filename ?? "Audio") }}</td>
            <td class="muted">{{ relativeTime(s.updated_at) }}</td>
            <td class="open" @click.stop>
              <router-link :to="{ name: 'sequencer', params: { projectId, sequenceId: s.id } }" class="btn">Open</router-link>
              <MenuButton
                label="⋯"
                :items="[
                  { label: 'Rename…', run: () => (renaming = { id: s.id, name: s.name }) },
                  { kind: 'separator' },
                  { label: 'Delete…', run: () => deleteSequence(s) },
                ]"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <section v-else class="empty">
        <h2>No sequences yet</h2>
        <p>A sequence is a song and the effects you put to it. Start one from an audio file, or bring one over from xLights.</p>
        <div class="empty-actions">
          <button class="primary" @click="openNew">New sequence</button>
          <label class="btn">
            Import .xsq
            <input type="file" accept=".xsq" @change="importXsq" :disabled="importing" hidden />
          </label>
        </div>
      </section>
    </div>

    <ModalPanel v-if="renaming" title="Rename sequence" @close="renaming = null">
      <form class="new-form" @submit.prevent="commitRename">
        <label>
          <span>Name</span>
          <input v-model="renaming.name" type="text" autofocus />
        </label>
        <div class="new-actions">
          <button type="submit" class="primary" :disabled="!renaming.name.trim()">Rename</button>
          <button type="button" @click="renaming = null">Cancel</button>
        </div>
      </form>
    </ModalPanel>

    <ModalPanel v-if="showNew" id="new-sequence" title="New sequence" @close="showNew = false">
      <div class="new-form">
        <label>
          <span>Audio file</span>
          <input ref="audioInput" type="file" accept="audio/*" :disabled="creating" @change="onFilePicked" />
          <small>The song this sequence is set to, up to 50 MB. Its length becomes the sequence's length.</small>
        </label>
        <label v-if="audioFiles.length">
          <span>Or a song already in Files</span>
          <select v-model="fromFilesId" :disabled="creating" @change="onFromFilesPicked">
            <option value="">Pick one…</option>
            <option v-for="f in audioFiles" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label>
          <span>Name</span>
          <input v-model="name" :disabled="creating" type="text" placeholder="Taken from the audio file if left blank" />
        </label>
        <label>
          <span>Frame interval</span>
          <select v-model.number="frameMs" :disabled="creating">
            <option v-for="f in FRAME_OPTIONS" :key="f" :value="f">{{ f }} ms ({{ Math.round(1000 / f) }} fps)</option>
          </select>
        </label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="new-actions">
          <button class="primary" :disabled="(!audioFile && fromFilesId === '') || !name.trim() || creating" @click="createSequence">
            {{ creating ? creationStep : "Create" }}
          </button>
          <button
            :disabled="!name.trim() || creating"
            :title="`A sequence with no soundtrack, ${Math.round(newPrefs.defaultSequenceMs / 1000)}s long`"
            @click="createAnimatedSequence"
          >
            Create without audio
          </button>
        </div>
      </div>
    </ModalPanel>
  </main>
</template>

<style scoped>
.sequences-page {
  font-family: var(--sans);
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  text-align: left;
}
.status {
  color: var(--text-muted);
}
.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 3rem;
}
.list {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.list th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.list td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.list tbody tr {
  cursor: pointer;
}
.list tbody tr:hover td {
  background: var(--bg-panel);
}
.list tbody tr:hover .name {
  color: var(--accent);
}
.name {
  font-weight: 600;
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.muted {
  color: var(--text-muted);
  max-width: 24rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.open {
  text-align: right;
  width: 1%;
  white-space: nowrap;
}
.open :deep(.menu-button) {
  margin-left: 0.3rem;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 0.45rem;
  color: var(--text-muted);
}
.empty {
  max-width: 52ch;
  margin: 3rem auto;
  padding: 1.5rem 1.75rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
}
.empty h2 {
  margin: 0 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
}
.empty p {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.empty-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
.new-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.new-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.new-form label > span {
  color: var(--text);
}
.new-form small {
  color: var(--text-dim);
}
.new-actions {
  display: flex;
  gap: 0.5rem;
}
.sequences-page button,
.sequences-page .btn,
.sequences-page input[type="text"],
.sequences-page select,
.new-form button,
.new-form input[type="text"],
.new-form select {
  font: inherit;
  font-size: 0.8rem;
  height: 30px;
  padding: 0 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  box-sizing: border-box;
}
.sequences-page button,
.sequences-page .btn,
.new-form button {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  text-decoration: none;
}
.sequences-page button:hover:not(:disabled),
.sequences-page .btn:hover,
.new-form button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.sequences-page .primary,
.new-form .primary:disabled {
  opacity: 0.45;
  color: var(--accent-ink);
}
.sequences-page .primary,
.new-form .primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.sequences-page .primary:hover:not(:disabled),
.new-form .primary:hover:not(:disabled) {
  color: var(--accent-ink);
  filter: brightness(1.05);
}
.sequences-page button:disabled,
.new-form button:disabled {
  color: var(--text-dim);
  cursor: default;
}
.error {
  color: var(--danger);
  font-size: 0.8rem;
  margin: 0;
}
</style>
