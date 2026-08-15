<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CANVAS_ONLY_EFFECTS, EFFECT_SCHEMAS, defaultParamsFor, detectOnsets, estimateTempo, mouthNames, type AudioSeries, type OnsetBand, type BlendMode, type LayerSettings, type StoredSwatch, type TransitionSpec } from "@webxlights/engine";
import { api, type ControllerRecord, type EffectParamValue, type ModelRecord, type ModelGroupRecord, type SequencerView, type SequenceEffect, type SequenceVersion } from "../lib/api";
import { computePeaks, decodeAudioFile, type PeakBucket } from "../lib/audio";
import { analyzeAudioBuffer } from "../lib/audioAnalysis";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { parseMidi, parsePapagayo, type ParsedMidi } from "@webxlights/formats";
import { ALL_TRACKS, describeMidiImport, midiTrackChoices, timingTrackFromMidi } from "../lib/midiTiming";
import { describePapagayoImport, tracksFromPapagayo } from "../lib/papagayoTiming";
import { FPP_CONNECT_ENABLED, getFppSystemInfo, isChromiumLanCapable, syncPlaylist, uploadFseqToFpp, type FppSystemInfo } from "../lib/fppConnect";
import { takePendingDemoAudio } from "../lib/demoProject";
import { openPanelWindow, openPreviewChannel, postPreviewMessage, previewUrlFor, type PreviewMessage } from "../lib/previewChannel";
import {
  effectFromPreset,
  groupPresets,
  parsePresetFile,
  presetFileContents,
  presetFileName,
  presetFromEffect,
  type EffectPreset,
} from "../lib/effectPresets";
import { buildCommands, commandForEvent, isTypingTarget } from "../lib/commands";
import {
  checkShortcut,
  effectShortcuts,
  loadShortcuts,
  saveShortcuts,
  setShortcut,
  shortcutRows,
  type ShortcutOverrides,
} from "../lib/keybindings";
import {
  UI_COLOR_LABELS,
  exportUiColors,
  importUiColors,
  loadUiColors,
  resetUiColors,
  sanitizeColors,
  saveUiColors,
  type UiColors,
} from "../lib/uiColors";
import { formatTime, loadPreferences, sanitize, savePreferences, type Preferences } from "../lib/preferences";
import {
  loadPerspectives,
  panelsFrom,
  removePerspective,
  savePerspectives,
  upsertPerspective,
  type PanelId,
  type Perspective,
} from "../lib/perspectives";
import { REGION_COLORS, boundariesFromTimingTrack, effectsInRegion, rebaseEffects, regionAt, regionsFrom } from "../lib/songRegions";
import CommandPalette from "../components/CommandPalette.vue";
import EffectWheel from "../components/EffectWheel.vue";
import ModelVideoExport from "../components/ModelVideoExport.vue";
import { newEffectId, setAutosaveDebounce, useSequencerStore } from "../stores/sequencer";
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
const showViewsPanel = ref(false);
const showPresetsPanel = ref(false);
const presets = ref<EffectPreset[]>([]);
const newPresetName = ref("");
const newPresetGroup = ref("Presets");
const presetError = ref("");
const presetImportGroup = ref("Presets");
const layoutId = ref<number | null>(null);
const newViewName = ref("");
const viewError = ref("");
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

// A MIDI file's notes as a timing track — which is what makes the Piano effect's "Midi file"
// notes source work here. The file is parsed on pick so its tracks can be offered by name, and
// the track is only added once the Track, adjust and speed settings have been chosen.
const midiFile = shallowRef<ParsedMidi | null>(null);
const midiFileName = ref("");
const midiTrack = ref(ALL_TRACKS);
const midiStartAdjustMs = ref(0);
const midiSpeedPct = ref(100);
const midiLabelAs = ref<"notes" | "midi">("notes");
const midiMessage = ref("");
const midiChoices = computed(() => (midiFile.value ? midiTrackChoices(midiFile.value) : []));

async function pickMidiFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  midiMessage.value = "";
  try {
    midiFile.value = parseMidi(new Uint8Array(await file.arrayBuffer()));
    midiFileName.value = file.name.replace(/\.mid[i]?$/i, "");
    midiTrack.value = midiChoices.value[0] ?? ALL_TRACKS;
    if (midiChoices.value.length === 0) midiMessage.value = "That file has no notes in it.";
  } catch (err) {
    midiFile.value = null;
    midiMessage.value = err instanceof Error ? err.message : "Couldn't read that MIDI file.";
  }
}

// A Papagayo lipsync file's voices as timing tracks - phrases, words and phonemes, which is what
// a Faces effect is driven by. Added straight away rather than through a settings step: the only
// choice the manual's own dialog offers is the frame offset, and it is next to the picker.
const papagayoOffsetFrames = ref(0);
const papagayoMessage = ref("");

async function pickPapagayoFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  papagayoMessage.value = "";
  try {
    const parsed = parsePapagayo(await file.text());
    const tracks = tracksFromPapagayo(parsed, { offsetFrames: papagayoOffsetFrames.value });
    for (const track of tracks) store.addTimingTrack(track);
    papagayoMessage.value = describePapagayoImport(parsed, tracks);
  } catch (err) {
    papagayoMessage.value = err instanceof Error ? err.message : "Couldn't read that Papagayo file.";
  } finally {
    // So the same file can be picked again after changing the offset.
    input.value = "";
  }
}

function addMidiTimingTrack(): void {
  const parsed = midiFile.value;
  if (!parsed) return;
  const track = timingTrackFromMidi(parsed, {
    track: midiTrack.value,
    startAdjustMs: midiStartAdjustMs.value,
    speedPct: midiSpeedPct.value,
    labelAs: midiLabelAs.value,
    name: midiFileName.value || "MIDI Notes",
  });
  if (track.marks.length === 0) {
    midiMessage.value = "Nothing to add — that track's notes all fall before the sequence starts.";
    return;
  }
  store.addTimingTrack(track);
  midiMessage.value = describeMidiImport(track, parsed);
}

// xLights' audio-generated timing tracks. The interval and metronome generators put marks at a
// rate you choose; this puts them where something actually happens in the track, which is what
// makes a timing track usable for sequencing to a song rather than to a click.
//
// The detection itself lives in the engine (onsets.ts) - it is arithmetic over the analysed audio
// and belongs where it can be tested against a synthesised track rather than a real one.
const onsetSensitivity = ref(50);
const onsetMinGapMs = ref(120);
const onsetBand = ref<OnsetBand>("all");
const onsetEveryNth = ref(1);
const onsetMessage = ref("");

function detectTimingFromAudio(): void {
  const series = audioSeries.value;
  if (!series) {
    onsetMessage.value = "Load an audio track first — there's nothing to detect against.";
    return;
  }
  const marks = detectOnsets(series, {
    sensitivity: onsetSensitivity.value,
    minGapMs: onsetMinGapMs.value,
    band: onsetBand.value,
    everyNth: onsetEveryNth.value,
  });
  if (marks.length === 0) {
    onsetMessage.value = "Nothing stood out in that track. Try a higher sensitivity.";
    return;
  }
  const bpm = estimateTempo(marks);
  const label = onsetEveryNth.value > 1 ? `Every ${onsetEveryNth.value} beats` : "Beats";
  store.addTimingTrack({ name: `${label} (${onsetBand.value})`, marks });
  // The tempo is reported rather than used: it answers "did this find the beat or find noise?",
  // which is the question you have when looking at a track full of new marks.
  onsetMessage.value = bpm
    ? `${marks.length} marks — the gaps between them look like about ${bpm} BPM`
    : `${marks.length} marks — no steady tempo in them, so check them against the waveform`;
}

const showFppPanel = ref(false);

// xLights' View > Perspectives: a saved arrangement of which panels are showing. This page has a
// lot of them now - Views, Presets, Regions, Preferences, Models, Timing, FPP - and getting back
// to a working arrangement after opening three of them is otherwise a matter of remembering.
const perspectives = ref<Perspective[]>(loadPerspectives(typeof localStorage === "undefined" ? null : localStorage));
const newPerspectiveName = ref("");

const openPanels = computed<Record<PanelId, boolean>>(() => ({
  models: showModelsPanel.value,
  timing: showTimingPanel.value,
  views: showViewsPanel.value,
  presets: showPresetsPanel.value,
  regions: showRegionsPanel.value,
  prefs: showPrefsPanel.value,
  fpp: showFppPanel.value,
  preview: true, // the house preview is always mounted; kept in the list so a saved one restores
}));

function persistPerspectives(next: Perspective[]): void {
  perspectives.value = next;
  savePerspectives(typeof localStorage === "undefined" ? null : localStorage, next);
}

function savePerspective(): void {
  const name = newPerspectiveName.value.trim();
  if (!name) return;
  persistPerspectives(upsertPerspective(perspectives.value, { name, panels: panelsFrom(openPanels.value) }));
  newPerspectiveName.value = "";
}

function applyPerspective(name: string): void {
  const perspective = perspectives.value.find((p) => p.name === name);
  if (!perspective) return;
  const on = new Set(perspective.panels);
  // Every panel is set, not just the ones in the list - restoring an arrangement means closing
  // what it didn't have open as much as opening what it did.
  showModelsPanel.value = on.has("models");
  showTimingPanel.value = on.has("timing");
  showViewsPanel.value = on.has("views");
  showPresetsPanel.value = on.has("presets");
  showRegionsPanel.value = on.has("regions");
  showPrefsPanel.value = on.has("prefs");
  showFppPanel.value = on.has("fpp");
}

function deletePerspective(name: string): void {
  persistPerspectives(removePerspective(perspectives.value, name));
}
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

// What the label-driven effects (State, Piano) can be pointed at. The timing tracks belong to the
// sequence; the state definitions belong to the model under the row the selected effect is on, so
// a State effect on one prop never offers another prop's states.
const timingTrackNames = computed(() => store.body.timingTracks.map((t) => t.name));
const selectedEffectModel = computed(() => {
  const id = store.selectedEffectId;
  if (!id) return null;
  const row = store.body.rows.find((r) => r.effects.some((e) => e.id === id));
  if (!row || row.elementType === "group") return null;
  return modelRecords.value.find((m) => m.id === row.elementId) ?? null;
});
const stateDefinitionNames = computed(() => (selectedEffectModel.value?.states ?? []).map((s) => s.name));
const faceDefinitionNames = computed(() => (selectedEffectModel.value?.faces ?? []).map((f) => f.name));
// The mouth positions of the face this effect is actually pointed at - so the Phoneme list is
// this face's own names rather than a set we assumed it would use.
const phonemeNames = computed(() => {
  const faces = selectedEffectModel.value?.faces ?? [];
  if (faces.length === 0) return [];
  const named = String(selectedEffect.value?.params.faceDefinition ?? "").trim();
  const face = named ? faces.find((f) => f.name === named) : faces.length === 1 ? faces[0] : undefined;
  return face ? mouthNames(face) : [];
});

function rowKey(row: GridRow): string {
  return `${row.elementType}:${row.elementId}:${row.subName ?? ""}`;
}
async function saveViews(next: SequencerView[]): Promise<void> {
  if (layoutId.value === null) return;
  viewError.value = "";
  try {
    views.value = (await api.replaceViews(layoutId.value, next)).views;
  } catch (err) {
    // The whole list is replaced in one call, so a failure leaves the server holding the previous
    // set. Showing the error and re-reading is better than leaving the panel displaying a view
    // that isn't saved.
    viewError.value = err instanceof Error ? err.message : "Couldn't save views";
    if (layoutId.value !== null) views.value = (await api.listViews(layoutId.value)).views;
  }
}

function addView(): void {
  const name = newViewName.value.trim();
  if (!name) return;
  if (views.value.some((v) => v.name === name)) {
    viewError.value = `There is already a view called "${name}".`;
    return;
  }
  // A new view starts with the rows currently on the grid, in the order they are in - which is
  // what you were looking at when you decided to make one.
  void saveViews([...views.value, { name, rowKeys: visibleRows.value.map(rowKey) }]);
  newViewName.value = "";
  activeViewName.value = name;
}

function deleteView(name: string): void {
  if (activeViewName.value === name) activeViewName.value = null;
  void saveViews(views.value.filter((v) => v.name !== name));
}

function toggleRowInView(row: GridRow): void {
  const view = activeView.value;
  if (!view) return;
  const key = rowKey(row);
  const rowKeys = view.rowKeys.includes(key)
    ? view.rowKeys.filter((k) => k !== key)
    : [...view.rowKeys, key];
  void saveViews(views.value.map((v) => (v.name === view.name ? { ...v, rowKeys } : v)));
}

// Up/down within the view, matching xLights' own arrows: the order is the point of a view, so it
// has to be editable without rebuilding the whole list.
function moveInView(key: string, delta: number): void {
  const view = activeView.value;
  if (!view) return;
  const from = view.rowKeys.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= view.rowKeys.length) return;
  const rowKeys = [...view.rowKeys];
  const [moved] = rowKeys.splice(from, 1);
  rowKeys.splice(to, 0, moved!);
  void saveViews(views.value.map((v) => (v.name === view.name ? { ...v, rowKeys } : v)));
}

function rowNameFor(key: string): string {
  return rows.value.find((r) => rowKey(r) === key)?.name ?? `${key} (missing)`;
}

// ---- Effect presets ------------------------------------------------------------------------
// The manual's own workflow: highlight an effect, save it under a group, then apply it somewhere
// else "without recreating them from scratch". Presets live on the layout, like views, because
// they are global in xLights rather than belonging to one sequence.
const presetGroups = computed(() => groupPresets(presets.value));

async function savePresets(next: EffectPreset[]): Promise<void> {
  if (layoutId.value === null) return;
  presetError.value = "";
  try {
    presets.value = (await api.replaceEffectPresets(layoutId.value, next)).presets;
  } catch (err) {
    presetError.value = err instanceof Error ? err.message : "Couldn't save presets";
    if (layoutId.value !== null) presets.value = (await api.listEffectPresets(layoutId.value)).presets;
  }
}

function savePresetFromSelection(): void {
  const effect = selectedEffect.value;
  const name = newPresetName.value.trim();
  if (!effect || !name) return;
  if (presets.value.some((p) => p.name === name && p.group === newPresetGroup.value.trim())) {
    presetError.value = `"${name}" already exists in that group.`;
    return;
  }
  void savePresets([...presets.value, presetFromEffect(effect, name, newPresetGroup.value)]);
  newPresetName.value = "";
}

// Which grid row the selected effect sits on - the row a preset applies to. Falls back to the
// first visible row, because a preset with nowhere to land would look like the button did nothing.
const presetTargetRow = computed<GridRow | undefined>(() => {
  const id = store.selectedEffectId;
  if (id) {
    const owner = store.body.rows.find((r) => r.effects.some((e) => e.id === id));
    if (owner) {
      const match = visibleRows.value.find(
        (r) => r.elementType === owner.elementType && r.elementId === owner.elementId && (r.subName ?? "") === (owner.subName ?? ""),
      );
      if (match) return match;
    }
  }
  return visibleRows.value[0];
});

function applyPreset(preset: EffectPreset): void {
  // Applied at the playhead on the row the selection is on, which is the grid location the manual
  // has you navigate to before applying.
  const row = presetTargetRow.value;
  if (!row) return;
  store.addEffect(row.elementType, row.elementId, row.subName, effectFromPreset(preset, newEffectId(), playheadMs.value));
}

function deletePreset(preset: EffectPreset): void {
  void savePresets(presets.value.filter((p) => !(p.name === preset.name && p.group === preset.group)));
}

function exportPreset(preset: EffectPreset): void {
  const blob = new Blob([presetFileContents(preset)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = presetFileName(preset);
  a.click();
  URL.revokeObjectURL(url);
}

async function importPreset(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  presetError.value = "";
  // "A preset will be created under the highlighted group with the name of the selected file."
  const name = file.name.replace(/\.xpreset$/i, "");
  const parsed = parsePresetFile(await file.text(), name, presetImportGroup.value);
  input.value = "";
  if (!parsed) {
    presetError.value = `"${file.name}" isn't a preset file.`;
    return;
  }
  await savePresets([...presets.value, parsed]);
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
// xLights' Views (manual: Sequencer > Views): "a view is used to be able to easily select a list
// of models *and the sequence in which they are to be displayed* on the sequencer". They live on
// the layout because "views work across sequences", so one set up here is available in every
// sequence of the project - which is also why they are saved rather than kept in localStorage the
// way the Models panel's scratch toggles are.
//
// The Master View is not stored: it is "a special (system created) view" containing every row, so
// it is simply the absence of a selection.
const views = ref<SequencerView[]>([]);
const activeViewName = ref<string | null>(null);
const activeView = computed(() => views.value.find((v) => v.name === activeViewName.value) ?? null);

const visibleRows = computed(() => {
  const shown = rows.value.filter((r) => !hiddenRowKeys.value.has(rowKey(r)));
  const view = activeView.value;
  if (!view) return shown;
  // A view names its rows *in order*, so the grid follows the view rather than the layout. Rows
  // the view doesn't name are dropped; a named row the layout no longer has is skipped rather
  // than left as a gap, which is what happens when a model is deleted after a view was saved.
  const byKey = new Map(shown.map((r) => [rowKey(r), r]));
  return view.rowKeys.map((k) => byKey.get(k)).filter((r): r is GridRow => !!r);
});
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
  layoutId.value = layout.id;
  views.value = (await api.listViews(layout.id)).views;
  presets.value = (await api.listEffectPresets(layout.id)).presets;
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

// Audio scrubbing (manual: "play-on-drag over the waveform"). Dragging the waveform plays the
// track under the pointer, which is how a downbeat gets found by ear instead of by counting.
//
// The burst is stopped on a timer rather than left running: a scrub that kept playing would drift
// away from the pointer within a second, and dragging back would then be seeking against audio
// that had moved on. It is also only started when the transport is stopped - scrubbing during
// playback would fight the thing already playing.
let scrubStopTimer: ReturnType<typeof setTimeout> | null = null;
const SCRUB_BURST_MS = 120;

function scrubTo(ms: number): void {
  seekTo(ms);
  const el = audioEl.value;
  if (!el || playing.value) return;
  if (scrubStopTimer) clearTimeout(scrubStopTimer);
  void el.play().catch(() => {
    // Autoplay policy, or no track loaded. The playhead still moved, which is the part that
    // matters; the burst is a bonus.
  });
  scrubStopTimer = setTimeout(() => el.pause(), SCRUB_BURST_MS);
}

function endScrub(): void {
  if (scrubStopTimer) clearTimeout(scrubStopTimer);
  scrubStopTimer = null;
  if (!playing.value) audioEl.value?.pause();
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

// Kept as the fallback for anything that runs before preferences load; the preference is what
// actually drives a drop (see prefs.defaultEffectMs).
const DEFAULT_DROPPED_EFFECT_MS = 1000;

// Native drag-and-drop from the palette (SequencerGrid.vue's onDrop), matching ModelPalette.vue's
// convention on the Layout page - dropped at a default duration, same "place with defaults,
// resize after" pattern as a dropped model. The existing arm+drag-on-grid gesture (which lets
// you size the effect in one motion) is untouched and still the way to place a specific length.
function handleDropEffect(row: GridRow, name: string, startMs: number): void {
  const length = prefs.value.defaultEffectMs || DEFAULT_DROPPED_EFFECT_MS;
  const endMs = Math.min(startMs + length, store.sequence?.duration_ms ?? startMs + length);
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

// Every keyboard shortcut and every palette entry comes from one registry (lib/commands.ts).
// xLights documents around sixty shortcuts, and keeping a switch statement, a help list and a
// palette in agreement by hand is exactly what drifts until a documented key does nothing.
// Song structure regions (lib/songRegions.ts): named, coloured sections of the timeline. They
// earn their keep in bulk - once the timeline is labelled, "copy the chorus onto the second
// chorus" is one action instead of a rubber-band selection across a hundred rows that has to land
// on exactly the right boundary.
const showRegionsPanel = ref(false);
const regionCopyFrom = ref("");
const regionCopyTo = ref("");
const songRegions = computed(() => regionsFrom(store.body.songBoundaries ?? [], store.sequence?.duration_ms ?? 0));
const currentRegion = computed(() => regionAt(songRegions.value, playheadMs.value));

function addBoundaryHere(): void {
  store.snapshot();
  const boundaries = [...(store.body.songBoundaries ?? []), { ms: playheadMs.value, name: `Section ${(store.body.songBoundaries?.length ?? 0) + 1}` }];
  store.body.songBoundaries = boundaries;
}
function renameBoundary(index: number, name: string): void {
  const boundaries = [...(store.body.songBoundaries ?? [])];
  const boundary = boundaries[index];
  if (!boundary) return;
  boundaries[index] = { ...boundary, name };
  store.body.songBoundaries = boundaries;
}
function removeBoundary(index: number): void {
  store.snapshot();
  store.body.songBoundaries = (store.body.songBoundaries ?? []).filter((_, i) => i !== index);
}
function regionsFromTrack(trackIndex: number): void {
  const track = store.body.timingTracks[trackIndex];
  if (!track) return;
  store.snapshot();
  store.body.songBoundaries = boundariesFromTimingTrack(track);
}
// "Copy effects between regions" - the bulk action regions exist for.
function copyRegionEffects(): void {
  const from = songRegions.value.find((r) => r.name === regionCopyFrom.value);
  const to = songRegions.value.find((r) => r.name === regionCopyTo.value);
  if (!from || !to || from === to) return;
  store.snapshot();
  for (const row of store.body.rows) {
    for (const copy of rebaseEffects(effectsInRegion(row.effects, from), from, to, newEffectId)) {
      store.addEffect(row.elementType, row.elementId, row.subName, copy);
    }
  }
}

const paletteOpen = ref(false);

// The radial effect wheel, opened by double-clicking empty grid. It carries where it was opened
// so the effect lands under the pointer rather than at the playhead - the whole point of the
// gesture is that it happens where you already are.
const wheel = ref<{ row: GridRow; ms: number; x: number; y: number } | null>(null);
function openWheel(row: GridRow, ms: number, x: number, y: number): void {
  wheel.value = { row, ms, x, y };
}
function placeFromWheel(name: string): void {
  const at = wheel.value;
  wheel.value = null;
  if (!at) return;
  store.addEffect(at.row.elementType, at.row.elementId, at.row.subName, {
    id: newEffectId(),
    name,
    startMs: at.ms,
    endMs: at.ms + prefs.value.defaultEffectMs,
    params: defaultParamsFor(name),
  });
}

// Application preferences (lib/preferences.ts). They live in localStorage, not on the server: a
// preference belongs to the person at the keyboard, not to the show, and one that travelled with
// the project would let two people editing it change each other's settings.
const prefs = ref<Preferences>(loadPreferences(typeof localStorage === "undefined" ? null : localStorage));

// xLights' File > Settings > Colors: the app's own chrome colours, not show data. A sequencer
// grid is dense, and people who work in one for hours have real preferences about which things
// stand out - and someone colour-blind may need the selected/unselected pair to differ by more
// than hue.
const uiColors = ref<UiColors>(loadUiColors(typeof localStorage === "undefined" ? null : localStorage));
const colorsError = ref("");

function patchColor(key: keyof UiColors, value: string): void {
  uiColors.value = sanitizeColors({ ...uiColors.value, [key]: value });
  saveUiColors(typeof localStorage === "undefined" ? null : localStorage, uiColors.value);
}
function resetColors(): void {
  uiColors.value = resetUiColors();
  saveUiColors(typeof localStorage === "undefined" ? null : localStorage, uiColors.value);
}
function exportColors(): void {
  const blob = new Blob([exportUiColors(uiColors.value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "webxlights-colors.json";
  a.click();
  URL.revokeObjectURL(url);
}
async function importColors(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  colorsError.value = "";
  const imported = importUiColors(await file.text());
  if (!imported) {
    colorsError.value = `"${file.name}" isn't a colour set.`;
    return;
  }
  uiColors.value = imported;
  saveUiColors(typeof localStorage === "undefined" ? null : localStorage, imported);
}
const showPrefsPanel = ref(false);
function patchPrefs(changes: Partial<Preferences>): void {
  prefs.value = sanitize({ ...prefs.value, ...changes });
  savePreferences(typeof localStorage === "undefined" ? null : localStorage, prefs.value);
  applyPrefs();
}
// Preferences that something else has to be told about, rather than simply read from.
function applyPrefs(): void {
  setAutosaveDebounce(prefs.value.autosaveSeconds * 1000);
}
applyPrefs();
const playheadLabel = computed(() => formatTime(playheadMs.value, prefs.value.timeFormat, store.sequence?.frame_ms ?? 50));

// The row a keyboard-placed effect lands on: the one the selection is on, falling back to the
// first visible row. Without a fallback the effect shortcuts would silently do nothing until
// something had been clicked.
function keyboardTargetRow(): GridRow | undefined {
  return presetTargetRow.value;
}

// xLights' keybindings file, as a per-browser preference: which letter drops which effect is
// muscle memory, and it belongs to the person at the keyboard (keybindings.ts).
const shortcutOverrides = ref<ShortcutOverrides>(loadShortcuts(typeof localStorage === "undefined" ? null : localStorage));
const shortcutsInForce = computed(() => effectShortcuts(shortcutOverrides.value));

const shortcutError = ref("");
const shortcutRowsInForce = computed(() => shortcutRows(shortcutOverrides.value));

function assignShortcut(id: string, key: string): void {
  const check = checkShortcut(id, key, shortcutOverrides.value);
  if (!check.ok) {
    // Refused rather than warned: two effects on one key means one of them silently stops
    // working, and which one is an accident of list order.
    shortcutError.value = check.reason;
    return;
  }
  shortcutError.value = "";
  updateShortcuts(setShortcut(shortcutOverrides.value, id, key));
}

function updateShortcuts(next: ShortcutOverrides): void {
  shortcutOverrides.value = next;
  saveShortcuts(typeof localStorage === "undefined" ? null : localStorage, next);
}

const commands = computed(() =>
  buildCommands({
    effectShortcuts: shortcutsInForce.value,
    togglePlay,
    seekStart: () => seekTo(0),
    seekEnd: () => seekTo(store.sequence?.duration_ms ?? 0),
    nudgePlayhead: (delta) => seekTo(Math.max(0, playheadMs.value + delta)),
    addTimingMark: addTimingMarkAtPlayhead,
    splitTimingMark: splitTimingMarkAtPlayhead,
    deleteSelected: () => {
      if (store.selectedEffectId) store.deleteEffect(store.selectedEffectId);
    },
    copySelected: () => {
      if (store.selectedEffectId) clipboard.value = store.copyEffect(store.selectedEffectId);
    },
    pasteAtPlayhead: () => {
      const row = keyboardTargetRow();
      if (clipboard.value && row) store.pasteEffectAt(row.elementType, row.elementId, row.subName, clipboard.value, playheadMs.value);
    },
    duplicateSelected: () => {
      const copy = store.selectedEffectId ? store.copyEffect(store.selectedEffectId) : null;
      const row = keyboardTargetRow();
      if (copy && row) store.pasteEffectAt(row.elementType, row.elementId, row.subName, copy, copy.endMs);
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    zoomIn: () => {
      zoomLevel.value = Math.min(2, zoomLevel.value + 1);
    },
    zoomOut: () => {
      zoomLevel.value = Math.max(0, zoomLevel.value - 1);
    },
    placeEffect: (name, params) => {
      const row = keyboardTargetRow();
      if (!row) return;
      store.addEffect(row.elementType, row.elementId, row.subName, {
        id: newEffectId(),
        name,
        startMs: playheadMs.value,
        endMs: playheadMs.value + prefs.value.defaultEffectMs,
        // A shortcut can carry parameters - the manual's fade-up and fade-down keys are the On
        // effect with its intensities swapped - so they go over the schema's defaults rather
        // than replacing them, which would leave every other field undefined.
        params: { ...defaultParamsFor(name), ...(params ?? {}) },
      });
    },
    placeRandomEffect: () => {
      const row = keyboardTargetRow();
      if (!row) return;
      // "Generate Random effects". Drawn from the effects that draw something on their own: a
      // random canvas effect would land on a layer with nothing underneath and render nothing,
      // which reads as the shortcut being broken.
      const candidates = Object.keys(EFFECT_SCHEMAS).filter((n) => !CANVAS_ONLY_EFFECTS.has(n) && n !== "Off");
      const name = candidates[Math.floor(Math.random() * candidates.length)] ?? "On";
      store.addEffect(row.elementType, row.elementId, row.subName, {
        id: newEffectId(),
        name,
        startMs: playheadMs.value,
        endMs: playheadMs.value + prefs.value.defaultEffectMs,
        params: defaultParamsFor(name),
      });
    },
    openPalette: () => {
      paletteOpen.value = true;
    },
    exportFseq,
    snapshot: () => void snapshotNow(),
  }),
);

function onKeydown(e: KeyboardEvent): void {
  // The palette owns the keyboard while it is open - its own arrow keys and Enter would otherwise
  // also be scrubbing the playhead behind it.
  if (paletteOpen.value) return;
  if (isTypingTarget(e.target)) return;

  const command = commandForEvent(commands.value, e);
  if (!command) return;
  e.preventDefault();
  command.run();
}

// xLights' "s": splits the timing mark the playhead is inside, which is how a beat gets halved
// without counting. Falls back to simply adding a mark when the playhead isn't inside one.
function splitTimingMarkAtPlayhead(): void {
  store.ensureDefaultTimingTrack();
  const track = store.body.timingTracks[0];
  if (!track) return;
  const marks = [...track.marks].sort((a, b) => a - b);
  const before = [...marks].reverse().find((m) => m < playheadMs.value);
  const after = marks.find((m) => m > playheadMs.value);
  if (before === undefined || after === undefined) {
    addTimingMarkAtPlayhead();
    return;
  }
  store.addTimingMark(0, Math.round((before + after) / 2));
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
        <span class="time" :title="`Time shown as ${prefs.timeFormat}`">{{ playheadLabel }}</span>
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
      <select
        v-model="activeViewName"
        title="Which view the grid is showing. The Master View is every row."
        :disabled="rows.length === 0"
      >
        <option :value="null">Master View</option>
        <option v-for="v in views" :key="v.name" :value="v.name">{{ v.name }}</option>
      </select>
      <button title="Command palette (Ctrl+Shift+K)" @click="paletteOpen = true">⌘K</button>
      <button :class="{ active: showPrefsPanel }" @click="showPrefsPanel = !showPrefsPanel">Preferences</button>
      <button :class="{ active: showRegionsPanel }" @click="showRegionsPanel = !showRegionsPanel">
        Regions{{ currentRegion ? `: ${currentRegion.name}` : "" }}
      </button>
      <button :class="{ active: showViewsPanel }" @click="showViewsPanel = !showViewsPanel">Views</button>
      <button :class="{ active: showPresetsPanel }" @click="showPresetsPanel = !showPresetsPanel">
        Presets{{ presets.length ? ` (${presets.length})` : "" }}
      </button>
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

      <p class="timing-note">
        Or find the beats in the loaded track. Marks go where the sound actually rises, so they
        follow the song rather than a fixed rate. Sensitivity trades marks you wanted against
        marks you didn't; the minimum gap keeps one drum hit from becoming a cluster.
      </p>
      <div class="timing-row">
        <select v-model="onsetBand">
          <option value="all">Whole spectrum</option>
          <option value="low">Low (kick)</option>
          <option value="mid">Mid</option>
          <option value="high">High (hats)</option>
        </select>
        <label class="midi-field">
          Sensitivity <input v-model.number="onsetSensitivity" type="range" min="0" max="100" />
          <span class="value">{{ onsetSensitivity }}</span>
        </label>
        <label class="midi-field">Min gap <input v-model.number="onsetMinGapMs" type="number" min="0" step="10" /> ms</label>
        <label class="midi-field">Keep every <input v-model.number="onsetEveryNth" type="number" min="1" max="16" /></label>
        <button :disabled="!audioSeries" @click="detectTimingFromAudio">Detect</button>
      </div>
      <p v-if="onsetMessage" class="timing-note">{{ onsetMessage }}</p>

      <p class="timing-note">
        Or import a MIDI file's notes as a track. Each cell is labelled with the keys sounding in
        it, which is what the Piano effect reads — and being a timing track rather than a hidden
        file, a wrong chord is a label you can retype.
      </p>
      <div class="timing-row">
        <input type="file" accept=".mid,.midi,audio/midi" @change="pickMidiFile" />
        <template v-if="midiChoices.length">
          <select v-model="midiTrack">
            <option v-for="choice in midiChoices" :key="choice" :value="choice">{{ choice }}</option>
          </select>
          <select v-model="midiLabelAs">
            <option value="notes">Note names</option>
            <option value="midi">MIDI numbers</option>
          </select>
          <label class="midi-field">Start adjust <input v-model.number="midiStartAdjustMs" type="number" step="50" /> ms</label>
          <label class="midi-field">Speed <input v-model.number="midiSpeedPct" type="number" min="1" step="5" /> %</label>
          <button @click="addMidiTimingTrack">Add track</button>
        </template>
      </div>
      <p v-if="midiMessage" class="timing-note">{{ midiMessage }}</p>

      <p class="timing-note">
        Or import a Papagayo <code>.pgo</code> lipsync file. Each voice becomes three tracks —
        phrases, words and phonemes — and the phonemes track is what a Faces effect reads. The
        offset is for files that were split into segments: the second segment starts where the
        first one ended.
      </p>
      <div class="timing-row">
        <input type="file" accept=".pgo,text/plain" @change="pickPapagayoFile" />
        <label class="midi-field">Offset <input v-model.number="papagayoOffsetFrames" type="number" step="1" /> frames</label>
      </div>
      <p v-if="papagayoMessage" class="timing-note">{{ papagayoMessage }}</p>
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

    <CommandPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <EffectWheel
      :shortcuts="shortcutsInForce" v-if="wheel" :x="wheel.x" :y="wheel.y" @pick="placeFromWheel" @close="wheel = null" />

    <div v-if="showRegionsPanel" class="models-panel">
      <div class="models-panel-head">
        <h2>Song structure</h2>
        <div class="models-panel-actions">
          <button :disabled="!store.sequence" @click="addBoundaryHere">Add boundary at playhead</button>
          <select v-if="store.body.timingTracks.length" @change="regionsFromTrack(Number(($event.target as HTMLSelectElement).value))">
            <option value="">Create from timing track…</option>
            <option v-for="(t, i) in store.body.timingTracks" :key="i" :value="i">{{ t.name }}</option>
          </select>
        </div>
      </div>
      <p class="timing-note">
        Named, coloured sections of the timeline — Intro, Verse, Chorus. Creating them from a
        timing track uses each mark's label as the section name.
      </p>

      <ul v-if="songRegions.length">
        <li v-for="(region, i) in songRegions" :key="i">
          <label>
            <span class="region-swatch" :style="{ background: REGION_COLORS[region.colorIndex] }" />
            <input
              type="text"
              :value="region.name"
              @change="renameBoundary(i, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <span class="row-effect-count">
            {{ Math.round(region.startMs / 1000) }}s–{{ Math.round(region.endMs / 1000) }}s
          </span>
          <button @click="removeBoundary(i)">×</button>
        </li>
      </ul>
      <p v-else class="empty">No sections yet.</p>

      <template v-if="songRegions.length > 1">
        <div class="models-panel-head"><h2>Copy a section's effects</h2></div>
        <div class="models-panel-actions">
          <select v-model="regionCopyFrom">
            <option value="">From…</option>
            <option v-for="r in songRegions" :key="`f-${r.startMs}`" :value="r.name">{{ r.name }}</option>
          </select>
          <select v-model="regionCopyTo">
            <option value="">To…</option>
            <option v-for="r in songRegions" :key="`t-${r.startMs}`" :value="r.name">{{ r.name }}</option>
          </select>
          <button :disabled="!regionCopyFrom || !regionCopyTo || regionCopyFrom === regionCopyTo" @click="copyRegionEffects">
            Copy
          </button>
        </div>
        <p class="timing-note">
          Effects are rebased on the target's start, so a chorus copied onto a later chorus lands
          in step with it. Anything that wouldn't fit is skipped rather than trimmed.
        </p>
      </template>
    </div>

    <div v-if="showPrefsPanel" class="models-panel">
      <div class="models-panel-head"><h2>Preferences</h2></div>
      <p class="timing-note">
        These are yours, not the show's — they're kept in this browser rather than saved with the
        project, so two people editing the same sequence don't change each other's settings.
      </p>
      <div class="models-panel-head"><h2>Effect shortcuts</h2></div>
      <p class="timing-note">
        The single letter that drops each effect. xLights keeps these in a file you edit by hand;
        here they're a preference. Case matters, as it does there — <code>o</code> is On and
        <code>O</code> is Off. Space, <code>t</code> and <code>s</code> are the transport and
        timing keys and can't be reassigned.
      </p>
      <p v-if="shortcutError" class="export-error">{{ shortcutError }}</p>
      <ul class="shortcut-list">
        <li v-for="row in shortcutRowsInForce" :key="row.id">
          <label :class="{ changed: row.changed }">{{ row.effect }}</label>
          <span class="models-panel-actions">
            <input
              class="shortcut-key"
              :value="row.key"
              maxlength="1"
              type="text"
              @change="assignShortcut(row.id, ($event.target as HTMLInputElement).value)"
            />
          </span>
        </li>
      </ul>
      <div class="models-panel-actions">
        <button :disabled="Object.keys(shortcutOverrides).length === 0" @click="updateShortcuts({})">
          Back to xLights' own
        </button>
      </div>

      <div class="models-panel-head"><h2>Perspectives</h2></div>
      <p class="timing-note">
        A saved arrangement of which panels are showing. Applying one closes what it didn't have
        open as well as opening what it did.
      </p>
      <div class="models-panel-actions">
        <input v-model="newPerspectiveName" type="text" placeholder="Name this arrangement" @keyup.enter="savePerspective" />
        <button :disabled="!newPerspectiveName.trim()" @click="savePerspective">Save</button>
      </div>
      <ul v-if="perspectives.length">
        <li v-for="p in perspectives" :key="p.name">
          <label>{{ p.name }}</label>
          <span class="models-panel-actions">
            <button @click="applyPerspective(p.name)">Apply</button>
            <button @click="deletePerspective(p.name)">×</button>
          </span>
        </li>
      </ul>

      <div class="models-panel-actions">
        <button
          title="Tear this panel off into its own window"
          @click="openPanelWindow(route.params.projectId as string, sequenceId, 'video')"
        >
          Open in its own window
        </button>
      </div>
      <ModelVideoExport
        :models="modelRecords"
        :body="store.body"
        :sequence="store.sequence"
        :audio="audioSeries ?? undefined"
      />

      <div class="models-panel-head">
        <h2>Colors</h2>
        <div class="models-panel-actions">
          <button @click="resetColors">Reset defaults</button>
          <button @click="exportColors">Export</button>
          <label class="background-pick">
            Import
            <input type="file" accept="application/json,.json" @change="importColors" />
          </label>
        </div>
      </div>
      <p v-if="colorsError" class="export-error">{{ colorsError }}</p>
      <label v-for="(label, key) in UI_COLOR_LABELS" :key="key" class="blend-row">
        {{ label }}
        <input
          type="color"
          :value="uiColors[key as keyof typeof uiColors]"
          @input="patchColor(key as keyof typeof uiColors, ($event.target as HTMLInputElement).value)"
        />
      </label>

      <div class="models-panel-head"><h2>Settings</h2></div>
      <label class="blend-row">
        Time display
        <select :value="prefs.timeFormat" @change="patchPrefs({ timeFormat: ($event.target as HTMLSelectElement).value as Preferences['timeFormat'] })">
          <option value="mmss">Minutes:seconds (1:05.43)</option>
          <option value="seconds">Seconds (65.43s)</option>
          <option value="frames">Frames</option>
        </select>
      </label>
      <label class="blend-row">
        Default effect length
        <span>
          <input
            type="number"
            min="50"
            max="60000"
            step="50"
            :value="prefs.defaultEffectMs"
            @change="patchPrefs({ defaultEffectMs: Number(($event.target as HTMLInputElement).value) })"
          />
          ms
        </span>
      </label>
      <label class="blend-row">
        <input
          type="checkbox"
          :checked="prefs.snapToTiming"
          @change="patchPrefs({ snapToTiming: ($event.target as HTMLInputElement).checked })"
        />
        Snap effect edges to timing marks
      </label>
      <label class="blend-row">
        Autosave
        <span>
          <input
            type="number"
            min="0"
            max="600"
            :value="prefs.autosaveSeconds"
            @change="patchPrefs({ autosaveSeconds: Number(($event.target as HTMLInputElement).value) })"
          />
          seconds (0 turns it off)
        </span>
      </label>
      <!-- The layout's own safety net. xLights offers 3, 10, 15 or 30 minutes for the same thing,
           so those are the choices here rather than a free number: the point is to pick one, and a
           free field invites 1, which snapshots a layout sixty times an hour. -->
      <label class="blend-row">
        Layout snapshots
        <span>
          <select
            :value="prefs.layoutSnapshotMinutes"
            @change="patchPrefs({ layoutSnapshotMinutes: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option :value="0">Off</option>
            <option :value="3">Every 3 minutes</option>
            <option :value="10">Every 10 minutes</option>
            <option :value="15">Every 15 minutes</option>
            <option :value="30">Every 30 minutes</option>
          </select>
        </span>
      </label>
      <label class="blend-row">
        <input
          type="checkbox"
          :checked="prefs.snapshotOnSave"
          @change="patchPrefs({ snapshotOnSave: ($event.target as HTMLInputElement).checked })"
        />
        Also snapshot the layout after an edit
      </label>
      <p class="timing-note">
        Snapshots of the whole layout, taken on the Layout page when something has changed. They're
        listed and restored there. "After an edit" is off by default: every model drag saves
        immediately here, where a save in xLights is a deliberate act.
      </p>
    </div>

    <div v-if="showPresetsPanel" class="models-panel">
      <div class="models-panel-head">
        <h2>Effect presets</h2>
        <div class="models-panel-actions">
          <input v-model="newPresetName" type="text" placeholder="Preset name" @keyup.enter="savePresetFromSelection" />
          <input v-model="newPresetGroup" type="text" placeholder="Group" />
          <button :disabled="!selectedEffect || !newPresetName.trim()" @click="savePresetFromSelection">
            Save selected effect
          </button>
        </div>
      </div>
      <p class="timing-note">
        A preset saves everything about an effect except where it is — its params, colours, blend
        mode, transitions and layer settings. Applying one drops it at the playhead on the row
        your selection is on. Presets are saved with the layout, so they're available in every
        sequence of this project.
      </p>
      <p v-if="presetError" class="export-error">{{ presetError }}</p>

      <div class="models-panel-head">
        <h2>Import</h2>
        <div class="models-panel-actions">
          <input v-model="presetImportGroup" type="text" placeholder="Into group" />
          <input type="file" accept=".xpreset,application/json" @change="importPreset" />
        </div>
      </div>

      <template v-for="g in presetGroups" :key="g.group">
        <div class="models-panel-head"><h2>{{ g.group }}</h2></div>
        <ul>
          <li v-for="p in g.presets" :key="`${g.group}/${p.name}`">
            <label>
              {{ p.name }}
              <span class="row-type">{{ p.settings.name }}</span>
            </label>
            <span class="models-panel-actions">
              <button :disabled="!presetTargetRow" @click="applyPreset(p)">Apply</button>
              <button @click="exportPreset(p)">Export</button>
              <button @click="deletePreset(p)">Delete</button>
            </span>
          </li>
        </ul>
      </template>
      <p v-if="presets.length === 0" class="empty">
        No presets yet. Select an effect on the grid, name it above and save it.
      </p>
    </div>

    <div v-if="showViewsPanel" class="models-panel">
      <div class="models-panel-head">
        <h2>Views</h2>
        <div class="models-panel-actions">
          <input v-model="newViewName" type="text" placeholder="New view name" @keyup.enter="addView" />
          <button :disabled="!newViewName.trim()" @click="addView">Add view</button>
        </div>
      </div>
      <p class="timing-note">
        A view is a named list of rows and the order they show in. Views are saved with the
        layout, so one set up here is available in every sequence of this project.
      </p>
      <p v-if="viewError" class="export-error">{{ viewError }}</p>

      <ul v-if="views.length">
        <li v-for="v in views" :key="v.name">
          <label>
            <input type="radio" :value="v.name" :checked="activeViewName === v.name" @change="activeViewName = v.name" />
            {{ v.name }}
            <span class="row-type">{{ v.rowKeys.length }} row{{ v.rowKeys.length === 1 ? "" : "s" }}</span>
          </label>
          <button class="row-effect-count" @click="deleteView(v.name)">Delete</button>
        </li>
      </ul>
      <p v-else class="empty">No views yet. The grid is showing the Master View — every row.</p>

      <template v-if="activeView">
        <div class="models-panel-head">
          <h2>Rows in "{{ activeView.name }}"</h2>
        </div>
        <ul>
          <li v-for="(key, i) in activeView.rowKeys" :key="key">
            <label>{{ rowNameFor(key) }}</label>
            <span class="models-panel-actions">
              <button :disabled="i === 0" title="Move up" @click="moveInView(key, -1)">↑</button>
              <button :disabled="i === activeView.rowKeys.length - 1" title="Move down" @click="moveInView(key, 1)">↓</button>
            </span>
          </li>
          <li v-if="activeView.rowKeys.length === 0" class="empty">
            This view has no rows yet — tick some below.
          </li>
        </ul>
        <div class="models-panel-head">
          <h2>Add or remove rows</h2>
        </div>
        <ul>
          <li v-for="row in rows" :key="rowKey(row)">
            <label>
              <input type="checkbox" :checked="activeView.rowKeys.includes(rowKey(row))" @change="toggleRowInView(row)" />
              {{ row.name }}
              <span class="row-type">{{ row.elementType }}</span>
            </label>
          </li>
        </ul>
      </template>
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
          <Waveform
            :peaks="peaks"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            @seek="seekTo"
            @scrub="scrubTo"
            @scrub-end="endScrub"
            :colors="uiColors"
          />
          <SequencerGrid
            :rows="visibleRows"
            :body="store.body"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :snap-to-timing="prefs.snapToTiming"
            :colors="uiColors"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            :selected-effect-id="store.selectedEffectId"
            :pending-effect-name="pendingEffectName"
            @select="handleSelect"
            @wheel="openWheel"
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
          :timing-track-names="timingTrackNames"
          :state-definition-names="stateDefinitionNames"
          :face-definition-names="faceDefinitionNames"
          :phoneme-names="phonemeNames"
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
.region-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 0.3rem;
  vertical-align: middle;
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
.shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 12rem;
  overflow: auto;
}
.shortcut-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
}
/* A changed binding is worth seeing at a glance - it is the one that won't match the manual. */
.shortcut-list label.changed {
  color: #e8c468;
}
.shortcut-key {
  width: 2.2rem;
  text-align: center;
}
.midi-field {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #aaa;
}
.midi-field input {
  width: 4.5rem;
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
