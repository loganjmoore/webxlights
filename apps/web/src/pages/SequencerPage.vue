<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { EFFECT_SCHEMAS, defaultParamsFor, type AudioSeries, type BlendMode, type LayerSettings, type StoredSwatch, type TransitionSpec } from "@webxlights/engine";
import { api, type ControllerRecord, type EffectParamValue, type ModelRecord, type ModelGroupRecord, type SequenceEffect, type SequenceVersion } from "../lib/api";
import { computePeaks, decodeAudioFile, type PeakBucket } from "../lib/audio";
import { analyzeAudioBuffer } from "../lib/audioAnalysis";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { FPP_CONNECT_ENABLED, getFppSystemInfo, isChromiumLanCapable, syncPlaylist, uploadFseqToFpp, type FppSystemInfo } from "../lib/fppConnect";
import { takePendingDemoAudio } from "../lib/demoProject";
import { openPreviewChannel, postPreviewMessage, previewUrlFor, type PreviewMessage } from "../lib/previewChannel";
import { newEffectId, useSequencerStore } from "../stores/sequencer";
import SequencerGrid, { type ContextMenuTarget, type GridRow } from "../components/SequencerGrid.vue";
import EffectContextMenu from "../components/EffectContextMenu.vue";
import Waveform from "../components/Waveform.vue";
import EffectPropsPanel from "../components/EffectPropsPanel.vue";
import HousePreview from "../components/HousePreview.vue";

const route = useRoute();
const router = useRouter();
const sequenceId = computed(() => Number(route.params.sequenceId));
const store = useSequencerStore();
const importMessage = ref(typeof route.query.importMessage === "string" ? route.query.importMessage : "");

const rows = ref<GridRow[]>([]);
const modelRecords = ref<ModelRecord[]>([]);
const groupRecords = ref<ModelGroupRecord[]>([]);
// Which rows are shown on the grid - a workspace/view preference (like which panels are open),
// not sequence data, so it lives in localStorage per sequence rather than in the sequence body:
// hiding a row here never touches its effects, and doesn't need to round-trip through .xsq
// import/export or collaborate across users the way real sequence content does.
const hiddenRowKeys = ref<Set<string>>(new Set());
const showModelsPanel = ref(false);
const controllers = ref<ControllerRecord[]>([]);
const exportError = ref<string | null>(null);
const peaks = ref<PeakBucket[]>([]);
const audioEl = ref<HTMLAudioElement | null>(null);
const audioUrl = ref<string | null>(null);
const audioLoaded = ref(false);
// The analysed track that audio-reactive effects (VU Meter) render against. Analysis is offline
// and happens once per load, not per frame: the preview, the popped-out preview and the .fseq
// export all read the same precomputed numbers, so the same effect renders identically in all
// three (SPEC ch10/16 determinism - a live AnalyserNode would give a different answer each run).
// shallowRef, not ref: a plain ref would wrap thousands of analysed frames in reactive proxies,
// and a proxy is not structured-cloneable - postMessage to the popped-out preview throws
// "could not be cloned" on it. Nothing reads inside the series reactively anyway; it is
// replaced wholesale when a track is analysed.
const audioSeries = shallowRef<AudioSeries | null>(null);
const analyzingAudio = ref(false);
const playheadMs = ref(0);
const playing = ref(false);
const pendingEffectName = ref<string | null>(null);
const zoomLevel = ref(1); // 1 of 3 zoom levels: 0.5x / 1x / 2x
const ZOOM_STEPS = [0.5, 1, 2];
const clipboard = ref<SequenceEffect | null>(null);
const versions = ref<SequenceVersion[]>([]);
const showHistory = ref(false);
const contextMenu = ref<{ x: number; y: number; items: { label: string; action: string }[]; target: ContextMenuTarget } | null>(null);

const showTimingPanel = ref(false);
const timingGenerateMode = ref<"interval" | "bpm">("interval");
const timingIntervalMs = ref(50);
const timingBpm = ref(120);

// M15.6: real xLights' "New Timing" generator (25ms/50ms/100ms fixed-interval, Metronome BPM).
// Always adds a new named track (never overwrites trackIndex 0 - a real imported sequence's
// first track is commonly something meaningful like "Beats", not a generic placeholder).
function generateTimingTrack(): void {
  const isBpm = timingGenerateMode.value === "bpm";
  const ms = isBpm ? Math.round(60000 / timingBpm.value) : timingIntervalMs.value;
  const name = isBpm ? `Metronome ${timingBpm.value}bpm` : `${timingIntervalMs.value}ms`;
  store.generateTimingMarks(name, ms);
}

const showFppPanel = ref(false);
const fppChromiumCapable = isChromiumLanCapable();
const fppHost = ref("");
const fppSystemInfo = ref<FppSystemInfo | null>(null);
const fppPlaylistName = ref("");
const fppStatus = ref("");
const fppBusy = ref(false);

const pxPerMs = computed(() => {
  const containerWidth = 1200; // fit-to-width baseline before zoom
  const duration = store.sequence?.duration_ms || 1;
  return (containerWidth / duration) * ZOOM_STEPS[zoomLevel.value]!;
});

const selectedEffect = computed(() => (store.selectedEffectId ? store.findEffect(store.selectedEffectId) : null));

function rowKey(row: GridRow): string {
  return `${row.elementType}:${row.elementId}:${row.subName ?? ""}`;
}
function hiddenStorageKey(): string {
  return `webxlights.sequencer.hiddenRows.${sequenceId.value}`;
}
function loadHiddenRows(): void {
  try {
    const raw = localStorage.getItem(hiddenStorageKey());
    hiddenRowKeys.value = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    hiddenRowKeys.value = new Set();
  }
}
function saveHiddenRows(): void {
  localStorage.setItem(hiddenStorageKey(), JSON.stringify([...hiddenRowKeys.value]));
}
function toggleRowVisible(row: GridRow): void {
  const key = rowKey(row);
  const next = new Set(hiddenRowKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hiddenRowKeys.value = next;
  saveHiddenRows();
}
function showAllRows(): void {
  hiddenRowKeys.value = new Set();
  saveHiddenRows();
}
function hideAllRows(): void {
  hiddenRowKeys.value = new Set(rows.value.map(rowKey));
  saveHiddenRows();
}
const visibleRows = computed(() => rows.value.filter((r) => !hiddenRowKeys.value.has(rowKey(r))));
function effectCountFor(row: GridRow): number {
  const found = store.body.rows.find(
    (r) => r.elementType === row.elementType && r.elementId === row.elementId && (r.subName ?? undefined) === row.subName,
  );
  return found?.effects.length ?? 0;
}

async function loadRows(): Promise<void> {
  // The sequencer needs a project's layout; fetch it via the sequence's project.
  const layouts = await api.listLayouts(Number(route.params.projectId));
  const layout = layouts[0];
  if (!layout) return;
  const [models, groups]: [ModelRecord[], ModelGroupRecord[]] = await Promise.all([
    api.listModels(layout.id),
    api.listModelGroups(layout.id),
  ]);
  // Sub-model rows sit directly under the model they belong to, which is where xLights puts
  // them and where anyone looking for "the star on the mega tree" will look for them.
  rows.value = [
    ...models.flatMap((m) => [
      { elementType: "model" as const, elementId: m.id, name: m.name },
      ...(m.sub_models ?? []).map((sm) => ({
        elementType: "submodel" as const,
        elementId: m.id,
        subName: sm.name,
        name: `${m.name} / ${sm.name}`,
      })),
    ]),
    ...groups.map((g) => ({ elementType: "group" as const, elementId: g.id, name: g.name })),
  ];
  modelRecords.value = models;
  groupRecords.value = groups;
  controllers.value = await api.listControllers(Number(route.params.projectId));
  loadHiddenRows();
}

function onAudioFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loadAudioFile(file);
  // Re-selecting manually (old sequence created before server-side storage, or the
  // stored copy failed to fetch) — persist it so this doesn't happen again next time.
  void api.uploadSequenceAudio(sequenceId.value, file);
}

async function loadAudioFile(file: File): Promise<void> {
  const buffer = await decodeAudioFile(file);
  peaks.value = computePeaks(buffer, 800);
  audioUrl.value = URL.createObjectURL(file);
  audioLoaded.value = true;
  startAudioAnalysis(buffer);
}

// One FFT per frame over the whole track is a second or so of straight-line work on a long
// song. Deferring it past a paint means the waveform and transport are usable immediately and
// the analysis lands a moment later, instead of the tab freezing on load with nothing drawn.
function startAudioAnalysis(buffer: AudioBuffer): void {
  analyzingAudio.value = true;
  audioSeries.value = null;
  const frameMs = store.sequence?.frame_ms ?? 50;
  setTimeout(() => {
    try {
      audioSeries.value = analyzeAudioBuffer(buffer, frameMs);
      postPreviewMessage(previewChannel, previewAudioMessage());
    } finally {
      analyzingAudio.value = false;
    }
  }, 0);
}

// Fetches the copy SequenceController@audio serves back and feeds it through the same
// decode path as a manual file pick — the sequencer doesn't care where the File came from.
async function loadStoredAudio(): Promise<boolean> {
  try {
    const res = await fetch(api.sequenceAudioUrl(sequenceId.value), { credentials: "include" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const file = new File([blob], store.sequence?.audio_filename ?? "audio", { type: blob.type });
    await loadAudioFile(file);
    return true;
  } catch {
    return false;
  }
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
  store.addEffect(row.elementType, row.elementId, row.subName, {
    id: newEffectId(),
    name: pendingEffectName.value,
    startMs,
    endMs,
    params: defaultParamsFor(pendingEffectName.value),
  });
  pendingEffectName.value = null;
}

const EFFECT_DRAG_MIME = "application/x-webxlights-effect-name";
function onEffectDragStart(e: DragEvent, name: string): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(EFFECT_DRAG_MIME, name);
  e.dataTransfer.effectAllowed = "copy";
}

const DEFAULT_DROPPED_EFFECT_MS = 1000;

// Native drag-and-drop from the palette (SequencerGrid.vue's onDrop), matching ModelPalette.vue's
// convention on the Layout page - dropped at a default duration, same "place with defaults,
// resize after" pattern as a dropped model. The existing arm+drag-on-grid gesture (which lets
// you size the effect in one motion) is untouched and still the way to place a specific length.
function handleDropEffect(row: GridRow, name: string, startMs: number): void {
  const endMs = Math.min(startMs + DEFAULT_DROPPED_EFFECT_MS, store.sequence?.duration_ms ?? startMs + DEFAULT_DROPPED_EFFECT_MS);
  store.addEffect(row.elementType, row.elementId, row.subName, {
    id: newEffectId(),
    name,
    startMs,
    endMs: Math.max(endMs, startMs + 200),
    params: defaultParamsFor(name),
  });
}

function handleMove(effectId: string, startMs: number, endMs: number): void {
  // Live update during a pointermove-driven drag - store.snapshot() already ran once via
  // handleDragStart, so this must not snapshot again per move or the undo stack fills with
  // intermediate drag frames (see DECISIONS.md).
  store.updateEffectLive(effectId, { startMs, endMs });
}

function handleDragStart(): void {
  store.snapshot();
}

function handleSelect(effectId: string | null): void {
  store.selectedEffectId = effectId;
}

function handleAddMark(trackIndex: number, ms: number): void {
  store.ensureDefaultTimingTrack();
  store.addTimingMark(trackIndex, ms);
}

function handleContextMenu(target: ContextMenuTarget): void {
  const items =
    target.kind === "effect"
      ? [
          { label: "Copy", action: "copy" },
          { label: "Cut", action: "cut" },
          { label: "Paste", action: "paste" },
          { label: "Duplicate", action: "duplicate" },
          { label: "Delete", action: "delete" },
        ]
      : target.kind === "mark"
        ? [{ label: "Delete Mark", action: "delete-mark" }]
        : [{ label: "Add Timing Mark Here", action: "add-mark" }];
  contextMenu.value = { x: target.x, y: target.y, items, target };
}

function handleContextAction(action: string): void {
  const target = contextMenu.value?.target;
  contextMenu.value = null;
  if (!target) return;

  if (target.kind === "effect") {
    const { row, effect, ms } = target;
    if (action === "copy") {
      clipboard.value = store.copyEffect(effect.id);
    } else if (action === "cut") {
      clipboard.value = store.copyEffect(effect.id);
      store.deleteEffect(effect.id);
    } else if (action === "paste") {
      if (clipboard.value) store.pasteEffectAt(row.elementType, row.elementId, row.subName, clipboard.value, ms);
    } else if (action === "duplicate") {
      const copy = store.copyEffect(effect.id);
      if (copy) store.pasteEffectAt(row.elementType, row.elementId, row.subName, copy, effect.endMs);
    } else if (action === "delete") {
      store.deleteEffect(effect.id);
    }
  } else if (target.kind === "mark" && action === "delete-mark") {
    store.deleteTimingMark(target.trackIndex, target.ms);
  } else if (target.kind === "ruler-empty" && action === "add-mark") {
    handleAddMark(target.trackIndex, target.ms);
  }
}

function handleParamsUpdate(params: Record<string, EffectParamValue>): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { params });
}
function handlePaletteUpdate(palette: StoredSwatch[]): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { palette });
}
function handleBlendUpdate(patch: { blendMode?: BlendMode; mix?: number }): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, patch);
}
function handleTransitionUpdate(transition: TransitionSpec): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { transition });
}
function handleLayerUpdate(layer: LayerSettings): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { layer });
}

function addTimingMarkAtPlayhead(): void {
  store.ensureDefaultTimingTrack();
  store.addTimingMark(0, playheadMs.value);
}

function exportFseq(): void {
  if (!store.sequence) return;
  exportError.value = null;
  try {
    const bytes = exportSequenceToFseq(modelRecords.value, store.body, store.sequence, controllers.value, audioSeries.value ?? undefined, groupRecords.value);
    downloadFseq(bytes, store.sequence.name);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Export failed";
  }
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

async function fppConnectHost(): Promise<void> {
  if (!fppHost.value.trim()) return;
  fppBusy.value = true;
  fppStatus.value = "";
  fppSystemInfo.value = null;
  try {
    fppSystemInfo.value = await getFppSystemInfo(fppHost.value.trim());
  } catch (err) {
    fppStatus.value = err instanceof Error ? `Couldn't reach FPP: ${err.message}` : "Couldn't reach FPP";
  } finally {
    fppBusy.value = false;
  }
}

async function fppUpload(): Promise<void> {
  if (!store.sequence || !fppSystemInfo.value) return;
  fppBusy.value = true;
  fppStatus.value = "Uploading...";
  try {
    const bytes = exportSequenceToFseq(modelRecords.value, store.body, store.sequence, controllers.value, audioSeries.value ?? undefined, groupRecords.value);
    const filename = `${store.sequence.name}.fseq`;
    await uploadFseqToFpp(fppHost.value.trim(), filename, bytes);
    fppStatus.value = `Uploaded ${filename} to ${fppSystemInfo.value.HostName}.`;
    if (fppPlaylistName.value.trim()) {
      await syncPlaylist(fppHost.value.trim(), fppPlaylistName.value.trim(), filename, Math.round(store.sequence.duration_ms / 1000), store.sequence.audio_filename ?? undefined);
      fppStatus.value += ` Added to playlist "${fppPlaylistName.value.trim()}".`;
    }
  } catch (err) {
    fppStatus.value = err instanceof Error ? `Failed: ${err.message}` : "Failed";
  } finally {
    fppBusy.value = false;
  }
}

// ---- Popped-out preview window -------------------------------------------------------
// This tab is the source of truth: it owns the <audio> element and broadcasts the playhead;
// the preview window mirrors it and sends transport commands back. See lib/previewChannel.ts.
let previewChannel: BroadcastChannel | null = null;

function previewSnapshot(): PreviewMessage {
  return {
    type: "snapshot",
    models: JSON.parse(JSON.stringify(modelRecords.value)) as ModelRecord[],
    groups: JSON.parse(JSON.stringify(groupRecords.value)) as ModelGroupRecord[],
    body: JSON.parse(JSON.stringify(store.body)) as typeof store.body,
    frameMs: store.sequence?.frame_ms ?? 50,
    durationMs: store.sequence?.duration_ms ?? 0,
    name: store.sequence?.name ?? "",
    audioLoaded: audioLoaded.value,
  };
}

function previewAudioMessage(): PreviewMessage {
  return { type: "audio", audio: audioSeries.value };
}

function broadcastTransport(): void {
  postPreviewMessage(previewChannel, { type: "transport", playheadMs: playheadMs.value, playing: playing.value });
}

function onPreviewMessage(e: MessageEvent<PreviewMessage>): void {
  const message = e.data;
  if (message.type === "hello") {
    postPreviewMessage(previewChannel, previewSnapshot());
    postPreviewMessage(previewChannel, previewAudioMessage());
    broadcastTransport();
    return;
  }
  if (message.type !== "command") return;

  const el = audioEl.value;
  if (message.action === "play") void el?.play();
  else if (message.action === "pause") el?.pause();
  else if (message.action === "stop") stop();
  else if (message.action === "seek" && typeof message.ms === "number") seekTo(message.ms);
  broadcastTransport();
}

function openPreviewWindow(): void {
  window.open(previewUrlFor(route.params.projectId as string, sequenceId.value), `webxlights-preview-${sequenceId.value}`);
  // A window opened now won't have its listener attached yet; it says hello when it's ready.
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
      const row = visibleRows.value[0]; // pasting onto a hidden row would look like paste did nothing
      if (row) store.pasteEffectAt(row.elementType, row.elementId, row.subName, clipboard.value, playheadMs.value);
    }
  }
}

onMounted(async () => {
  await Promise.all([store.load(sequenceId.value), loadRows()]);
  const demoAudio = takePendingDemoAudio(sequenceId.value);
  if (demoAudio) await loadAudioFile(demoAudio);
  else if (store.sequence?.audio_path) await loadStoredAudio();
  window.addEventListener("keydown", onKeydown);
  previewChannel = openPreviewChannel(sequenceId.value);
  previewChannel?.addEventListener("message", onPreviewMessage);
  if (importMessage.value) router.replace({ query: { ...route.query, importMessage: undefined } });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  previewChannel?.removeEventListener("message", onPreviewMessage);
  previewChannel?.close();
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
});
watch(sequenceId, async (id) => {
  await store.load(id);
  audioLoaded.value = false;
  audioSeries.value = null;
  analyzingAudio.value = false;
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
      <button @click="openPreviewWindow" :disabled="!store.sequence" title="Open the house preview in its own window">
        Pop out preview
      </button>
      <span v-if="analyzingAudio" class="analyzing">Analyzing audio…</span>
      <span v-if="exportError" class="export-error">{{ exportError }}</span>
      <button @click="snapshotNow" :disabled="!store.sequence">Snapshot</button>
      <button @click="toggleHistory" :disabled="!store.sequence">History</button>
      <button :class="{ active: showModelsPanel }" @click="showModelsPanel = !showModelsPanel">
        Models{{ hiddenRowKeys.size ? ` (${visibleRows.length}/${rows.length})` : "" }}
      </button>
      <button :class="{ active: showTimingPanel }" @click="showTimingPanel = !showTimingPanel" :disabled="!store.sequence">Timing</button>
      <button v-if="FPP_CONNECT_ENABLED" @click="showFppPanel = !showFppPanel" :disabled="!store.sequence">FPP Connect</button>
      <span class="save-status">{{ store.saveStatus }}</span>
    </header>

    <div v-if="showTimingPanel" class="timing-panel">
      <p class="timing-note">Adds a new timing track of evenly-spaced marks across the sequence (matches real xLights' New Timing generator).</p>
      <div class="timing-row">
        <select v-model="timingGenerateMode">
          <option value="interval">Fixed interval</option>
          <option value="bpm">Metronome (BPM)</option>
        </select>
        <template v-if="timingGenerateMode === 'interval'">
          <input v-model.number="timingIntervalMs" type="number" min="1" /> ms
        </template>
        <template v-else>
          <input v-model.number="timingBpm" type="number" min="1" /> BPM
        </template>
        <button @click="generateTimingTrack">Generate</button>
      </div>
    </div>

    <div v-if="showFppPanel" class="fpp-panel">
      <template v-if="!fppChromiumCapable">
        <p>
          Uploading directly to an FPP device needs Chrome or Edge (the Local Network Access permission). In this browser, use
          <strong>Export .fseq</strong> above and upload it yourself via FPP's own web UI (File Manager).
        </p>
      </template>
      <template v-else>
        <div class="fpp-row">
          <input v-model="fppHost" type="text" placeholder="FPP hostname or IP (e.g. fpp.local)" />
          <button @click="fppConnectHost" :disabled="fppBusy || !fppHost.trim()">Connect</button>
          <span v-if="fppSystemInfo" class="fpp-connected">{{ fppSystemInfo.HostName }} — FPP {{ fppSystemInfo.Version }} ({{ fppSystemInfo.Mode }})</span>
        </div>
        <div v-if="fppSystemInfo" class="fpp-row">
          <input v-model="fppPlaylistName" type="text" placeholder="Playlist name (optional)" />
          <button @click="fppUpload" :disabled="fppBusy">Upload to FPP</button>
        </div>
        <p v-if="fppStatus" class="fpp-status">{{ fppStatus }}</p>
      </template>
    </div>

    <div v-if="importMessage" class="conflict-banner">
      <p>{{ importMessage }}</p>
      <button @click="importMessage = ''">Dismiss</button>
    </div>

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

    <div v-if="showModelsPanel" class="models-panel">
      <div class="models-panel-head">
        <h2>Rows shown on the grid</h2>
        <div class="models-panel-actions">
          <button @click="showAllRows" :disabled="hiddenRowKeys.size === 0">Show all</button>
          <button @click="hideAllRows" :disabled="hiddenRowKeys.size === rows.length">Hide all</button>
        </div>
      </div>
      <ul>
        <li v-for="row in rows" :key="rowKey(row)">
          <label>
            <input type="checkbox" :checked="!hiddenRowKeys.has(rowKey(row))" @change="toggleRowVisible(row)" />
            {{ row.name }}
            <span class="row-type">{{ row.elementType }}</span>
          </label>
          <span class="row-effect-count">{{ effectCountFor(row) }} effect{{ effectCountFor(row) === 1 ? "" : "s" }}</span>
        </li>
        <li v-if="rows.length === 0" class="empty">No models or groups in this project's layout yet.</li>
      </ul>
    </div>

    <div v-if="!audioLoaded" class="reselect-audio">
      <p>Select the audio file for this sequence.</p>
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
      <div class="palette-buttons">
        <span class="palette-label">Effects:</span>
        <button
          v-for="name in Object.keys(EFFECT_SCHEMAS)"
          :key="name"
          draggable="true"
          :class="{ armed: pendingEffectName === name }"
          @click="armEffect(name)"
          @dragstart="onEffectDragStart($event, name)"
        >
          {{ name }}
        </button>
      </div>
      <!-- Always rendered (visibility, not v-if) so arming/disarming never changes the palette's
           height - a v-if here used to reflow the whole grid below by ~90px every time an effect
           got armed, moving the exact row a user was about to drag on out from under their cursor. -->
      <p class="hint" :class="{ visible: !!pendingEffectName }">
        Drag "{{ pendingEffectName }}" onto a row to place it, or drag its palette button directly onto the grid.
      </p>
    </div>

    <div class="editor">
      <div class="timeline">
        <div class="preview-wrap">
          <HousePreview
            :models="modelRecords"
            :groups="groupRecords"
            :body="store.body"
            :playhead-ms="playheadMs"
            :frame-ms="store.sequence?.frame_ms ?? 50"
            :audio="audioSeries ?? undefined"
          />
        </div>
        <div class="h-scroll">
          <Waveform :peaks="peaks" :duration-ms="store.sequence?.duration_ms ?? 0" :px-per-ms="pxPerMs" :playhead-ms="playheadMs" @seek="seekTo" />
          <SequencerGrid
            :rows="visibleRows"
            :body="store.body"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            :selected-effect-id="store.selectedEffectId"
            :pending-effect-name="pendingEffectName"
            @select="handleSelect"
            @place="handlePlace"
            @drop-effect="handleDropEffect"
            @move="handleMove"
            @seek="seekTo"
            @drag-start="handleDragStart"
            @add-mark="handleAddMark"
            @contextmenu="handleContextMenu"
          />
        </div>
      </div>
      <aside class="props">
        <EffectPropsPanel
          :effect="selectedEffect"
          @update="handleParamsUpdate"
          @update-palette="handlePaletteUpdate"
          @update-blend="handleBlendUpdate"
          @update-transition="handleTransitionUpdate"
          @update-layer="handleLayerUpdate"
        />
      </aside>
    </div>

    <EffectContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @action="handleContextAction"
      @close="contextMenu = null"
    />
  </main>
</template>

<style scoped>
.sequencer-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0d0d11;
  color: #ddd;
}
.sequencer-page a {
  color: #e8c468;
}
header {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 0.4rem;
  column-gap: 1rem;
  background: #16161c;
}
header h1 {
  font-size: 1rem;
  margin: 0;
  color: #ddd;
  font-weight: 600;
}
header button,
.fpp-row button,
.history-panel button,
.conflict-banner button {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  white-space: nowrap;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e26;
  color: #ddd;
  cursor: pointer;
}
header button:hover:not(:disabled),
.fpp-row button:hover:not(:disabled),
.history-panel button:hover:not(:disabled),
.conflict-banner button:hover {
  border-color: #e8c468;
  color: #e8c468;
}
header button:disabled {
  color: #555;
  cursor: default;
}
header select {
  padding: 0.3rem 0.4rem;
  font-size: 0.8rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e26;
  color: #ddd;
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
.export-error {
  color: #e57373;
  font-size: 0.8rem;
}
.analyzing {
  color: #e8c468;
  font-size: 0.8rem;
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
.models-panel {
  padding: 0.6rem 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  font-size: 0.85rem;
  max-height: 260px;
  overflow-y: auto;
}
.models-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.models-panel-head h2 {
  font-size: 0.85rem;
  margin: 0;
  color: #888;
  font-weight: normal;
}
.models-panel-actions {
  display: flex;
  gap: 0.4rem;
}
.models-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.models-panel li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid #262630;
}
.models-panel li:last-child {
  border-bottom: none;
}
.models-panel label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.models-panel .row-type {
  color: #666;
  font-size: 0.7rem;
}
.models-panel .row-effect-count {
  color: #666;
  font-size: 0.75rem;
  white-space: nowrap;
}
.models-panel .empty {
  color: #666;
}
header button.active {
  background: #2c2712;
  border-color: #e8c468;
  color: #e8c468;
}
.fpp-panel,
.timing-panel {
  padding: 0.6rem 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  font-size: 0.85rem;
}
.timing-note {
  margin: 0 0 0.5rem;
  color: #888;
  font-size: 0.8rem;
}
.timing-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.timing-row input[type="number"] {
  width: 5rem;
}
.fpp-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.fpp-row input {
  flex: 1;
  max-width: 320px;
}
.fpp-connected {
  color: #6fcf97;
}
.fpp-status {
  margin: 0.4rem 0 0;
  color: #aaa;
}
.palette {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #333;
}
.palette-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.palette-buttons button {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e26;
  color: #ddd;
  cursor: grab;
}
.palette-buttons button:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.palette-buttons button:active {
  cursor: grabbing;
}
.palette-label {
  color: #888;
  font-size: 0.8rem;
}
.palette button.armed {
  background: #e8c468;
  color: #111;
  border-color: #e8c468;
}
/* Reserved height always present (visibility, not display:none) - see the template comment:
   arming an effect must never change the palette's height, or the grid below jumps under the
   user's cursor mid-interaction. */
.hint {
  margin: 0.35rem 0 0;
  color: #e8c468;
  font-size: 0.8rem;
  line-height: 1.3;
  visibility: hidden;
}
.hint.visible {
  visibility: visible;
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
.h-scroll {
  overflow-x: auto;
}
.props {
  width: 240px;
  border-left: 1px solid #333;
  overflow-y: auto;
}
</style>
