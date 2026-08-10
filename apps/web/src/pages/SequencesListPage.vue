<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { parseXsq } from "@webxlights/formats";
import { api, type SequenceSummary } from "../lib/api";
import { decodeAudioFile } from "../lib/audio";
import { newEffectId } from "../stores/sequencer";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));

const sequences = ref<SequenceSummary[]>([]);
const name = ref("");
const frameMs = ref(50);
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
async function importXsq(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importing.value = true;
  importMessage.value = "";
  try {
    const text = await file.text();
    const parsed = parseXsq(text);

    const layouts = await api.listLayouts(projectId.value);
    const layout = layouts[0];
    const models = layout ? await api.listModels(layout.id) : [];
    const modelIdByName = new Map(models.map((m) => [m.name, m.id]));

    const record = await api.createSequence(projectId.value, {
      name: file.name.replace(/\.xsq$/i, ""),
      frame_ms: parsed.frameMs,
      duration_ms: parsed.durationMs,
      audio_filename: parsed.mediaFilename || undefined,
    });

    const unmatchedModels: string[] = [];
    const rows = parsed.rows
      .filter((r) => r.elementType === "model")
      .map((r) => {
        const elementId = modelIdByName.get(r.name);
        if (elementId === undefined) {
          unmatchedModels.push(r.name);
          return null;
        }
        return {
          elementType: "model" as const,
          elementId,
          effects: r.effects.map((eff) => ({
            id: newEffectId(),
            name: eff.name,
            startMs: eff.startMs,
            endMs: eff.endMs,
            params: eff.params as Record<string, number | boolean | string>,
          })),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const timingTracks = parsed.rows
      .filter((r) => r.elementType === "timing")
      .map((r) => ({ name: r.name, marks: r.effects.map((e) => e.startMs) }));

    await api.saveSequenceBody(record.id, { rows, timingTracks });

    const parts = [`Imported ${rows.length} model rows`];
    if (unmatchedModels.length) parts.push(`${unmatchedModels.length} model names had no match in this layout: ${unmatchedModels.join(", ")}`);
    if (parsed.unsupportedEffectNames.length) parts.push(`effects imported without full param translation: ${parsed.unsupportedEffectNames.join(", ")}`);
    importMessage.value = parts.join(" — ");

    router.push({ name: "sequencer", params: { projectId: projectId.value, sequenceId: record.id } });
  } catch (err) {
    importMessage.value = err instanceof Error ? `Import failed: ${err.message}` : "Import failed";
  } finally {
    importing.value = false;
    input.value = "";
  }
}

onMounted(load);
</script>

<template>
  <main class="sequences-page">
    <header>
      <router-link :to="`/projects/${projectId}/layout`">&larr; Layout</router-link>
      <h1>Sequences</h1>
      <label class="import-btn">
        {{ importing ? "Importing..." : "Import .xsq" }}
        <input type="file" accept=".xsq" @change="importXsq" :disabled="importing" hidden />
      </label>
    </header>
    <p v-if="importMessage" class="import-message">{{ importMessage }}</p>

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
  max-width: 480px;
  margin: 2rem auto;
  padding: 0 1rem;
}
header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1rem;
}
.import-btn {
  margin-left: auto;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  border: 1px solid #555;
  border-radius: 4px;
  font-size: 0.8rem;
}
.import-message {
  font-size: 0.8rem;
  color: #aaa;
  margin: 0 0 1rem;
}
.new-sequence {
  border: 1px solid #333;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.new-sequence h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}
.new-sequence label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.error {
  color: #c0392b;
}
.list {
  list-style: none;
  padding: 0;
}
.list li {
  padding: 0.4rem 0;
}
.meta {
  color: #888;
  font-size: 0.8rem;
  margin-left: 0.5rem;
}
.empty {
  color: #666;
}
</style>
