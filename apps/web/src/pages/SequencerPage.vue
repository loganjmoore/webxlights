<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { EFFECT_SCHEMAS, defaultParamsFor } from "@webxlights/engine";
import { api, type ModelRecord, type ModelGroupRecord, type SequenceEffect, type SequenceVersion } from "../lib/api";
import { computePeaks, decodeAudioFile, type PeakBucket } from "../lib/audio";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { newEffectId, useSequencerStore } from "../stores/sequencer";
import SequencerGrid, { type GridRow } from "../components/SequencerGrid.vue";
import Waveform from "../components/Waveform.vue";
import EffectPropsPanel from "../components/EffectPropsPanel.vue";
import HousePreview from "../components/HousePreview.vue";

const route = useRoute();
const sequenceId = computed(() => Number(route.params.sequenceId));
const store = useSequencerStore();

const rows = ref<GridRow[]>([]);
const modelRecords = ref<ModelRecord[]>([]);
const peaks = ref<PeakBucket[]>([]);
const audioEl = ref<HTMLAudioElement | null>(null);
const audioUrl = ref<string | null>(null);
const audioLoaded = ref(false);
const playheadMs = ref(0);
const playing = ref(false);
const pendingEffectName = ref<string | null>(null);
const zoomLevel = ref(1); // 1 of 3 zoom levels: 0.5x / 1x / 2x
const ZOOM_STEPS = [0.5, 1, 2];
const clipboard = ref<SequenceEffect | null>(null);
const versions = ref<SequenceVersion[]>([]);
const showHistory = ref(false);

const pxPerMs = computed(() => {
  const containerWidth = 1200; // fit-to-width baseline before zoom
  const duration = store.sequence?.duration_ms || 1;
  return (containerWidth / duration) * ZOOM_STEPS[zoomLevel.value]!;
});

const selectedEffect = computed(() => (store.selectedEffectId ? store.findEffect(store.selectedEffectId) : null));

async function loadRows(): Promise<void> {
  // The sequencer needs a project's layout; fetch it via the sequence's project.
  const layouts = await api.listLayouts(Number(route.params.projectId));
  const layout = layouts[0];
  if (!layout) return;
  const [models, groups]: [ModelRecord[], ModelGroupRecord[]] = await Promise.all([
    api.listModels(layout.id),
    api.listModelGroups(layout.id),
  ]);
  rows.value = [
    ...models.map((m) => ({ elementType: "model" as const, elementId: m.id, name: m.name })),
    ...groups.map((g) => ({ elementType: "group" as const, elementId: g.id, name: g.name })),
  ];
  modelRecords.value = models;
}

function onAudioFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loadAudioFile(file);
}

async function loadAudioFile(file: File): Promise<void> {
  const buffer = await decodeAudioFile(file);
  peaks.value = computePeaks(buffer, 800);
  audioUrl.value = URL.createObjectURL(file);
  audioLoaded.value = true;
}

function togglePlay(): void {
  const el = audioEl.value;
  if (!el) return;
  if (playing.value) el.pause();
  else void el.play();
}

function stop(): void {
  const el = audioEl.value;
  if (!el) return;
  el.pause();
  el.currentTime = 0;
  playheadMs.value = 0;
}

function seekTo(ms: number): void {
  const el = audioEl.value;
  playheadMs.value = ms;
  if (el) el.currentTime = ms / 1000;
}

function onTimeUpdate(): void {
  if (audioEl.value) playheadMs.value = Math.round(audioEl.value.currentTime * 1000);
}

function armEffect(name: string): void {
  pendingEffectName.value = pendingEffectName.value === name ? null : name;
}

function handlePlace(row: GridRow, startMs: number, endMs: number): void {
  if (!pendingEffectName.value) return;
  store.addEffect(row.elementType, row.elementId, {
    id: newEffectId(),
    name: pendingEffectName.value,
    startMs,
    endMs,
    params: defaultParamsFor(pendingEffectName.value),
  });
  pendingEffectName.value = null;
}

function handleMove(effectId: string, startMs: number, endMs: number): void {
  store.updateEffect(effectId, { startMs, endMs });
}

function handleSelect(effectId: string | null): void {
  store.selectedEffectId = effectId;
}

function handleParamsUpdate(params: Record<string, number | boolean | string>): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { params });
}

function addTimingMarkAtPlayhead(): void {
  store.ensureDefaultTimingTrack();
  store.addTimingMark(0, playheadMs.value);
}

function exportFseq(): void {
  if (!store.sequence) return;
  const bytes = exportSequenceToFseq(modelRecords.value, store.body, store.sequence);
  downloadFseq(bytes, store.sequence.name);
}

async function toggleHistory(): Promise<void> {
  showHistory.value = !showHistory.value;
  if (showHistory.value && store.sequence) versions.value = await api.listVersions(store.sequence.id);
}

async function snapshotNow(): Promise<void> {
  if (!store.sequence) return;
  const v = await api.snapshotVersion(store.sequence.id);
  versions.value = [v, ...versions.value];
}

async function restoreVersion(versionId: number): Promise<void> {
  if (!store.sequence) return;
  await api.restoreVersion(store.sequence.id, versionId);
  await store.load(store.sequence.id);
  showHistory.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;

  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "Home") {
    seekTo(0);
  } else if (e.key === "t") {
    addTimingMarkAtPlayhead();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (store.selectedEffectId) store.deleteEffect(store.selectedEffectId);
  } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
    if (store.selectedEffectId) clipboard.value = store.copyEffect(store.selectedEffectId);
  } else if ((e.metaKey || e.ctrlKey) && e.key === "v") {
    if (clipboard.value) {
      const row = rows.value[0];
      if (row) store.pasteEffectAt(row.elementType, row.elementId, clipboard.value, playheadMs.value);
    }
  }
}

onMounted(async () => {
  await Promise.all([store.load(sequenceId.value), loadRows()]);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
});
watch(sequenceId, async (id) => {
  await store.load(id);
  audioLoaded.value = false;
});
</script>

<template>
  <main class="sequencer-page">
    <header>
      <router-link :to="`/projects/${route.params.projectId}/sequences`">&larr; Sequences</router-link>
      <h1>{{ store.sequence?.name }}</h1>
      <div class="transport">
        <button @click="togglePlay" :disabled="!audioLoaded">{{ playing ? "Pause" : "Play" }}</button>
        <button @click="stop" :disabled="!audioLoaded">Stop</button>
        <span class="time">{{ (playheadMs / 1000).toFixed(2) }}s</span>
      </div>
      <div class="undo">
        <button @click="store.undo" :disabled="!store.canUndo">Undo</button>
        <button @click="store.redo" :disabled="!store.canRedo">Redo</button>
      </div>
      <select v-model.number="zoomLevel">
        <option :value="0">0.5x</option>
        <option :value="1">1x</option>
        <option :value="2">2x</option>
      </select>
      <button @click="exportFseq" :disabled="!store.sequence">Export .fseq</button>
      <button @click="snapshotNow" :disabled="!store.sequence">Snapshot</button>
      <button @click="toggleHistory" :disabled="!store.sequence">History</button>
      <span class="save-status">{{ store.saveStatus }}</span>
    </header>

    <div v-if="store.saveStatus === 'conflict'" class="conflict-banner">
      <p>Someone else saved this sequence since you last loaded it. Keep your local changes, or take theirs?</p>
      <button @click="store.keepMine">Keep mine</button>
      <button @click="store.takeTheirs">Take theirs</button>
    </div>

    <div v-if="showHistory" class="history-panel">
      <h2>Version history</h2>
      <ul>
        <li v-for="v in versions" :key="v.id">
          <span>#{{ v.number }} — {{ v.creator?.name ?? "unknown" }} — {{ new Date(v.created_at).toLocaleString() }}</span>
          <button @click="restoreVersion(v.id)">Restore</button>
        </li>
        <li v-if="versions.length === 0" class="empty">No snapshots yet — click "Snapshot" to create one.</li>
      </ul>
    </div>

    <div v-if="!audioLoaded" class="reselect-audio">
      <p>Re-select the audio file for this sequence (audio isn't stored server-side yet — see DECISIONS.md).</p>
      <input type="file" accept="audio/*" @change="onAudioFilePicked" />
    </div>

    <audio
      v-if="audioUrl"
      ref="audioEl"
      :src="audioUrl"
      @play="playing = true"
      @pause="playing = false"
      @timeupdate="onTimeUpdate"
      @ended="playing = false"
    ></audio>

    <div class="palette">
      <span class="palette-label">Effects:</span>
      <button
        v-for="name in Object.keys(EFFECT_SCHEMAS)"
        :key="name"
        :class="{ armed: pendingEffectName === name }"
        @click="armEffect(name)"
      >
        {{ name }}
      </button>
      <span v-if="pendingEffectName" class="hint">Drag on a row to place "{{ pendingEffectName }}"</span>
    </div>

    <div class="editor">
      <div class="timeline">
        <div class="preview-wrap">
          <HousePreview :models="modelRecords" :body="store.body" :playhead-ms="playheadMs" :frame-ms="store.sequence?.frame_ms ?? 50" />
        </div>
        <Waveform :peaks="peaks" :duration-ms="store.sequence?.duration_ms ?? 0" :px-per-ms="pxPerMs" :playhead-ms="playheadMs" @seek="seekTo" />
        <div class="grid-scroll">
          <SequencerGrid
            :rows="rows"
            :body="store.body"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            :selected-effect-id="store.selectedEffectId"
            :pending-effect-name="pendingEffectName"
            @select="handleSelect"
            @place="handlePlace"
            @move="handleMove"
            @seek="seekTo"
          />
        </div>
      </div>
      <aside class="props">
        <EffectPropsPanel :effect="selectedEffect" @update="handleParamsUpdate" />
      </aside>
    </div>
  </main>
</template>

<style scoped>
.sequencer-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #ddd;
}
header {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  gap: 1rem;
}
header h1 {
  font-size: 1rem;
  margin: 0;
}
.transport,
.undo {
  display: flex;
  gap: 0.4rem;
}
.time {
  font-variant-numeric: tabular-nums;
  color: #888;
}
.save-status {
  margin-left: auto;
  font-size: 0.75rem;
  color: #666;
  text-transform: capitalize;
}
.reselect-audio {
  padding: 0.75rem 1rem;
  background: #241f10;
  font-size: 0.85rem;
}
.conflict-banner {
  padding: 0.6rem 1rem;
  background: #3a1f1f;
  border-bottom: 1px solid #5a2f2f;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}
.conflict-banner p {
  margin: 0;
  flex: 1;
}
.history-panel {
  padding: 0.6rem 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  font-size: 0.85rem;
  max-height: 200px;
  overflow-y: auto;
}
.history-panel h2 {
  font-size: 0.85rem;
  margin: 0 0 0.4rem;
  color: #888;
}
.history-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-panel li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0;
}
.history-panel .empty {
  color: #666;
}
.palette {
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-bottom: 1px solid #333;
}
.palette-label {
  color: #888;
  font-size: 0.8rem;
}
.palette button.armed {
  background: #e8c468;
  color: #111;
}
.hint {
  color: #e8c468;
  font-size: 0.8rem;
}
.editor {
  flex: 1;
  display: flex;
  min-height: 0;
}
.timeline {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}
.preview-wrap {
  height: 220px;
  border-bottom: 1px solid #333;
}
.grid-scroll {
  overflow-x: auto;
}
.props {
  width: 240px;
  border-left: 1px solid #333;
  overflow-y: auto;
}
</style>
