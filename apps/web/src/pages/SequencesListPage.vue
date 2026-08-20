<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import TabNav from "../components/TabNav.vue";
import { useRoute, useRouter } from "vue-router";
import { parseXsq } from "@webxlights/formats";
import { describeMapping, mapXsqToBody } from "../lib/xsqConvert";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { api, type ModelGroupRecord, type ModelRecord, type SequenceSummary } from "../lib/api";
import { loadPreferences } from "../lib/preferences";
import { decodeAudioFile } from "../lib/audio";
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
const name = ref("");
// Seeded from the preference (xLights' "Default Sequence Duration and FPS"), which exists so you
// aren't setting the same two numbers every time.
const newPrefs = loadPreferences(typeof localStorage === "undefined" ? null : localStorage);
const frameMs = ref(newPrefs.defaultFrameMs);
const audioFile = ref<File | null>(null);
const creating = ref(false);
const error = ref("");
const importing = ref(false);
const importMessage = ref("");

const FRAME_OPTIONS = [20, 25, 33, 40, 50]; // SPEC ch6

async function load(): Promise<void> {
  sequences.value = await api.listSequences(projectId.value);
}

function onFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  audioFile.value = input.files?.[0] ?? null;
  if (audioFile.value && !name.value) {
    name.value = audioFile.value.name.replace(/\.[^.]+$/, "");
  }
}

async function createSequence(): Promise<void> {
  if (!audioFile.value || !name.value.trim()) return;
  creating.value = true;
  error.value = "";
  try {
    const buffer = await decodeAudioFile(audioFile.value);
    const durationMs = Math.round(buffer.duration * 1000);
    const record = await api.createSequence(projectId.value, {
      name: name.value.trim(),
      frame_ms: frameMs.value,
      duration_ms: durationMs,
      audio_filename: audioFile.value.name,
      blend_between_models: newPrefs.defaultBlendBetweenModels,
    });
    await api.uploadSequenceAudio(record.id, audioFile.value);
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
    <ImportMappingDialog
      v-if="pendingImport"
      :targets="pendingImport.targets"
      :donors="pendingImport.donors"
      :timing-track-names="pendingImport.timingTrackNames"
      :file-name="pendingImport.fileName"
      @cancel="pendingImport = null"
      @confirm="confirmImport"
    />
    <header>
      <TabNav :project-id="projectId" active="sequences" />
      <h1>Sequences</h1>
      <label class="import-btn">
        {{ importing ? "Importing..." : "Import .xsq" }}
        <input type="file" accept=".xsq" @change="importXsq" :disabled="importing" hidden />
      </label>
      <label class="import-btn" title="Turn an .xsq into an .fseq without creating a sequence">
        {{ converting ? "Converting..." : "Convert .xsq → .fseq" }}
        <input type="file" accept=".xsq" @change="convertXsqToFseq" :disabled="converting" hidden />
      </label>
    </header>
    <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
    <p v-if="convertMessage" class="import-message">{{ convertMessage }}</p>

    <section class="new-sequence">
      <h2>New sequence</h2>
      <label>
        Audio file
        <input type="file" accept="audio/*" @change="onFilePicked" />
      </label>
      <label>
        Name
        <input v-model="name" type="text" />
      </label>
      <label>
        Frame interval
        <select v-model.number="frameMs">
          <option v-for="f in FRAME_OPTIONS" :key="f" :value="f">{{ f }}ms ({{ Math.round(1000 / f) }}fps)</option>
        </select>
      </label>
      <button
        class="secondary"
        :disabled="!name.trim() || creating"
        :title="`A sequence with no soundtrack, ${Math.round(newPrefs.defaultSequenceMs / 1000)}s long`"
        @click="createAnimatedSequence"
      >
        Animated (no audio)
      </button>
      <button :disabled="!audioFile || !name.trim() || creating" @click="createSequence">
        {{ creating ? "Decoding audio..." : "Create" }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <ul class="list">
      <li v-for="s in sequences" :key="s.id">
        <router-link :to="{ name: 'sequencer', params: { projectId, sequenceId: s.id } }">
          {{ s.name }} <span class="meta">{{ s.frame_ms }}ms &middot; {{ (s.duration_ms / 1000).toFixed(1) }}s</span>
        </router-link>
      </li>
      <li v-if="sequences.length === 0" class="empty">No sequences yet.</li>
    </ul>
  </main>
</template>

<style scoped>
.sequences-page {
  font-family: system-ui, sans-serif;
  min-height: 100vh;
  background: #0d0d11;
  color: #ddd;
}
header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #333;
  background: #16161c;
}
header a {
  color: #e8c468;
}
header h1 {
  font-size: 1.1rem;
  margin: 0;
  color: #ddd;
  font-weight: 600;
}
.import-btn {
  margin-left: auto;
  cursor: pointer;
  padding: 0.4rem 0.85rem;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 0.8rem;
  background: #1e1e26;
  color: #ddd;
}
.import-btn:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.import-message {
  font-size: 0.8rem;
  color: #aaa;
  margin: 0;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid #333;
}
.sequences-page > .new-sequence,
.sequences-page > .list {
  max-width: 480px;
  margin: 0 auto;
}
.new-sequence {
  border: 1px solid #333;
  background: #16161c;
  border-radius: 8px;
  padding: 1.25rem;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.new-sequence h2 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  color: #ddd;
  font-weight: 600;
}
.new-sequence label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: #aaa;
}
.new-sequence button {
  padding: 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  border-radius: 5px;
  background: #e8c468;
  color: #111;
  cursor: pointer;
}
.new-sequence button:disabled {
  background: #3a3624;
  color: #777;
  cursor: default;
}
.error {
  margin: 0;
  color: #e57373;
  font-size: 0.8rem;
}
.list {
  list-style: none;
  padding: 0 1.25rem 1.5rem;
  margin: 0;
}
.list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #222;
}
.list li:last-child {
  border-bottom: none;
}
.list a {
  color: #ddd;
}
.list a:hover {
  color: #e8c468;
}
.meta {
  color: #888;
  font-size: 0.8rem;
  margin-left: 0.5rem;
}
.empty {
  color: #666;
  padding: 0.5rem 0;
}
</style>
