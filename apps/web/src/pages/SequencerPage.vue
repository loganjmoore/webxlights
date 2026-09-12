<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CANVAS_ONLY_EFFECTS, EFFECT_SCHEMAS, computeGeometryFromAttrs, defaultParamsFor, detectOnsets, estimateTempo, mouthNames, strandCount, strandSpecs, type AudioSeries, type OnsetBand, type BlendMode, type ColorAdjust, type LayerSettings, type StoredSwatch, type TransitionSpec } from "@webxlights/engine";
import { api, ApiError, type LyricAlignmentRecord, type ControllerRecord, type EffectParamValue, type ModelRecord, type ModelGroupRecord, type SequencerView, type SequenceEffect, type SequenceVersion } from "../lib/api";
import { computePeaks, decodeAudioFile, type PeakBucket } from "../lib/audio";
import { analyzeAudioBuffer } from "../lib/audioAnalysis";
import { downloadFseq, exportSequenceToFseq } from "../lib/fseqExport";
import { parseMidi, parsePapagayo, type ParsedMidi } from "@webxlights/formats";
import { ALL_TRACKS, describeMidiImport, midiTrackChoices, timingTrackFromMidi } from "../lib/midiTiming";
import { describePapagayoImport, tracksFromPapagayo } from "../lib/papagayoTiming";
import { breakdownPhrases, breakdownWords, cellsOf, phonemesTrackName, wordsTrackName } from "../lib/lyricBreakdown";
import { alignLyrics, lyricTimingTracks } from "../lib/lyricAlign";
import { downloadXtiming } from "../lib/xtimingExport";
import { effectIcon } from "../lib/effectIcons";
import { filterRanked, isDefaultStrandName } from "../lib/listFilter";
import { useTearOff } from "../lib/tearOff";
import ModalPanel from "../components/ModalPanel.vue";
import MenuButton, { type MenuItem } from "../components/MenuButton.vue";
import AppBar from "../components/AppBar.vue";
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
import { fitsOnRow, moveEffectInTime, moveEffectToRow } from "../lib/moveEffects";
import { loopWithin, startOfPlay, type PlayRange } from "../lib/playRange";
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
import {
  FRAME_MS_CHOICES,
  GRID_ROW_HEIGHT_PX,
  GRID_SPACING_LABELS,
  formatTime,
  loadPreferences,
  sanitize,
  savePreferences,
  type Preferences,
} from "../lib/preferences";
import { intervalAt, subdivisionMarks } from "../lib/timingSubdivide";
import { marksInForce, placementFor } from "../lib/effectPlacement";
import { withFade } from "../lib/effectFade";
import { ALIGN_MODES, alignedTo, type AlignMode } from "../lib/alignEffects";
import { clipboardFrom, pastedAt, type EffectClipboard } from "../lib/effectClipboard";
import { MAX_LAYERS, addLayer, canAddLayer, layerCount, layerOf, removeLayer } from "../lib/effectLayers";
import { WINDOW_SHORTCUTS, type WindowTarget } from "../lib/windowShortcuts";
import { describeCriteria, matchingEffectIds, type EffectCriteria } from "../lib/selectEffects";
import { expandToMark, jumpTargetMs } from "../lib/expandEffect";
import type { SequenceMetadata, SequenceRow, TimingTrack } from "../lib/api";
import { DEFAULT_ZOOM_INDEX, ZOOM_STEPS, clampZoomIndex, scrollLeftHolding, wheelScrollDelta, zoomIndexIn, zoomIndexOut } from "../lib/zoom";
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
import { houseModelFrom, type HouseModel } from "../lib/houseModel";
import HousePreview from "../components/HousePreview.vue";

const houseModel = ref<HouseModel | null>(null);
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
// The Models panel's typeahead and its "everything" switch. A show's rows are mostly numbered
// strands nobody sequences individually; the list shows models, groups, sub-models and any
// strand someone bothered to name, and the rest only on request.
const modelsQuery = ref("");
const showEveryRow = ref(false);
const modelsPanelRows = computed(() => {
  const base = showEveryRow.value ? rows.value : rows.value.filter((r) => r.elementType !== "strand" || !isDefaultStrandName(r.name));
  return filterRanked(base, modelsQuery.value, (r) => r.name);
});
const hiddenByDefaultCount = computed(() => rows.value.filter((r) => r.elementType === "strand" && isDefaultStrandName(r.name)).length);
// The same typeahead for the Views panel's row picker and the preset list.
const viewRowsQuery = ref("");
const viewPickerRows = computed(() => {
  const base = showEveryRow.value ? rows.value : rows.value.filter((r) => r.elementType !== "strand" || !isDefaultStrandName(r.name));
  return filterRanked(base, viewRowsQuery.value, (r) => r.name);
});
const presetsQuery = ref("");
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
// Index into ZOOM_STEPS (lib/zoom.ts), not a multiplier - the gestures step along the ladder.
const zoomLevel = ref(DEFAULT_ZOOM_INDEX);
// The clipboard holds a *block*, as relative offsets (lib/effectClipboard.ts) - copying eight
// effects across three props and dropping them on the second chorus is the bulk edit block
// selection was built for, and it was still one effect at a time.
const clipboard = ref<EffectClipboard | null>(null);
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

// Automatic lyric timing (Sequencer > Timing tracks > Auto lyrics). The server listens to the
// song; the browser polls, then lines the heard words up with the pasted lyrics and makes the
// same three tracks a Papagayo import would (lib/lyricAlign.ts).
// Sharing to the library (Sequence > Share to library). A frozen copy with the names of the
// models it was written for, so someone else can map it onto their layout.
const showSharePanel = ref(false);
const shareTitle = ref("");
const shareDescription = ref("");
const shareAudio = ref(false);
const shareBusy = ref(false);
const shareMessage = ref("");
function openShare(): void {
  if (!shareTitle.value) shareTitle.value = store.sequence?.name ?? "";
  shareMessage.value = "";
  showSharePanel.value = true;
}
async function shareToLibrary(): Promise<void> {
  if (!shareTitle.value.trim()) {
    shareMessage.value = "Give it a title.";
    return;
  }
  shareBusy.value = true;
  try {
    // Saved first, so the copy is what is on screen and not what was on screen a minute ago.
    await store.saveNow();
    const entry = await api.publishSequence(sequenceId.value, { title: shareTitle.value.trim(), description: shareDescription.value.trim() || undefined, include_audio: shareAudio.value });
    shareMessage.value = `Shared as "${entry.title}" with ${entry.donors.length} models${entry.has_audio ? " and the audio" : ""}. It is in the Library tab now.`;
  } catch (err) {
    let text = err instanceof Error ? err.message : "Couldn't share it.";
    if (err instanceof ApiError) {
      try {
        text = (JSON.parse(err.message) as { message?: string }).message ?? text;
      } catch {
        // Not JSON.
      }
    }
    shareMessage.value = text;
  } finally {
    shareBusy.value = false;
  }
}

const LYRICS_TRACK = "Lyrics";
const lyricsText = ref("");
const lyricsBusy = ref(false);
const lyricsMessage = ref("");
let lyricsPoll: ReturnType<typeof setTimeout> | undefined;

function applyLyricAlignment(record: LyricAlignmentRecord): void {
  if (!record.result) return;
  const alignment = alignLyrics(record.lyrics, record.result.words, store.sequence?.duration_ms);
  const tracks = lyricTimingTracks(LYRICS_TRACK, alignment, record.result.pronunciations);
  for (const track of tracks) replaceTrackNamed(track.name, track);
  const total = alignment.words.length;
  const known = alignment.words.filter((w) => record.result!.pronunciations[w.key]).length;
  lyricsMessage.value =
    `Timed ${alignment.phrases.length} lines and ${total} words; ${alignment.heard} of the words were heard in the song and the rest were placed between them. ` +
    `${known} words' mouth shapes came from the dictionary. Play it through and nudge any mark that is off - this gets most of the way, not all of it.`;
}

async function pollLyrics(): Promise<void> {
  clearTimeout(lyricsPoll);
  try {
    const record = await api.latestLyricAlignment(sequenceId.value);
    if (!record) return;
    if (record.status === "done") {
      lyricsBusy.value = false;
      applyLyricAlignment(record);
    } else if (record.status === "failed") {
      lyricsBusy.value = false;
      lyricsMessage.value = record.error ?? "The listen failed.";
    } else {
      lyricsBusy.value = true;
      lyricsMessage.value = record.status === "running" ? "Listening to the song… a few minutes for a full-length track." : "Queued…";
      lyricsPoll = setTimeout(() => void pollLyrics(), 4000);
    }
  } catch (err) {
    lyricsBusy.value = false;
    lyricsMessage.value = err instanceof Error ? err.message : "Couldn't check on the timing.";
  }
}

async function timeLyrics(): Promise<void> {
  if (!lyricsText.value.trim()) {
    lyricsMessage.value = "Paste the lyrics first, one line per phrase.";
    return;
  }
  lyricsBusy.value = true;
  lyricsMessage.value = "Sending the song off to be listened to…";
  try {
    await api.alignLyrics(sequenceId.value, lyricsText.value);
    lyricsPoll = setTimeout(() => void pollLyrics(), 3000);
  } catch (err) {
    lyricsBusy.value = false;
    let message = err instanceof Error ? err.message : "Couldn't start the timing.";
    if (err instanceof ApiError) {
      try {
        message = (JSON.parse(err.message) as { message?: string }).message ?? message;
      } catch {
        // Not JSON; the text stands.
      }
    }
    lyricsMessage.value = message;
  }
}

/** The lyric tracks as an xLights .xtiming, for the desktop app's Import Timing Track. */
function downloadLyricsXtiming(): void {
  const layers = [LYRICS_TRACK, wordsTrackName(LYRICS_TRACK), phonemesTrackName(LYRICS_TRACK)]
    .map((name) => store.body.timingTracks.find((t) => t.name === name))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => cellsOf(t).filter((c) => c.label.trim().length > 0));
  if (layers.length === 0) {
    lyricsMessage.value = "No lyric tracks to export yet.";
    return;
  }
  downloadXtiming(`${store.sequence?.name ?? "sequence"} lyrics`, layers);
}
onBeforeUnmount(() => clearTimeout(lyricsPoll));

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
  return (containerWidth / duration) * ZOOM_STEPS[clampZoomIndex(zoomLevel.value)]!;
});

// The row-label gutter both the waveform and the grid start after. Kept in step with their own
// copies of it - a timeline that scrolls to a moment has to agree with the one that drew it.
const TIMELINE_LABEL_WIDTH = 140;

// The element that scrolls the waveform and the grid together.
const hScrollRef = ref<HTMLDivElement | null>(null);

/**
 * Steps the zoom, holding a moment still under a point on screen.
 *
 * The anchor is what makes zooming usable: without it the content grows from its left edge while
 * the viewport stays put, so zooming in on the second chorus lands you in the first verse. With no
 * anchor given - the keyboard, or the dropdown - it holds the playhead in the middle, which is the
 * moment you were looking at.
 */
function zoomBy(direction: 1 | -1, anchor?: { ms: number; clientX: number }): void {
  // xLights' Settings > View > Timeline Zooming: the cursor, or the play marker. Applied by
  // dropping the anchor the gesture supplied, which makes the keyboard and the mouse behave
  // identically when the preference says "playhead" - which is the point of the setting.
  if (prefs.value.timelineZoomAnchor === "playhead") anchor = undefined;
  const next = direction > 0 ? zoomIndexIn(zoomLevel.value) : zoomIndexOut(zoomLevel.value);
  if (next === zoomLevel.value) return;
  const el = hScrollRef.value;
  const anchorMs = anchor?.ms ?? playheadMs.value;
  const rect = el?.getBoundingClientRect();
  const offsetPx = anchor && rect ? anchor.clientX - rect.left : (el?.clientWidth ?? 0) / 2;

  zoomLevel.value = next;
  if (!el) return;
  // After the tick, because the content is only as wide as the new zoom once Vue has applied it -
  // reading scrollWidth now would clamp against the old width and land short.
  void nextTick(() => {
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollLeft = scrollLeftHolding(anchorMs, offsetPx, pxPerMs.value, TIMELINE_LABEL_WIDTH, maxScroll);
  });
}

/** "Right-click the timeline to reset the zoom level." */
function resetZoom(): void {
  zoomLevel.value = DEFAULT_ZOOM_INDEX;
}

/**
 * Ctrl+wheel zooms, shift+wheel scrolls sideways.
 *
 * On the shared scroller so both gestures work over the waveform and the grid alike - "use the
 * mouse scroll wheel to go in or out" is described over an effect edge, and there is no reason for
 * it to stop working an inch higher up.
 */
function onTimelineWheel(e: WheelEvent): void {
  const el = hScrollRef.value;
  if (!el) return;

  if (e.ctrlKey || e.metaKey) {
    // Prevented, or the browser zooms the whole page instead - which is the same gesture and a
    // very confusing thing to get by accident.
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const offsetPx = e.clientX - rect.left;
    const ms = Math.max(0, (el.scrollLeft + offsetPx - TIMELINE_LABEL_WIDTH) / pxPerMs.value);
    zoomBy(e.deltaY < 0 ? 1 : -1, { ms, clientX: e.clientX });
    return;
  }

  if (e.shiftKey) {
    e.preventDefault();
    el.scrollLeft += wheelScrollDelta(e.deltaX, e.deltaY);
  }
}

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

// Takes only the three fields it uses, so a stored row and a grid row can both be keyed - they
// are the same row, and only one of them carries a display name.
function rowKey(row: Pick<GridRow, "elementType" | "elementId" | "subName">): string {
  // Deliberately without the layer index: a view names rows, and a row that had been expanded
  // into layers since the view was saved would otherwise stop matching it.
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
const presetGroups = computed(() => groupPresets(filterRanked(presets.value, presetsQuery.value, (p) => `${p.group} ${p.name}`)));

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

/**
 * Which rows are showing their effect layers (manual: Sequencer > Layers).
 *
 * A display state rather than stored data, which is what "Collapse Layers" is - "collapses the
 * expanded effect layers back down to a single row". Collapsing hides the layers; it doesn't
 * merge them, and the effects on layer 3 are still on layer 3 afterwards.
 */
const expandedLayerKeys = ref<Set<string>>(new Set());

/**
 * Which group and model rows are open (manual: "Toggle Element Expand (to show models in group,
 * strands, nodes, etc)").
 *
 * Rebuilding the row list is what actually adds or removes the nested rows, so this is bumped
 * through `reloadRows` rather than read straight into `visibleRows` - the children have to be
 * built from the model records, which `rows` is the only thing holding.
 */
const expandedElementKeys = ref<Set<string>>(new Set());

function toggleRowExpanded(row: GridRow): void {
  const key = `${row.elementType}:${row.elementId}:`;
  const next = new Set(expandedElementKeys.value);
  if (!next.delete(key)) next.add(key);
  expandedElementKeys.value = next;
  void loadRows();
}

function effectsForKey(row: GridRow): SequenceEffect[] {
  const found = store.body.rows.find(
    (r) => r.elementType === row.elementType && r.elementId === row.elementId && (r.subName ?? undefined) === row.subName,
  );
  return found?.effects ?? [];
}

/** A row expanded into one row per layer, bottom layer last so the stack reads top-down. */
function withLayerRows(row: GridRow): GridRow[] {
  void layerRowsTick.value; // adding an empty layer changes no effect, so the count needs a nudge
  if (!expandedLayerKeys.value.has(rowKey(row))) return [row];
  const count = layerCount(effectsForKey(row));
  // Drawn highest-first, because the grid runs top-down and the stack composites bottom-up: the
  // layer nearest the viewer belongs at the top of the list, the way it is in every other editor.
  return Array.from({ length: count }, (_, i) => count - 1 - i).map((layerIndex) => ({
    ...row,
    layerIndex,
    name: `${row.name} · L${layerIndex + 1}`,
  }));
}

const visibleRows = computed(() => {
  // A nested row only shows when the row it hangs off is open. Checked against the parent's key
  // rather than against a flag on the child, so opening a group and then a model inside it works
  // without the two having to agree about each other.
  const open = (r: GridRow): boolean => r.parentKey === undefined || expandedElementKeys.value.has(r.parentKey);
  const shown = rows.value.filter((r) => open(r) && !hiddenRowKeys.value.has(rowKey(r))).flatMap(withLayerRows);
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

/**
 * A model's strand rows.
 *
 * Only offered when there is more than one: a prop wired as a single run has one strand, and a
 * strand row identical to the model row would be a row that does nothing but take space.
 */
function strandRowsFor(model: ModelRecord): GridRow[] {
  if (!model.supported) return [];
  let geometry: ReturnType<typeof computeGeometryFromAttrs>;
  try {
    geometry = computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return []; // a model whose geometry won't compute has no strands to show
  }
  // computeGeometryFromAttrs returns null for a model type it can't lay out; no geometry means no
  // strands to show, which is the same answer as a model with one run.
  if (!geometry || strandCount(geometry) < 2) return [];
  const geo = geometry;
  return strandSpecs(geo).map((spec) => ({
    elementType: "strand" as const,
    elementId: model.id,
    subName: spec.name,
    // Just the strand's own name: it is drawn indented under the model it belongs to, so
    // repeating the model's name in every child row only makes the labels too long to read.
    name: spec.name,
  }));
}

async function loadRows(): Promise<void> {
  // The sequencer needs a project's layout; fetch it via the sequence's project.
  const layouts = await api.listLayouts(Number(route.params.projectId));
  const layout = layouts[0];
  houseModel.value = houseModelFrom(layout?.settings);
  if (!layout) return;
  const [models, groups]: [ModelRecord[], ModelGroupRecord[]] = await Promise.all([
    api.listModels(layout.id),
    api.listModelGroups(layout.id),
  ]);
  // Sub-model rows sit directly under the model they belong to, which is where xLights puts
  // them and where anyone looking for "the star on the mega tree" will look for them.
  // Groups first and closed, then the models that aren't in any group. A real show has hundreds
  // of models, strands and sub-models, and listing every one of them at once buries the group you
  // meant to sequence somewhere in the middle. Double-clicking a name opens it (SequencerGrid's
  // rowExpand), which is xLights' own "+".
  //
  // A model in two groups is listed under the first of them only. Listing it under both would put
  // two rows on screen holding the same effects, since an effect belongs to the model rather than
  // to the group it is being viewed through - and editing one while looking at the other is a
  // worse confusion than having to remember which group a prop was filed under.
  const groupOf = new Map<number, ModelGroupRecord>();
  for (const g of groups) {
    for (const member of g.members) if (!groupOf.has(member.id)) groupOf.set(member.id, g);
  }

  const childRowsFor = (m: ModelRecord, parentKey: string, depth: number): GridRow[] => [
    // "Click on the Model name in the sequencer to display the Strand names." Derived from the
    // model's wiring rather than stored, so they can't go stale (engine/models/strands.ts).
    ...strandRowsFor(m).map((r) => ({ ...r, parentKey, depth })),
    ...(m.sub_models ?? []).map((sm) => ({
      elementType: "submodel" as const,
      elementId: m.id,
      subName: sm.name,
      name: sm.name,
      parentKey,
      depth,
    })),
  ];

  const modelRow = (m: ModelRecord, parentKey: string | undefined, depth: number): GridRow[] => {
    const key = `model:${m.id}:`;
    const children = childRowsFor(m, key, depth + 1);
    return [
      {
        elementType: "model" as const,
        elementId: m.id,
        name: m.name,
        parentKey,
        depth,
        ...(children.length > 0 ? { expanded: expandedElementKeys.value.has(key) } : {}),
      },
      ...children,
    ];
  };

  rows.value = [
    ...groups.flatMap((g) => {
      const key = `group:${g.id}:`;
      const members = g.members
        .map((member) => models.find((m) => m.id === member.id))
        .filter((m): m is ModelRecord => !!m && groupOf.get(m.id)?.id === g.id);
      return [
        {
          elementType: "group" as const,
          elementId: g.id,
          name: g.name,
          ...(members.length > 0 ? { expanded: expandedElementKeys.value.has(key) } : {}),
        },
        ...members.flatMap((m) => modelRow(m, key, 1)),
      ];
    }),
    ...models.filter((m) => !groupOf.has(m.id)).flatMap((m) => modelRow(m, undefined, 0)),
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

// The transport runs on its own clock, and treats the audio element as a *source* of time rather
// than as the thing that decides whether time passes at all.
//
// It used to be the other way round: every one of these functions began `const el = audioEl.value;
// if (!el) return;`, and the element itself is `v-if="audioUrl"` - it does not exist until a track
// has been loaded into this browser session. So a sequence with no audio, or one whose audio
// hadn't been re-picked after a reload, could not play at all: pressing space did nothing, the
// playhead never moved, and the preview sat on whatever frame it was last given. That reads
// exactly like a frozen preview, because it is one.
//
// The same failure had a second door: `playing` was set only by the element's own `play` event,
// so an `el.play()` rejected by the browser's autoplay policy left the flag false and the clock
// stopped, with nothing on screen to say why.
function togglePlay(): void {
  if (playing.value) {
    pausePlayback();
    return;
  }
  // "Highlighting a portion of the waveform will cause only that section to be played. Pressing
  // the spacebar will replay that section."
  const start = startOfPlay(playRange.value, playheadMs.value);
  if (start !== null) playheadMs.value = start;
  const el = audioEl.value;
  if (el) {
    el.currentTime = playheadMs.value / 1000;
    // A rejection is not fatal any more - the sequence plays silently rather than not at all.
    void el.play().catch(() => {});
  }
  playing.value = true;
}

function pausePlayback(): void {
  playing.value = false;
  audioEl.value?.pause();
}

/**
 * The element pausing itself - the end of the track, or the user reaching its native controls.
 *
 * Not treated as "stop the transport" when the sequence is longer than its audio: the lights
 * carry on to the end of the sequence, which is what the remaining frames are for.
 */
function onAudioPause(): void {
  const durationMs = store.sequence?.duration_ms ?? 0;
  if (playing.value && playheadMs.value < durationMs) return;
  playing.value = false;
}

function stop(): void {
  playing.value = false;
  const el = audioEl.value;
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
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

// xLights' play range: "You can highlight a range on the waveform to play only that section...
// The 'Replay' button will replay the highlighted section... when it reaches the end of the area,
// will loop back to play from the beginning of that area."
//
// Which is the point of it: you work on one chorus by hearing it over and over, and without a
// loop that means reaching for the mouse every eight seconds.
const playRange = ref<PlayRange | null>(null);

function clearPlayRange(): void {
  playRange.value = null;
}

function onTimeUpdate(): void {
  // Still wired up for two reasons. It is the only thing that fires after a seek while paused,
  // and it is the only thing that fires at all once this tab is in the background: browsers pause
  // requestAnimationFrame in a hidden tab, but the audio element keeps playing and keeps firing
  // this. That makes it the correction the popped-out preview gets while somebody is watching
  // that window instead of this one - the preview runs its own clock between these
  // (lib/previewClock.ts), and without them it would free-run with nothing to check against.
  syncPlayheadFromAudio();
  if (playing.value) broadcastTransport();
}

/**
 * Reads the playhead off the audio element.
 *
 * Rounded to whole milliseconds - the sequence's own resolution - so a frame that lands mid-
 * millisecond doesn't make every downstream `renderRowAtMs` recompute for a difference nothing
 * can display.
 */
function syncPlayheadFromAudio(): void {
  const el = audioEl.value;
  if (!el) return;
  playheadMs.value = Math.round(el.currentTime * 1000);

  // Looped rather than stopped at the end: the manual's Replay button loops, and a range you have
  // to restart by hand is barely better than no range. The rule lives in playRange.ts so the two
  // callers - starting play, and every time update - can't disagree about it.
  const jumpTo = loopWithin(playRange.value, playheadMs.value, playing.value);
  if (jumpTo !== null) {
    el.currentTime = jumpTo / 1000;
    playheadMs.value = jumpTo;
  }
}

// The playhead advances on animation frames while the transport is running, not on the audio
// element's `timeupdate`.
//
// `timeupdate` fires about four times a second - the spec leaves the rate to the browser, and
// every engine picks something in the 4Hz region. Everything downstream of `playheadMs` was
// therefore animating at 4fps: the playhead line, the house preview, and the popped-out preview
// window. Effects that are meant to move continuously - Meteors, Ripple, anything with a speed -
// came out as a slideshow, which is not what they look like when rendered to a file.
//
// One frame loop drives all of them, and it also broadcasts, because the popped-out window used
// to receive a transport message only on play/pause and on a command from its own controls: it
// sat frozen on the frame play started at until you pressed something.
let playbackRaf: number | null = null;
// Kept as a float so a 16.67ms frame doesn't lose a third of a millisecond to rounding on every
// tick - which is two seconds of drift across a five-minute song.
let clockMs = 0;
let lastFrameAt = 0;

function startPlaybackFrames(): void {
  if (playbackRaf !== null) return;
  clockMs = playheadMs.value;
  lastFrameAt = performance.now();
  const tick = (): void => {
    if (!playing.value) {
      playbackRaf = null;
      return;
    }
    const now = performance.now();
    const el = audioEl.value;
    if (el && !el.paused && !el.ended) {
      // Audio is the master clock whenever it is actually running: a light show that drifts
      // against its own music is worse than one that stutters, and the element's clock is the
      // one the speakers are following.
      clockMs = el.currentTime * 1000;
    } else {
      // No track, or the browser refused to start it. Wall-clock time keeps the sequence moving
      // at the right speed with nothing to sync to.
      clockMs += now - lastFrameAt;
    }
    lastFrameAt = now;

    const durationMs = store.sequence?.duration_ms ?? 0;
    const jumpTo = loopWithin(playRange.value, Math.round(clockMs), true);
    if (jumpTo !== null) {
      clockMs = jumpTo;
      if (el) el.currentTime = jumpTo / 1000;
    } else if (durationMs > 0 && clockMs >= durationMs) {
      // The end, for a run that isn't following an audio element - which would have fired
      // `ended` for us.
      clockMs = durationMs;
      playheadMs.value = durationMs;
      pausePlayback();
      broadcastTransport();
      playbackRaf = null;
      return;
    }

    playheadMs.value = Math.round(clockMs);
    broadcastTransport();
    playbackRaf = requestAnimationFrame(tick);
  };
  playbackRaf = requestAnimationFrame(tick);
}

function stopPlaybackFrames(): void {
  if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
  playbackRaf = null;
  // One last message so a paused preview window agrees with this one about where the playhead
  // stopped, rather than keeping whatever frame the loop happened to end on.
  broadcastTransport();
}

// Driven off `playing` rather than off the play/pause functions, so the loop follows the audio
// element however it was started - the transport buttons, the space bar, or a command posted
// from the preview window.
watch(playing, (isPlaying) => (isPlaying ? startPlaybackFrames() : stopPlaybackFrames()));

function armEffect(name: string): void {
  pendingEffectName.value = pendingEffectName.value === name ? null : name;
}

/**
 * The layer an effect placed on a row belongs to.
 *
 * A collapsed row has no layer of its own, so anything placed there goes on the bottom - which is
 * where everything went before layers had an interface.
 */
function layerFor(row: GridRow): { layerIndex?: number } {
  return row.layerIndex === undefined ? {} : { layerIndex: row.layerIndex };
}

function handlePlace(row: GridRow, startMs: number, endMs: number): void {
  if (!pendingEffectName.value) return;
  // Same floor as a drop. Sizing an effect by dragging it out on the grid is the one gesture
  // that can produce any width at all, including a two-pixel flick that lands something on the
  // row you then can't get hold of.
  const width = Math.max(endMs - startMs, minimumEffectMs.value);
  const end = Math.min(startMs + width, store.sequence?.duration_ms ?? startMs + width);
  store.addEffect(row.elementType, row.elementId, row.subName, {
    id: newEffectId(),
    name: pendingEffectName.value,
    startMs: Math.max(0, Math.min(startMs, end - width)),
    endMs: end,
    params: defaultParamsFor(pendingEffectName.value),
    ...layerFor(row),
  });
  pendingEffectName.value = null;
}

// Dragging a tile from the palette onto the grid.
//
// Pointer events rather than HTML5 drag-and-drop, which is what this used to be. Native DnD hands
// the gesture to the OS: you get a washed-out screenshot of the button as the ghost, a "copy"
// cursor with a badge, throttled position updates, and no way to draw where the effect will land
// until the drop. With pointer capture the page owns the whole gesture - the tile lifts under the
// pointer, the grid draws a snapped outline exactly where the effect will go (green when it fits,
// red when something is in the way), Escape cancels - which is how a desktop editor feels.
//
// The existing arm-then-drag-on-the-grid gesture (which sizes the effect in one motion) is
// untouched and still the way to place a specific length.
const gridRef = ref<InstanceType<typeof SequencerGrid> | null>(null);

// The effect settings panel can leave the page for a window of its own - a second monitor is
// where a sequencer's inspector belongs. While it is away the grid takes its width.
const propsWindow = useTearOff(() => "Effect settings");
const tileDrag = ref<{
  name: string;
  x: number;
  y: number;
  target: { row: GridRow; rowIndex: number; ms: number } | null;
  blocked: boolean;
} | null>(null);
let tilePointer: { id: number; name: string; startX: number; startY: number; el: HTMLElement; started: boolean } | null = null;
// A drag ends with a pointerup on the tile, which the browser follows with a click; that click
// must not also arm the effect.
let suppressTileClick = false;

function onTileClick(name: string): void {
  if (suppressTileClick) {
    suppressTileClick = false;
    return;
  }
  armEffect(name);
}

function onTilePointerDown(e: PointerEvent, name: string): void {
  if (e.button !== 0) return;
  // A mouse press on a tile must not start a text selection or a native drag of the glyph:
  // either one cancels the pointer sequence mid-drag and the drop never arrives.
  if (e.pointerType === "mouse") e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  tilePointer = { id: e.pointerId, name, startX: e.clientX, startY: e.clientY, el, started: false };
  el.setPointerCapture(e.pointerId);
}

function onTilePointerMove(e: PointerEvent): void {
  const pointer = tilePointer;
  if (!pointer || e.pointerId !== pointer.id) return;
  if (!pointer.started) {
    // Four pixels of slop, so a click that wobbles is still a click.
    if (Math.abs(e.clientX - pointer.startX) < 4 && Math.abs(e.clientY - pointer.startY) < 4) return;
    pointer.started = true;
    document.body.classList.add("dragging-tile");
    window.addEventListener("keydown", onTileDragKey, true);
    // The tile holds pointer capture, so its own pointerup is the normal end. These are the
    // ends that arrive when capture is lost - the window losing focus, a release the button
    // never hears about - because a proxy that never leaves the screen is a stuck drag.
    window.addEventListener("pointerup", onTilePointerUp, true);
    window.addEventListener("mouseup", onTileMouseUp, true);
    window.addEventListener("blur", cancelTileDrag);
    pointer.el.addEventListener("lostpointercapture", onTileLostCapture);
  }
  const target = gridRef.value?.dropTargetAt(e.clientX, e.clientY) ?? null;
  let blocked = false;
  if (target) {
    const { startMs, endMs } = placementAt(target.ms);
    blocked = gridRef.value?.showDropGhost(target.rowIndex, startMs, endMs) ?? false;
  } else {
    gridRef.value?.clearDropGhost();
  }
  tileDrag.value = { name: pointer.name, x: e.clientX, y: e.clientY, target, blocked };
}

function onTilePointerUp(e: PointerEvent): void {
  const pointer = tilePointer;
  if (!pointer || e.pointerId !== pointer.id) return;
  const drag = tileDrag.value;
  try {
    if (pointer.started) {
      suppressTileClick = true;
      // The latest position wins: the window-level fallback may fire before the tile's own,
      // and the pointer may have moved since the last move event.
      const target = gridRef.value?.dropTargetAt(e.clientX, e.clientY) ?? drag?.target ?? null;
      if (target && !drag?.blocked) handleDropEffect(target.row, pointer.name, target.ms);
    }
  } finally {
    // Whatever the drop did or failed to do, the drag is over.
    finishTileDrag();
  }
}

/** A mouse release that arrived without its pointer event: treat it as the release. */
function onTileMouseUp(e: MouseEvent): void {
  if (!tilePointer?.started) return;
  onTilePointerUp(Object.assign(e, { pointerId: tilePointer.id }) as unknown as PointerEvent);
}

function onTileLostCapture(): void {
  // Capture can go without a pointerup (another element took it, the OS interrupted): the
  // pointer is still down somewhere, so the drag continues on window events until it ends.
  if (!tilePointer?.started) return;
  window.addEventListener("pointermove", onTilePointerMove, true);
}

function onTileDragKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  cancelTileDrag();
}

function cancelTileDrag(): void {
  if (tilePointer?.started) suppressTileClick = true;
  finishTileDrag();
}

function finishTileDrag(): void {
  const pointer = tilePointer;
  if (pointer) {
    pointer.el.removeEventListener("lostpointercapture", onTileLostCapture);
    try {
      if (pointer.el.hasPointerCapture?.(pointer.id)) pointer.el.releasePointerCapture(pointer.id);
    } catch {
      // Already released; nothing to do.
    }
  }
  tilePointer = null;
  tileDrag.value = null;
  gridRef.value?.clearDropGhost();
  document.body.classList.remove("dragging-tile");
  window.removeEventListener("keydown", onTileDragKey, true);
  window.removeEventListener("pointerup", onTilePointerUp, true);
  window.removeEventListener("mouseup", onTileMouseUp, true);
  window.removeEventListener("pointermove", onTilePointerMove, true);
  window.removeEventListener("blur", cancelTileDrag);
}

// Kept as the fallback for anything that runs before preferences load; the preference is what
// actually drives a drop (see prefs.defaultEffectMs).
const DEFAULT_DROPPED_EFFECT_MS = 1000;

/**
 * Which timing track's marks are in force: an index, or -1 for all of them.
 *
 * xLights' notion of a *selected* timing track, which the manual leans on when it says "if no
 * timing track is selected then you can drag and drop even if you have no timing marks". It drives
 * snapping and where a dropped effect lands. -1 keeps the old behaviour of treating every track's
 * marks as one set, which is right for someone who only ever has one.
 */
const activeTrackIndex = ref(0);

const activeMarks = computed(() => marksInForce(store.body.timingTracks, activeTrackIndex.value < 0 ? "all" : activeTrackIndex.value));

// A track can be deleted or the sequence reloaded under a selection that no longer exists; falling
// back to "all" rather than an empty set means placement keeps working instead of silently
// reverting to fixed-length drops with no visible reason.
watch(
  () => store.body.timingTracks.length,
  (count) => {
    if (activeTrackIndex.value >= count) activeTrackIndex.value = count > 0 ? 0 : -1;
  },
);

/**
 * Where a dropped effect lands.
 *
 * "Release it between two timing marks" - so it fills that interval. The default length is the
 * fallback the manual gives for having no marks to land between ("the effect defaults to 1 second
 * long"), not the rule; we had it the other way round, which meant dropping an effect on a beat
 * gave you something that had to be dragged to fit the beat it was dropped on.
 */
function placementAt(atMs: number): { startMs: number; endMs: number } {
  return placementFor(
    activeMarks.value,
    atMs,
    store.sequence?.duration_ms ?? 0,
    prefs.value.defaultEffectMs || DEFAULT_DROPPED_EFFECT_MS,
    minimumEffectMs.value,
  );
}

/**
 * The narrowest an effect is allowed to be placed, in milliseconds at the current zoom.
 *
 * The rule is a pixel one: nothing gets placed narrower than `MIN_EFFECT_PX` on screen. In
 * milliseconds it can't be a constant, because the same effect is a pixel wide zoomed out to the
 * whole song and half the screen zoomed into a bar - and at a pixel wide it can't be clicked, so
 * it can't be selected, moved or deleted either. Dropping between two closely-spaced timing
 * marks at a low zoom is exactly how you end up with one.
 */
const MIN_EFFECT_PX = 30;
const minimumEffectMs = computed(() => MIN_EFFECT_PX / Math.max(pxPerMs.value, 1e-9));

// A tile dropped on a row (onTilePointerUp): placed at the default length, resizable after.
function handleDropEffect(row: GridRow, name: string, startMs: number): void {
  const { startMs: from, endMs: to } = placementAt(startMs);
  store.addEffect(row.elementType, row.elementId, row.subName, {
    id: newEffectId(),
    name,
    startMs: from,
    endMs: to,
    params: defaultParamsFor(name),
    ...layerFor(row),
  });
}

/**
 * A finished drag: where the effects landed.
 *
 * One event for the whole drag, so it is one undo entry. This replaced a live update on every
 * pointermove, which needed a snapshot taken at drag start and carefully *not* taken again per
 * move - the ghost outline made that unnecessary as well as showing where things will land, since
 * a drag that hasn't committed yet has nothing to undo.
 */
function handleMoves(moves: { id: string; startMs: number; endMs: number; rowIndex: number }[]): void {
  if (moves.length === 0) return;
  store.updateEffects(moves.map(({ id, startMs, endMs }) => ({ id, startMs, endMs })));
  // Row changes after the times, and without a second snapshot: updateEffects already took one, so
  // a drag that moved an effect to another row is still a single Ctrl+Z.
  for (const move of moves) {
    const row = visibleRows.value[move.rowIndex];
    if (!row) continue;
    store.moveEffectToRowLive(move.id, row.elementType, row.elementId, row.subName);
    // Dragging between two layer rows of the same model changes the layer, not the row - the row
    // is the same one. Without this the effect would appear to snap back, since the grid draws it
    // on whichever layer row its index says.
    if (row.layerIndex !== undefined) store.setEffectLayerLive(move.id, row.layerIndex);
  }
}

// The fade drag still commits live: its preview *is* the wedge the grid draws from the store, so
// previewing it separately would mean drawing the same thing twice from two sources.
function handleDragStart(): void {
  store.snapshot();
}

// The Select Effect panel (manual: View > Windows) - "select effects based on type, model, and
// time" for bulk editing. Block selection can draw a box; only a criterion can reach every Fire in
// the show, or everything on the mega tree.
const showSelectPanel = ref(false);
const selectName = ref("");
const selectRowKey = ref("");
const selectInRange = ref(true);

const selectCriteria = computed<EffectCriteria>(() => ({
  name: selectName.value,
  rowKeys: selectRowKey.value ? [selectRowKey.value] : [],
  // The marked play range is the "time" criterion: it is the region already highlighted, so the
  // panel doesn't ask for two numbers that have to be typed to match something on screen.
  ...(selectInRange.value && playRange.value ? { fromMs: playRange.value.startMs, toMs: playRange.value.endMs } : {}),
}));

const selectSummary = computed(() => describeCriteria(selectCriteria.value, rows.value.length));

function runSelect(): void {
  const candidates = rows.value.map((row) => ({ key: rowKey(row), effects: effectsForKey(row) }));
  const ids = matchingEffectIds(candidates, selectCriteria.value);
  store.setSelection(ids, ids[0] ?? null);
}

function handleSelectMany(ids: string[], reference: string | null): void {
  store.setSelection(ids, reference);
}

/**
 * Aligns every selected effect onto the reference one.
 *
 * The reference is left alone, and the whole alignment is one undo entry - undoing an alignment
 * one effect at a time would be worse than not having the command.
 */
/** The selected effects with the row each one is on, which is what the clipboard needs. */
function selectedWithRows(): { effect: SequenceEffect; rowIndex: number }[] {
  const ids = new Set(store.selectedEffectIds);
  const out: { effect: SequenceEffect; rowIndex: number }[] = [];
  visibleRows.value.forEach((row, rowIndex) => {
    for (const effect of effectsForRowRef(row)) if (ids.has(effect.id)) out.push({ effect, rowIndex });
  });
  return out;
}

function effectsForRowRef(row: GridRow): SequenceEffect[] {
  const found = store.body.rows.find((r) => r.elementType === row.elementType && r.elementId === row.elementId);
  return found?.effects ?? [];
}

/** Copies the whole selection, keeping its shape. */
function copySelection(): void {
  clipboard.value = clipboardFrom(selectedWithRows());
}

/**
 * Pastes the block with its top-left corner at a moment on a row.
 *
 * One undo entry for the whole paste, and the pasted effects become the new selection - which is
 * what lets you paste and then immediately drag or align the thing you just pasted.
 */
function pasteBlockAt(rowIndex: number, atMs: number): void {
  if (!clipboard.value) return;
  const placements = pastedAt(clipboard.value, atMs, rowIndex, visibleRows.value.length, newEffectId).flatMap((p) => {
    const row = visibleRows.value[p.rowIndex];
    return row ? [{ elementType: row.elementType, elementId: row.elementId, subName: row.subName, effect: p.effect }] : [];
  });
  store.addEffects(placements);
  store.setSelection(placements.map((p) => p.effect.id), placements[0]?.effect.id ?? null);
}

/** The row index a GridRow sits at, for pasting relative to where you clicked. */
function rowIndexOf(row: GridRow): number {
  const index = visibleRows.value.findIndex(
    (r) => r.elementType === row.elementType && r.elementId === row.elementId && (r.subName ?? "") === (row.subName ?? ""),
  );
  return index < 0 ? 0 : index;
}

function alignSelection(mode: AlignMode): void {
  const reference = store.selectedEffectId ? store.findEffect(store.selectedEffectId) : null;
  if (!reference) return;
  const patches = store.selectedEffectIds
    .filter((id) => id !== store.selectedEffectId)
    .flatMap((id) => {
      const effect = store.findEffect(id);
      return effect ? [{ id, ...alignedTo(reference, effect, mode) }] : [];
    });
  store.updateEffects(patches);
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
          // "Then right click and select Alignment." Only offered with a block to align - four
          // entries that would each move nothing are worse than four entries that aren't there.
          ...(store.selectedEffectIds.length > 1
            ? ALIGN_MODES.map((m) => ({ label: m.label, action: `align:${m.mode}` }))
            : []),
        ]
      : target.kind === "mark"
        ? [{ label: "Delete Mark", action: "delete-mark" }]
        : target.kind === "row-label"
          ? layerMenuFor(target.row)
          : [{ label: "Add Timing Mark Here", action: "add-mark" }];
  contextMenu.value = { x: target.x, y: target.y, items, target };
}

/**
 * The layer menu on a row's label (manual: "right click the model in the sequencer tab and choose
 * Add Layer above or below (the current layer)").
 *
 * A collapsed row offers only to expand, because "above or below the current layer" needs a
 * current layer to mean anything - and on a collapsed row every layer is shown at once.
 */
function layerMenuFor(row: GridRow): { label: string; action: string }[] {
  const effects = effectsForKey(row);
  const count = layerCount(effects);
  if (row.layerIndex === undefined) {
    return [{ label: count > 1 ? `Show ${count} Layers` : "Show Layers", action: "layers-expand" }];
  }
  const full = !canAddLayer(effects);
  return [
    { label: full ? "Add Layer Above (at the 200 limit)" : "Add Layer Above", action: full ? "noop" : "layer-add-above" },
    { label: full ? "Add Layer Below (at the 200 limit)" : "Add Layer Below", action: full ? "noop" : "layer-add-below" },
    // Only offered when there is more than one, and it says what it will take with it - deleting
    // a layer that still has effects on it silently would lose work.
    ...(count > 1
      ? [{ label: deleteLayerLabel(row), action: "layer-delete" }]
      : []),
    { label: "Collapse Layers", action: "layers-collapse" },
  ];
}

function deleteLayerLabel(row: GridRow): string {
  const n = removeLayer(effectsForKey(row), row.layerIndex ?? 0).deleted.length;
  return n === 0 ? "Delete Layer" : `Delete Layer (and ${n} effect${n === 1 ? "" : "s"})`;
}

/** Applies a layer edit: the moves, and any effects the edit deletes, in one undo entry. */
function applyLayerEdit(moves: { id: string; layerIndex: number }[], deleted: string[] = []): void {
  if (moves.length === 0 && deleted.length === 0) {
    // Nothing to store, but the row still has to redraw: adding a layer above the top moves no
    // effects at all, and the new empty row is the whole point of having asked.
    layerRowsTick.value++;
    return;
  }
  store.applyLayerEdit(moves, deleted);
  layerRowsTick.value++;
}

// Bumped when a layer edit changes how many rows a model shows. The row list is computed from the
// effects, and adding an empty layer changes no effect at all - so without this the new row
// wouldn't appear until something else happened to redraw.
const layerRowsTick = ref(0);

function handleContextAction(action: string): void {
  const target = contextMenu.value?.target;
  contextMenu.value = null;
  if (!target) return;

  if (target.kind === "effect") {
    const { row, effect, ms } = target;
    if (action.startsWith("align:")) {
      alignSelection(action.slice("align:".length) as AlignMode);
      return;
    }
    if (action === "copy") {
      copySelection();
    } else if (action === "cut") {
      copySelection();
      store.deleteSelected();
    } else if (action === "paste") {
      pasteBlockAt(rowIndexOf(row), ms);
    } else if (action === "duplicate") {
      // Duplicated just past the end of the block, so the copy sits beside the original rather
      // than on top of it - the same "place it where you can see it" rule as before, for a block.
      copySelection();
      const latest = Math.max(effect.endMs, ...selectedWithRows().map((s) => s.effect.endMs));
      const topRow = Math.min(rowIndexOf(row), ...selectedWithRows().map((s) => s.rowIndex));
      pasteBlockAt(topRow, latest);
    } else if (action === "delete") {
      // The whole block when the effect right-clicked is in it, matching the keyboard - otherwise
      // just the one clicked, which is what right-clicking outside a selection means.
      if (store.selectedEffectIds.includes(effect.id)) store.deleteSelected();
      else store.deleteEffect(effect.id);
    }
  } else if (target.kind === "row-label") {
    const row = target.row;
    const key = rowKey(row);
    if (action === "layers-expand") {
      expandedLayerKeys.value = new Set([...expandedLayerKeys.value, key]);
    } else if (action === "layers-collapse") {
      // A display change only: "collapses the expanded effect layers back down to a single row".
      // The effects stay on the layers they were on.
      const next = new Set(expandedLayerKeys.value);
      next.delete(key);
      expandedLayerKeys.value = next;
    } else if (action === "layer-add-above" || action === "layer-add-below") {
      const { moves } = addLayer(effectsForKey(row), row.layerIndex ?? 0, action === "layer-add-above" ? "above" : "below");
      applyLayerEdit(moves);
    } else if (action === "layer-delete") {
      const { deleted, moves } = removeLayer(effectsForKey(row), row.layerIndex ?? 0);
      applyLayerEdit(moves, deleted);
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
/**
 * Shift+drag on an effect edge, authoring a fade.
 *
 * Live like a move rather than snapshotted per event - the drag already took one snapshot at
 * pointerdown, and snapshotting here would fill the undo stack with one entry per pixel.
 */
function handleFade(effectId: string, edge: "left" | "right", durationMs: number): void {
  const effect = store.findEffect(effectId);
  if (!effect) return;
  store.updateEffectLive(effectId, { transition: withFade(effect.transition, edge, durationMs) });
}

function handleColorAdjustUpdate(colorAdjust: ColorAdjust): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { colorAdjust });
}

/**
 * The Colour panel's Update button: "will apply the current colors palettes to all the selected
 * effects".
 *
 * The palette specifically, not the whole settings bag. A palette means the same thing to every
 * effect, where a Fire's parameters mean nothing to a Bars - which is why the manual offers this
 * for colours and nothing else.
 */
function applyPaletteToSelection(): void {
  const source = store.selectedEffectId ? store.findEffect(store.selectedEffectId) : null;
  if (!source) return;
  const palette = source.palette;
  store.updateEffectsPalette(
    store.selectedEffectIds.filter((id) => id !== source.id),
    palette,
  );
}

function handleTransitionUpdate(transition: TransitionSpec): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { transition });
}
function handleLayerUpdate(layer: LayerSettings): void {
  if (store.selectedEffectId) store.updateEffect(store.selectedEffectId, { layer });
}

// The track the keyboard timing commands act on: the selected one, or the first when "all tracks"
// is chosen - "all" is a viewing choice, and there is no such thing as adding a mark to all of them.
function timingTargetIndex(): number {
  return activeTrackIndex.value >= 0 ? activeTrackIndex.value : 0;
}

function addTimingMarkAtPlayhead(): void {
  store.ensureDefaultTimingTrack();
  store.addTimingMark(timingTargetIndex(), playheadMs.value);
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

// Automatic snapshots, the way the layout already takes them: every N minutes (the Layout
// snapshot preference; 0 turns it off), and only if the sequence has been saved since the last
// one. Leaving a sequence open overnight must not fill its history with identical copies.
let autoSnapshotTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotRevision = -1;
onMounted(() => {
  const minutes = prefs.value.layoutSnapshotMinutes;
  if (minutes <= 0) return;
  autoSnapshotTimer = setInterval(() => {
    const revision = store.sequence?.revision ?? -1;
    if (revision < 0 || revision === lastSnapshotRevision) return;
    lastSnapshotRevision = revision;
    void snapshotNow();
  }, minutes * 60_000);
});
onBeforeUnmount(() => {
  if (autoSnapshotTimer) clearInterval(autoSnapshotTimer);
});

async function snapshotNow(): Promise<void> {
  if (!store.sequence) return;
  const v = await api.snapshotVersion(store.sequence.id);
  versions.value = [v, ...versions.value];

  // xLights' "Purge Backups Older Than", applied when a new snapshot is taken - which is the only
  // moment the history grows, and so the only moment retention needs deciding. Off by default;
  // deleting someone's history is not a thing to start doing because a setting exists.
  const days = prefs.value.versionRetentionDays;
  if (days <= 0) return;
  try {
    const { deleted } = await api.purgeVersions(store.sequence.id, days);
    if (deleted > 0) versions.value = await api.listVersions(store.sequence.id);
  } catch {
    // A purge that fails leaves more history than asked for, which is the safe direction and not
    // worth interrupting an edit over.
  }
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
  // A window opened now won't have its listener attached yet; it says hello when it's ready.
  const opened = window.open(
    previewUrlFor(route.params.projectId as string, sequenceId.value),
    `webxlights-preview-${sequenceId.value}`,
  );
  previewWindow.value = opened;
  // A popup blocker returns null, and the docked preview has to stay put in that case - hiding
  // it would leave no preview anywhere and nothing on screen to explain why.
  if (!opened) return;
  previewPoppedOut.value = true;
  watchPreviewWindow();
}

// The popped-out preview, so Ctrl+F6 can close the one it opened. Held rather than looked up
// because there is no asking the browser whether a named window exists: `window.open` with the
// same name would focus it, which is the opposite of toggling it off.
const previewWindow = ref<Window | null>(null);

/**
 * Whether the preview is currently living in its own window.
 *
 * While it is, the docked copy is taken out of the sequencer entirely (not hidden - removed) and
 * the 220px it held goes to the grid. Rendering the same scene twice is the part that actually
 * costs something: both copies run their own WebGL context and their own per-frame colour pass
 * over every node, and the one nobody is looking at is pure waste.
 *
 * Polled rather than watched. `window.closed` fires no event, so a window the user closed with
 * its own X would otherwise leave the sequencer permanently missing its preview - the failure
 * that matters here, since there is no way to ask for the docked one back directly. Half a
 * second is far below noticing and costs nothing.
 */
const previewPoppedOut = ref(false);
let previewWatchTimer: ReturnType<typeof setInterval> | null = null;

function watchPreviewWindow(): void {
  if (previewWatchTimer !== null) return;
  previewWatchTimer = setInterval(() => {
    const open = previewWindow.value;
    if (open && !open.closed) return;
    previewWindow.value = null;
    previewPoppedOut.value = false;
    if (previewWatchTimer !== null) clearInterval(previewWatchTimer);
    previewWatchTimer = null;
  }, 500);
}

/**
 * "Toggle House Preview Window On/Off".
 *
 * A window the user closed themselves reports `closed`, so the next press opens a new one rather
 * than doing nothing while holding a dead handle.
 */
function togglePreviewWindow(): void {
  const open = previewWindow.value;
  if (open && !open.closed) {
    open.close();
    previewWindow.value = null;
    previewPoppedOut.value = false;
    return;
  }
  openPreviewWindow();
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
  // The same placement rule as a drop: the wheel is the manual's other way of doing the same act
  // ("click to drop it at that location"), so an effect placed from it shouldn't come out a
  // different length from one dragged to the same spot.
  const { startMs, endMs } = placementAt(at.ms);
  store.addEffect(at.row.elementType, at.row.elementId, at.row.subName, {
    id: newEffectId(),
    name,
    startMs,
    endMs,
    ...layerFor(at.row),
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

// xLights' Sequence Settings dialog (File > Sequence Settings). A panel rather than a modal, like
// every other panel here - the settings are worth seeing while looking at the sequence they
// describe, and a modal would hide it.
const showSettingsPanel = ref(false);
const settingsStatus = ref("");

/** A local copy, so a half-typed name isn't saved on every keystroke. */
const settingsDraft = ref({
  name: "",
  frame_ms: 50,
  duration_ms: 0,
  sequence_type: "media" as "media" | "animated",
  blend_between_models: false,
  metadata: {} as SequenceMetadata,
});

function loadSettingsDraft(): void {
  const record = store.sequence;
  if (!record) return;
  settingsDraft.value = {
    name: record.name,
    frame_ms: record.frame_ms,
    duration_ms: record.duration_ms,
    sequence_type: record.sequence_type ?? "media",
    blend_between_models: record.blend_between_models === true,
    metadata: { ...(record.metadata ?? {}) },
  };
}

watch(showSettingsPanel, (open) => {
  if (open) loadSettingsDraft();
});

async function saveSettings(): Promise<void> {
  settingsStatus.value = "Saving…";
  try {
    await store.saveSettings({ ...settingsDraft.value });
    settingsStatus.value = "Saved";
  } catch (e) {
    // Said out loud rather than swallowed: the frame rate and duration change what renders, and a
    // silent failure would leave the panel showing something the sequence isn't.
    settingsStatus.value = e instanceof Error ? e.message : "Could not save";
  }
}

// The metadata fields, in the manual's own order.
const METADATA_FIELDS: { key: keyof SequenceMetadata; label: string }[] = [
  { key: "author", label: "Author" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "song", label: "Song" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "music_url", label: "Music URL" },
  { key: "comment", label: "Comment" },
];
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

/**
 * Moves the selected effect along its row. Returns false when there is nothing to move, so the
 * caller can fall back to nudging the playhead.
 */
function moveSelectedEffectInTime(direction: -1 | 1): boolean {
  const id = store.selectedEffectId;
  if (!id) return false;
  const row = store.body.rows.find((r) => r.effects.some((e) => e.id === id));
  if (!row || !store.sequence) return false;
  const moved = moveEffectInTime(row.effects, id, direction, prefs.value.defaultEffectMs / 10, store.sequence.duration_ms);
  if (!moved) return true; // selected but nowhere to go: don't move the playhead instead
  store.updateEffect(id, moved);
  return true;
}

/** Moves the selected effect to the row above or below, if it fits there. */
function moveSelectedEffectToAdjacentRow(direction: -1 | 1): void {
  const id = store.selectedEffectId;
  if (!id) return;
  const current = store.body.rows.find((r) => r.effects.some((e) => e.id === id));
  const effect = current?.effects.find((e) => e.id === id);
  if (!current || !effect) return;

  const target = moveEffectToRow(visibleRows.value, current, direction);
  if (!target) return;
  const targetRow = store.body.rows.find(
    (r) => r.elementType === target.elementType && r.elementId === target.elementId && (r.subName ?? "") === (target.subName ?? ""),
  );
  // A vertical move has nowhere to jump to, so an occupied slot refuses rather than overlapping.
  if (targetRow && !fitsOnRow(targetRow.effects, effect.startMs, effect.endMs)) return;
  store.moveEffectToRow(id, target.elementType, target.elementId, target.subName);
}

// The header's two menus. Every panel and every export used to be its own button; twenty-two of
// them, wrapping to two rows, all at the same weight. A desktop editor groups these under a
// menu, and the tick says which panels are open right now.
function windowKey(target: WindowTarget): string | undefined {
  return WINDOW_SHORTCUTS.find((s) => s.target === target)?.keyLabel;
}
const anyPanelOpen = computed(
  () =>
    showModelsPanel.value ||
    showViewsPanel.value ||
    showPresetsPanel.value ||
    showRegionsPanel.value ||
    showTimingPanel.value ||
    showSelectPanel.value ||
    showHistory.value ||
    showFppPanel.value,
);
const windowsMenu = computed<MenuItem[]>(() => [
  { label: "Models", checked: showModelsPanel.value, shortcut: windowKey("models"), run: () => (showModelsPanel.value = !showModelsPanel.value) },
  { label: "Views", checked: showViewsPanel.value, run: () => (showViewsPanel.value = !showViewsPanel.value) },
  {
    label: presets.value.length ? `Effect presets (${presets.value.length})` : "Effect presets",
    checked: showPresetsPanel.value,
    shortcut: windowKey("presets"),
    run: () => (showPresetsPanel.value = !showPresetsPanel.value),
  },
  { label: "Song regions", checked: showRegionsPanel.value, run: () => (showRegionsPanel.value = !showRegionsPanel.value) },
  { label: "Timing tracks", checked: showTimingPanel.value, disabled: !store.sequence, run: () => (showTimingPanel.value = !showTimingPanel.value) },
  { label: "Select effects", checked: showSelectPanel.value, shortcut: windowKey("select"), disabled: !store.sequence, run: () => (showSelectPanel.value = !showSelectPanel.value) },
  { label: "Version history", checked: showHistory.value, disabled: !store.sequence, run: () => void toggleHistory() },
  ...(FPP_CONNECT_ENABLED
    ? [{ label: "FPP Connect", checked: showFppPanel.value, disabled: !store.sequence, run: () => (showFppPanel.value = !showFppPanel.value) } satisfies MenuItem]
    : []),
  { kind: "separator" },
  {
    label: previewPoppedOut.value ? "House preview: bring back" : "House preview in its own window",
    checked: previewPoppedOut.value,
    shortcut: windowKey("housePreview"),
    disabled: !store.sequence,
    run: togglePreviewWindow,
  },
  // Every panel can be torn off from its own title bar (ModalPanel.vue); this one is listed
  // here as well because it is the panel people most often want on a second screen.
  {
    label: "Video export in its own window",
    disabled: !store.sequence,
    run: () => openPanelWindow(route.params.projectId as string, sequenceId.value, "video"),
  },
]);
const sequenceMenu = computed<MenuItem[]>(() => [
  { label: "Sequence settings", checked: showSettingsPanel.value, disabled: !store.sequence, run: () => (showSettingsPanel.value = !showSettingsPanel.value) },
  { label: "Preferences", checked: showPrefsPanel.value, shortcut: windowKey("prefs"), run: () => (showPrefsPanel.value = !showPrefsPanel.value) },
  { kind: "separator" },
  { label: "Save a snapshot", disabled: !store.sequence, run: () => void snapshotNow() },
  { label: "Export .fseq", disabled: !store.sequence, run: exportFseq },
  { kind: "separator" },
  { label: "Share to library…", disabled: !store.sequence, run: openShare },
]);

const commands = computed(() =>
  buildCommands({
    effectShortcuts: shortcutsInForce.value,
    togglePlay,
    seekStart: () => seekTo(0),
    seekEnd: () => seekTo(store.sequence?.duration_ms ?? 0),
    // Arrow keys move the *selected effect* when there is one, and the playhead when there isn't.
    // xLights: "select the effect and use the Left or Right arrow keys to move it left or right",
    // with Up and Down moving it between rows. Falling back to the playhead keeps the transport
    // behaviour for the case where nothing is selected, which is most of the time.
    nudgePlayhead: (delta) => {
      if (!moveSelectedEffectInTime(delta > 0 ? 1 : -1)) seekTo(Math.max(0, playheadMs.value + delta));
    },
    moveSelectedEffectVertically: (direction) => moveSelectedEffectToAdjacentRow(direction),
    addTimingMark: addTimingMarkAtPlayhead,
    splitTimingMark: splitTimingMarkAtPlayhead,
    expandToMark: expandSelectionToMark,
    markSpot: () => {
      markedSpotMs.value = playheadMs.value;
      timingNotice.value = `Spot marked at ${formatTime(playheadMs.value, prefs.value.timeFormat, store.sequence?.frame_ms)}.`;
    },
    returnToSpot: () => {
      if (markedSpotMs.value !== null) seekTo(markedSpotMs.value);
    },
    jumpToTenth: (digit) => seekTo(jumpTargetMs(digit, store.sequence?.duration_ms ?? 0)),
    selectAllEffects: () => {
      // "Select All effects but no timing tracks" - which is what this selects anyway, since a
      // timing mark isn't an effect and can't be in the block.
      const ids = store.body.rows.flatMap((r) => r.effects.map((e) => e.id));
      store.setSelection(ids, ids[0] ?? null);
    },
    insertLayer: insertLayerAtSelection,
    toggleElementExpand,
    toggleWindow,
    subdivideTiming,
    // Deletes the whole block, not only the reference: a selection you can see but can't delete
    // together is a selection that lies about what it is.
    deleteSelected: () => store.deleteSelected(),
    copySelected: copySelection,
    pasteAtPlayhead: () => {
      const row = keyboardTargetRow();
      if (row) pasteBlockAt(rowIndexOf(row), playheadMs.value);
    },
    duplicateSelected: () => {
      const selected = selectedWithRows();
      if (selected.length === 0) return;
      copySelection();
      pasteBlockAt(Math.min(...selected.map((s) => s.rowIndex)), Math.max(...selected.map((s) => s.effect.endMs)));
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    zoomIn: () => zoomBy(1),
    zoomOut: () => zoomBy(-1),
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
/** The playhead position remembered by Mark Spot, or null before anything has been marked. */
const markedSpotMs = ref<number | null>(null);

/**
 * Expands every selected effect to the next or previous timing mark.
 *
 * The whole block, not just the reference: "expand effect" reads as singular, but a selection is
 * the unit every other bulk command here works on, and expanding twelve effects onto the same beat
 * is precisely what the key is for. One undo entry covers the lot.
 */
function expandSelectionToMark(direction: -1 | 1): void {
  const durationMs = store.sequence?.duration_ms ?? 0;
  const marks = activeMarks.value;
  const patches = store.selectedEffectIds.flatMap((id) => {
    const effect = store.findEffect(id);
    if (!effect) return [];
    const expanded = expandToMark(effect, marks, direction, durationMs);
    return expanded ? [{ id, ...expanded }] : [];
  });
  store.updateEffects(patches);
}

/**
 * The row the selection sits on, for the commands that act on a row rather than on effects.
 *
 * There is no such thing as a focused row here - the grid's unit of attention is the selected
 * effect - so the row is wherever the reference effect is. Nothing selected means no row, and the
 * key does nothing rather than guessing at the first one: inserting a layer into a row you weren't
 * looking at is worse than a key that appears not to work.
 */
function selectedBodyRow(): SequenceRow | null {
  const id = store.selectedEffectId;
  if (!id) return null;
  return store.body.rows.find((r) => r.effects.some((e) => e.id === id)) ?? null;
}

/**
 * Inserts a layer above or below the one the selection is on (appendix: CTRL+I / CTRL+A).
 *
 * The right-click menu refuses this on a collapsed row, because "above or below the current layer"
 * needs a current layer and a collapsed row shows them all at once. From the keyboard there is
 * always one: the selected effect is *on* a layer, whether or not the row is drawn split. So this
 * works on a collapsed row, and then expands it - the new layer is empty, and an empty layer you
 * can't see is indistinguishable from the key having done nothing.
 */
function insertLayerAtSelection(side: "above" | "below"): void {
  const row = selectedBodyRow();
  const effect = store.selectedEffectId ? store.findEffect(store.selectedEffectId) : null;
  if (!row || !effect) return;
  if (!canAddLayer(row.effects)) {
    timingNotice.value = `That row is at the ${MAX_LAYERS} layer limit.`;
    return;
  }
  const { moves } = addLayer(row.effects, layerOf(effect), side);
  applyLayerEdit(moves);
  expandedLayerKeys.value = new Set([...expandedLayerKeys.value, rowKey(row)]);
}

/**
 * Shows or hides the selected row's layers (appendix: CTRL+X, "Toggle Element Expand").
 *
 * The manual's parenthesis is "to show models in group, strands, nodes, etc", and those aren't
 * hidden here: a group's models, a model's strands and its sub-models are all rows of their own,
 * listed together, shown or hidden from the Models panel. What a row here expands *into* is its
 * layers, so that is what this toggles.
 */
function toggleElementExpand(): void {
  const row = selectedBodyRow();
  if (!row) return;
  // Now that a group opens into its models and a model into its strands and sub-models, this key
  // does what the manual says it does - "to show models in group, strands, nodes, etc" - rather
  // than the layer expansion it was standing in for while everything was listed at once.
  toggleRowExpanded({ elementType: row.elementType, elementId: row.elementId, name: "", subName: row.subName });
}

/**
 * The appendix's window keys (windowShortcuts.ts holds the table, including the eight we can't
 * bind and why).
 */
function toggleWindow(target: WindowTarget): void {
  if (target === "models") showModelsPanel.value = !showModelsPanel.value;
  else if (target === "presets") showPresetsPanel.value = !showPresetsPanel.value;
  else if (target === "select") showSelectPanel.value = !showSelectPanel.value;
  else if (target === "prefs") showPrefsPanel.value = !showPrefsPanel.value;
  else togglePreviewWindow();
}

function splitTimingMarkAtPlayhead(): void {
  store.ensureDefaultTimingTrack();
  const index = timingTargetIndex();
  const track = store.body.timingTracks[index];
  if (!track) return;
  const marks = [...track.marks].sort((a, b) => a - b);
  const before = [...marks].reverse().find((m) => m < playheadMs.value);
  const after = marks.find((m) => m > playheadMs.value);
  if (before === undefined || after === undefined) {
    addTimingMarkAtPlayhead();
    return;
  }
  store.addTimingMark(index, Math.round((before + after) / 2));
}

// Dividing timings (manual: "Keyboard shortcuts are available to divide the selected timing marks
// by predefined intervals, making it quick to build up subdivided timing tracks").
//
// A marked play range stands in for "the selected timing marks", since our ruler has no selection
// of its own but the waveform already has a highlighted region - see timingSubdivide.ts. With no
// range marked it divides the one interval the playhead sits in, which is what `s` does for two.
function subdivideTiming(parts: number): void {
  store.ensureDefaultTimingTrack();
  const index = timingTargetIndex();
  const track = store.body.timingTracks[index];
  const durationMs = store.sequence?.duration_ms ?? 0;
  if (!track || durationMs <= 0) return;

  const region = playRange.value ?? intervalAt(track.marks, playheadMs.value, durationMs);
  if (!region) return;
  // The frame length as the floor: a mark between two frames can never be played against, and
  // dividing an already-fine track by four is exactly how a dozen of them get made.
  const added = subdivisionMarks(track.marks, region, parts, store.sequence?.frame_ms ?? 50);
  if (added.length === 0) {
    timingNotice.value = `Nothing to divide into ${parts} — the interval is already as fine as the frame rate allows.`;
    return;
  }
  store.addTimingMarks(index, added);
  timingNotice.value = `Divided into ${parts}: ${added.length} mark${added.length === 1 ? "" : "s"} added.`;
}

// Said out loud rather than left silent, because both outcomes look identical on a dense ruler at
// a low zoom: forty new marks and none at all are the same handful of pixels.
const timingNotice = ref<string | null>(null);
watch(timingNotice, (value) => {
  if (value === null) return;
  setTimeout(() => (timingNotice.value = null), 4000);
});

// xLights' Effects Grid > Double Click Mode. "When 'Play Timing' is selected, if you Double Click
// a timing mark, xLights will play the sequence for that timing mark interval. If 'Edit Text' is
// selected, the Edit Label Dialog will appear."
function handleMarkDoubleClick(trackIndex: number, ms: number): void {
  const track = store.body.timingTracks[trackIndex];
  if (!track) return;
  const index = track.marks.indexOf(ms);
  if (index < 0) return;

  if (prefs.value.doubleClickMode === "edit-text") {
    labelEdit.value = { trackIndex, index, ms, value: track.labels?.[index] ?? "" };
    return;
  }

  // Play Timing: the interval this mark starts, which runs to the next mark - or to the end of
  // the sequence for the last one. Reusing the play range rather than a one-off playback means it
  // loops, which is what you want when checking a phrase against the music.
  const endMs = track.marks.find((m) => m > ms) ?? store.sequence?.duration_ms ?? 0;
  if (endMs <= ms) return;
  playRange.value = { startMs: ms, endMs };
  seekTo(ms);
  if (!playing.value) togglePlay();
}

// The Edit Label dialog. A mark's label is what the lyric and phrase tracks are made of, and what
// the State and Piano effects read, so it has to be editable somewhere other than an import.
const labelEdit = ref<{ trackIndex: number; index: number; ms: number; value: string } | null>(null);

// Lyric tracks (manual: Sequencer > Singing Faces). Type a phrase onto a timing mark, break the
// phrases into words, then the words into phonemes - three levels, each generated from the one
// above it, with the phoneme level being what a Faces effect reads.
//
// The two buttons replace the track they would generate rather than adding a second copy, so
// breaking down twice after editing a phrase updates the words instead of leaving both versions
// in the list with no way to tell which is current.
function hasTypedLabels(track: { labels?: string[] }): boolean {
  return (track.labels ?? []).some((l) => l.trim().length > 0);
}

function replaceTrackNamed(name: string, track: TimingTrack): void {
  const existing = store.body.timingTracks.findIndex((t) => t.name === name);
  if (existing >= 0) store.deleteTimingTrack(existing);
  store.addTimingTrack(track);
}

function doBreakdownPhrases(index: number): void {
  const track = store.body.timingTracks[index];
  if (!track) return;
  const words = breakdownPhrases(track);
  if (words.marks.length === 0) {
    timingNotice.value = "Nothing to break down — type the lyrics onto the timing marks first.";
    return;
  }
  replaceTrackNamed(words.name, words);
  timingNotice.value = `Broke ${cellsOf(track).filter((c) => c.label.trim()).length} phrases into ${words.marks.length - 1} words.`;
}

function doBreakdownWords(index: number): void {
  const track = store.body.timingTracks[index];
  if (!track) return;
  // Run against this track's own words when it is a phrase track that has already been broken
  // down, and against the track itself when it is the word track - which is what "right click
  // the timing track and select Breakdown Words" means once the words are the thing on screen.
  const phraseName = track.name.endsWith(" — Words") ? track.name.slice(0, -" — Words".length) : track.name;
  const wordsTrack = store.body.timingTracks.find((t) => t.name === wordsTrackName(phraseName)) ?? track;
  const phonemes = breakdownWords(wordsTrack, phraseName);
  if (phonemes.marks.length === 0) {
    timingNotice.value = "No words to break down — run Breakdown Phrases first.";
    return;
  }
  replaceTrackNamed(phonemesTrackName(phraseName), phonemes);
  timingNotice.value = `Broke ${phonemes.marks.length - 1} phonemes out of ${wordsTrack.name}.`;
}

function commitLabelEdit(): void {
  const edit = labelEdit.value;
  labelEdit.value = null;
  if (edit) store.setTimingLabel(edit.trackIndex, edit.index, edit.value.trim());
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
  if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
  if (previewWatchTimer !== null) clearInterval(previewWatchTimer);
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
    <AppBar :project-id="route.params.projectId as string" active="sequences" />
    <header class="page-toolbar toolbar">
      <h1 :title="store.sequence?.name">{{ store.sequence?.name }}</h1>
      <div class="group transport">
        <button class="icon" :disabled="!audioLoaded" :title="playing ? 'Pause (Space)' : 'Play (Space)'" :aria-label="playing ? 'Pause' : 'Play'" @click="togglePlay">
          <svg v-if="playing" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></svg>
        </button>
        <button class="icon" :disabled="!audioLoaded" title="Stop" aria-label="Stop" @click="stop">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" /></svg>
        </button>
        <span class="time" :title="`Time shown as ${prefs.timeFormat}`">{{ playheadLabel }}</span>
      </div>
      <div class="group">
        <button class="icon" :disabled="!store.canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="store.undo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a5 5 0 0 1 0 10h-3" /></svg>
        </button>
        <button class="icon" :disabled="!store.canRedo" title="Redo (Ctrl+Y)" aria-label="Redo" @click="store.redo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M20 12H10a5 5 0 0 0 0 10h3" /></svg>
        </button>
      </div>
      <div class="group">
        <select v-model.number="zoomLevel" title="Zoom. Ctrl+wheel over the grid, double-click the waveform to zoom in, shift+double-click to zoom out, right-click the waveform to reset.">
          <option v-for="(step, i) in ZOOM_STEPS" :key="i" :value="i">{{ step }}x</option>
        </select>
        <select
          v-model="activeViewName"
          title="Which view the grid is showing. The Master View is every row."
          :disabled="rows.length === 0"
        >
          <option :value="null">Master View</option>
          <option v-for="v in views" :key="v.name" :value="v.name">{{ v.name }}</option>
        </select>
        <!-- Which timing track is in force. xLights' manual leans on this being a choice ("if no
             timing track is selected..."), and it decides where a dropped effect lands, what
             snapping snaps to, and which track a new mark goes on. -->
        <select
          v-if="store.body.timingTracks.length"
          :value="activeTrackIndex"
          title="Which timing track placement and snapping follow"
          @change="activeTrackIndex = Number(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="(track, i) in store.body.timingTracks" :key="i" :value="i">Timing: {{ track.name }}</option>
          <option :value="-1">Timing: all tracks</option>
        </select>
      </div>
      <div class="group">
        <MenuButton label="Windows" :items="windowsMenu" :active="anyPanelOpen" />
        <MenuButton label="Sequence" :items="sequenceMenu" />
        <button title="Command palette (⌘K or Ctrl+K): type any command or effect" @click="paletteOpen = true">⌘K</button>
      </div>
      <div class="status">
        <span class="save-status">{{ store.saveStatus }}</span>
        <span v-if="analyzingAudio" class="analyzing">Analyzing audio…</span>
        <span v-if="exportError" class="export-error">{{ exportError }}</span>
        <!-- A range you can't see the edges of is a range you can't get rid of, and shift-dragging
             a new one over it isn't obvious enough to be the only way out. -->
        <span v-if="playRange" class="play-range">
          Looping {{ formatTime(playRange.startMs, prefs.timeFormat, store.sequence?.frame_ms) }}–{{
            formatTime(playRange.endMs, prefs.timeFormat, store.sequence?.frame_ms)
          }}
          <button title="Play the whole sequence again" @click="clearPlayRange">×</button>
        </span>
        <!-- Forty new marks and none at all look identical on a dense ruler, so dividing says which
             it was rather than leaving you to count. -->
        <span v-if="timingNotice" class="play-range">{{ timingNotice }}</span>
        <button v-if="currentRegion" class="region-chip" title="Song regions" @click="showRegionsPanel = true">
          {{ currentRegion.name }}
        </button>
      </div>
    </header>

    <!-- xLights' Edit Label dialog, reached by double-clicking a mark with Double Click Mode set
         to Edit Text. Labels are what the lyric tracks are made of and what the State and Piano
         effects read, so they need an editor that isn't an import. -->
    <div v-if="labelEdit" class="timing-panel">
      <div class="timing-row">
        <label class="midi-field">
          Label at {{ formatTime(labelEdit.ms, prefs.timeFormat, store.sequence?.frame_ms) }}
          <input v-model="labelEdit.value" type="text" autofocus @keyup.enter="commitLabelEdit" @keyup.esc="labelEdit = null" />
        </label>
        <button @click="commitLabelEdit">Save</button>
        <button @click="labelEdit = null">Cancel</button>
      </div>
    </div>

    <ModalPanel v-if="showTimingPanel" id="timing" wide title="Timing tracks" @close="showTimingPanel = false">
      <div class="timing-panel">
      <!-- Tracks could be created and never removed, and creating one is a single click: a fixed
           interval, a metronome and an onset detection each add one. -->
      <div v-if="store.body.timingTracks.length" class="timing-tracks">
        <div v-for="(track, i) in store.body.timingTracks" :key="i" class="timing-row">
          <input
            :value="track.name"
            :disabled="track.fixed"
            type="text"
            @change="store.renameTimingTrack(i, ($event.target as HTMLInputElement).value)"
          />
          <label class="midi-field" :title="track.fixed ? 'Fixed: its marks can\'t be changed' : 'Fix it to protect its marks'">
            <input type="checkbox" :checked="track.fixed === true" @change="store.setTimingTrackFixed(i, ($event.target as HTMLInputElement).checked)" />
            Fixed
          </label>
          <span class="meta">{{ track.marks.length }} marks</span>
          <button
            title="Break each phrase in this track into words, in a track below it"
            :disabled="!hasTypedLabels(track)"
            @click="doBreakdownPhrases(i)"
          >
            Breakdown Phrases
          </button>
          <button
            title="Break each word in this track into phonemes, for a Faces effect to sing"
            :disabled="!hasTypedLabels(track)"
            @click="doBreakdownWords(i)"
          >
            Breakdown Words
          </button>
          <button title="Delete this timing track" @click="store.deleteTimingTrack(i)">×</button>
        </div>
        <p class="timing-note">
          A <strong>fixed</strong> track's marks can't be changed — "fixed Timing Tracks are not
          editable and the timing marks cannot be changed". Worth setting on an imported lyric
          track, where the marks line up with words somebody synced and one stray click on the
          ruler puts every phrase after it out by one. Deleting is undoable, like every other edit.
        </p>
      </div>
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

      <h3 class="timing-heading">Auto lyrics</h3>
      <p class="timing-note">
        Paste the lyrics, one line per phrase, and the song is listened to for where each word is
        sung. You get three tracks — Lyrics, Words and Phonemes — the phonemes from the CMU
        Pronouncing Dictionary. It gets most of the way there; play it through and nudge what is off.
      </p>
      <textarea v-model="lyricsText" class="lyrics-box" rows="6" placeholder="Jingle bells, jingle bells&#10;Jingle all the way…" :disabled="lyricsBusy"></textarea>
      <div class="timing-row">
        <button type="button" :disabled="lyricsBusy || !store.sequence?.audio_filename" :title="store.sequence?.audio_filename ? 'Listen to the song and time these lyrics' : 'Upload the song first'" @click="timeLyrics">
          {{ lyricsBusy ? "Listening…" : "Time the lyrics" }}
        </button>
        <button type="button" title="Save the lyric tracks as an xLights .xtiming file" @click="downloadLyricsXtiming">Download .xtiming</button>
      </div>
      <p v-if="lyricsMessage" class="timing-note">{{ lyricsMessage }}</p>
      </div>
    </ModalPanel>

    <ModalPanel v-if="showSharePanel" id="share-library" title="Share to the library" @close="showSharePanel = false">
      <div class="share-form">
        <p class="timing-note">
          A copy of this sequence goes into the library for other people to put on their own layouts, with the names of your models
          so they can map them. It is a snapshot: changes you make afterwards stay yours.
        </p>
        <label class="share-field">Title <input v-model="shareTitle" maxlength="160" /></label>
        <label class="share-field">Description <textarea v-model="shareDescription" class="lyrics-box" rows="3" maxlength="4000" placeholder="What song, what it is like, anything people should know"></textarea></label>
        <label class="check">
          <input v-model="shareAudio" type="checkbox" :disabled="!store.sequence?.audio_filename" />
          Include the audio file. Only tick this if you have the right to share this recording; most commercial songs cannot be shared, and people can add their own copy of the song after copying the sequence.
        </label>
        <div class="timing-row">
          <button type="button" class="primary" :disabled="shareBusy" @click="shareToLibrary">{{ shareBusy ? "Sharing…" : "Share" }}</button>
          <button type="button" :disabled="shareBusy" @click="showSharePanel = false">Close</button>
        </div>
        <p v-if="shareMessage" class="timing-note">{{ shareMessage }}</p>
      </div>
    </ModalPanel>

    <ModalPanel v-if="showFppPanel" id="fpp" title="FPP Connect" @close="showFppPanel = false">
      <div class="fpp-panel">
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
    </ModalPanel>

    <div v-if="importMessage" class="conflict-banner">
      <p>{{ importMessage }}</p>
      <button @click="importMessage = ''">Dismiss</button>
    </div>

    <div v-if="store.saveStatus === 'conflict'" class="conflict-banner">
      <p>Someone else saved this sequence since you last loaded it. Keep your local changes, or take theirs?</p>
      <button @click="store.keepMine">Keep mine</button>
      <button @click="store.takeTheirs">Take theirs</button>
    </div>

    <ModalPanel v-if="showHistory" id="history" title="Version history" @close="showHistory = false">
      <div class="history-panel">
      <h2>Version history</h2>
      <ul>
        <li v-for="v in versions" :key="v.id">
          <span>#{{ v.number }} — {{ v.creator?.name ?? "unknown" }} — {{ new Date(v.created_at).toLocaleString() }}</span>
          <button @click="restoreVersion(v.id)">Restore</button>
        </li>
        <li v-if="versions.length === 0" class="empty">No snapshots yet — click "Snapshot" to create one.</li>
      </ul>
      </div>
    </ModalPanel>

    <CommandPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <EffectWheel
      :shortcuts="shortcutsInForce" v-if="wheel" :x="wheel.x" :y="wheel.y" @pick="placeFromWheel" @close="wheel = null" />

    <ModalPanel v-if="showRegionsPanel" id="regions" title="Song regions" @close="showRegionsPanel = false">
      <div class="models-panel">
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
    </ModalPanel>

    <ModalPanel v-if="showPrefsPanel" id="prefs" title="Preferences" @close="showPrefsPanel = false">
      <div class="models-panel">
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

      <!-- xLights' File > Settings > Effects Grid tab. Its own heading rather than more rows under
           Settings, because that is how the manual groups them and because they are all about the
           same thing: how much of the sequence fits on the screen at once. -->
      <div class="models-panel-head"><h2>Effects grid</h2></div>
      <label class="blend-row">
        Spacing
        <select :value="prefs.gridSpacing" @change="patchPrefs({ gridSpacing: ($event.target as HTMLSelectElement).value as Preferences['gridSpacing'] })">
          <option v-for="(label, key) in GRID_SPACING_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
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
        <input
          type="checkbox"
          :checked="prefs.smallWaveform"
          @change="patchPrefs({ smallWaveform: ($event.target as HTMLInputElement).checked })"
        />
        Small waveform
      </label>
      <label class="blend-row">
        <input
          type="checkbox"
          :checked="prefs.showTransitionMarks"
          @change="patchPrefs({ showTransitionMarks: ($event.target as HTMLInputElement).checked })"
        />
        Display transition marks
      </label>
      <!-- xLights' Settings > Sequences: "Default Sequence Duration and FPS" and "Default Model
           Blending for New Sequences". The duration is only used by a sequence with no
           soundtrack - one with audio takes its length from the track. -->
      <label class="blend-row">
        New animated sequence
        <span>
          <input
            type="number"
            min="1"
            max="3600"
            :value="Math.round(prefs.defaultSequenceMs / 1000)"
            @change="patchPrefs({ defaultSequenceMs: Number(($event.target as HTMLInputElement).value) * 1000 })"
          />
          seconds
        </span>
      </label>
      <label class="blend-row">
        New sequence timing
        <select :value="prefs.defaultFrameMs" @change="patchPrefs({ defaultFrameMs: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="ms in FRAME_MS_CHOICES" :key="ms" :value="ms">{{ ms }} ms ({{ Math.round(1000 / ms) }} fps)</option>
        </select>
      </label>
      <label class="blend-row">
        <input
          type="checkbox"
          :checked="prefs.defaultBlendBetweenModels"
          @change="patchPrefs({ defaultBlendBetweenModels: ($event.target as HTMLInputElement).checked })"
        />
        New sequences allow blending between models
      </label>

      <!-- xLights' Backup tab offers Never / 365 / 90 / 31 / 7 for the same thing. Fixed choices
           rather than a free field: a hand-typed 1 would delete yesterday's work. -->
      <label class="blend-row">
        Keep snapshots for
        <select
          :value="prefs.versionRetentionDays"
          @change="patchPrefs({ versionRetentionDays: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option :value="0">Forever</option>
          <option :value="365">365 days</option>
          <option :value="90">90 days</option>
          <option :value="31">31 days</option>
          <option :value="7">7 days</option>
        </select>
      </label>
      <label class="blend-row">
        Timeline zooming
        <select
          :value="prefs.timelineZoomAnchor"
          @change="patchPrefs({ timelineZoomAnchor: ($event.target as HTMLSelectElement).value as Preferences['timelineZoomAnchor'] })"
        >
          <option value="cursor">Around the mouse cursor</option>
          <option value="playhead">Around the play marker</option>
        </select>
      </label>
      <label class="blend-row">
        Double click a timing mark
        <select
          :value="prefs.doubleClickMode"
          @change="patchPrefs({ doubleClickMode: ($event.target as HTMLSelectElement).value as Preferences['doubleClickMode'] })"
        >
          <option value="play-timing">Plays that interval</option>
          <option value="edit-text">Edits its label</option>
        </select>
      </label>
      <p class="timing-note">
        Four of xLights' Effects Grid settings are missing here on purpose: Icon Backgrounds and
        Node Values describe drawing this grid doesn't do, the completion bell belongs to a render
        that happens on a server rather than at your desk, and Hide Colour Update Warning hides a
        warning we don't show.
      </p>
      </div>
    </ModalPanel>

    <!-- xLights' Select Effect window: "select effects based on type, model, and time". -->
    <ModalPanel v-if="showSelectPanel" id="select" wide title="Select effects" @close="showSelectPanel = false">
      <div class="models-panel">
      <div class="models-panel-head"><h2>Select effects</h2></div>
      <label class="blend-row">
        Type
        <select v-model="selectName">
          <option value="">Any effect</option>
          <option v-for="name in Object.keys(EFFECT_SCHEMAS)" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="blend-row">
        Row
        <select v-model="selectRowKey">
          <option value="">Every row</option>
          <option v-for="row in rows" :key="rowKey(row)" :value="rowKey(row)">{{ row.name }}</option>
        </select>
      </label>
      <label class="blend-row">
        <input v-model="selectInRange" type="checkbox" :disabled="!playRange" />
        Only within the marked range
      </label>
      <p class="timing-note">
        Selects {{ selectSummary }}. Said out loud because the risk here is selecting more than you
        meant and then aligning or recolouring it in one go — shift-drag the waveform first to mark
        a range if you want one.
      </p>
      <div class="models-panel-actions">
        <button @click="runSelect">Select</button>
        <span class="save-status">{{ store.selectedEffectIds.length }} selected</span>
      </div>
      </div>
    </ModalPanel>

    <!-- xLights' Sequence Settings dialog. The Info/Media and Metadata tabs; its Timings tab is
         the Timing panel here, and Data Layers and Images have nothing behind them yet. -->
    <ModalPanel v-if="showSettingsPanel" id="settings" wide title="Sequence settings" @close="showSettingsPanel = false">
      <div class="models-panel">
      <div class="models-panel-head">
        <h2>Sequence settings</h2>
        <div class="models-panel-actions">
          <button @click="saveSettings">Save</button>
          <span class="save-status">{{ settingsStatus }}</span>
        </div>
      </div>

      <label class="blend-row">
        Name
        <input v-model="settingsDraft.name" type="text" />
      </label>
      <label class="blend-row">
        Type
        <select v-model="settingsDraft.sequence_type">
          <option value="media">Media</option>
          <option value="animated">Animated</option>
        </select>
      </label>
      <label class="blend-row">
        Duration
        <span><input v-model.number="settingsDraft.duration_ms" type="number" min="0" step="1000" /> ms</span>
      </label>
      <label class="blend-row">
        Timing
        <select v-model.number="settingsDraft.frame_ms">
          <option :value="20">20 ms (50 fps)</option>
          <option :value="25">25 ms (40 fps)</option>
          <option :value="33">33 ms (30 fps)</option>
          <option :value="40">40 ms (25 fps)</option>
          <option :value="50">50 ms (20 fps)</option>
        </select>
      </label>
      <label class="blend-row">
        <input v-model="settingsDraft.blend_between_models" type="checkbox" />
        Allow blending between models
      </label>
      <p class="timing-note">
        Off, a model's own effects replace whatever its group is doing wherever they draw. On, they
        blend over it, so a half-lit model lets half the group through. Off is the default because
        it's the more predictable of the two: what you put on the model is what you see.
      </p>

      <div class="models-panel-head"><h2>Metadata</h2></div>
      <label v-for="field in METADATA_FIELDS" :key="field.key" class="blend-row">
        {{ field.label }}
        <input v-model="settingsDraft.metadata[field.key]" type="text" />
      </label>
      <p class="timing-note">
        Travels with the sequence. xLights writes these into the sequence file and some sharing
        sites read them, which is the whole reason they're separate fields rather than one note.
      </p>
      </div>
    </ModalPanel>

    <ModalPanel v-if="showPresetsPanel" id="presets" title="Effect presets" @close="showPresetsPanel = false">
      <div class="models-panel">
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

      <div v-if="presets.length" class="panel-search">
        <input v-model="presetsQuery" type="search" placeholder="Find a preset…" aria-label="Find presets" />
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
    </ModalPanel>

    <ModalPanel v-if="showViewsPanel" id="views" title="Views" @close="showViewsPanel = false">
      <div class="models-panel">
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
        <div class="panel-search">
          <input v-model="viewRowsQuery" type="search" placeholder="Find a row…" aria-label="Find rows" />
          <label class="every"><input v-model="showEveryRow" type="checkbox" /> Show everything</label>
        </div>
        <ul>
          <li v-for="row in viewPickerRows" :key="rowKey(row)">
            <label>
              <input type="checkbox" :checked="activeView.rowKeys.includes(rowKey(row))" @change="toggleRowInView(row)" />
              {{ row.name }}
              <span class="row-type">{{ row.elementType }}</span>
            </label>
          </li>
          <li v-if="viewPickerRows.length === 0" class="empty">Nothing matches "{{ viewRowsQuery }}".</li>
        </ul>
      </template>
      </div>
    </ModalPanel>

    <ModalPanel v-if="showModelsPanel" id="models" wide title="Models" @close="showModelsPanel = false">
      <div class="models-panel">
      <div class="panel-search">
        <input
          v-model="modelsQuery"
          type="search"
          placeholder="Find a model, group or sub-model…"
          autofocus
          aria-label="Find rows"
        />
        <label class="every" :title="hiddenByDefaultCount ? `${hiddenByDefaultCount} numbered strands are hidden from this list` : 'Nothing is hidden from this list'">
          <input v-model="showEveryRow" type="checkbox" />
          Show everything{{ hiddenByDefaultCount && !showEveryRow ? ` (+${hiddenByDefaultCount} strands)` : "" }}
        </label>
      </div>
      <div class="models-panel-head">
        <h2>Rows shown on the grid</h2>
        <div class="models-panel-actions">
          <button @click="showAllRows" :disabled="hiddenRowKeys.size === 0">Show all</button>
          <button @click="hideAllRows" :disabled="hiddenRowKeys.size === rows.length">Hide all</button>
        </div>
      </div>
      <ul>
        <li v-for="row in modelsPanelRows" :key="rowKey(row)">
          <label>
            <input type="checkbox" :checked="!hiddenRowKeys.has(rowKey(row))" @change="toggleRowVisible(row)" />
            {{ row.name }}
            <span class="row-type">{{ row.elementType }}</span>
          </label>
          <span class="row-effect-count">{{ effectCountFor(row) }} effect{{ effectCountFor(row) === 1 ? "" : "s" }}</span>
        </li>
        <li v-if="rows.length === 0" class="empty">No models or groups in this project's layout yet.</li>
        <li v-else-if="modelsPanelRows.length === 0" class="empty">Nothing matches "{{ modelsQuery }}".</li>
      </ul>
      </div>
    </ModalPanel>

    <div v-if="!audioLoaded" class="reselect-audio">
      <p>Select the audio file for this sequence.</p>
      <input type="file" accept="audio/*" @change="onAudioFilePicked" />
    </div>

    <audio
      v-if="audioUrl"
      ref="audioEl"
      :src="audioUrl"
      @play="playing = true"
      @pause="onAudioPause"
      @timeupdate="onTimeUpdate"
      @ended="playing = false"
    ></audio>

    <div class="palette" role="toolbar" aria-label="Effects">
      <div class="palette-tiles">
        <button
          v-for="name in Object.keys(EFFECT_SCHEMAS)"
          :key="name"
          type="button"
          class="effect-tile"
          :title="`${name} — click to arm, or drag onto a row`"
          :aria-label="name"
          :aria-pressed="pendingEffectName === name"
          :class="{ armed: pendingEffectName === name, lifted: tileDrag?.name === name }"
          @click="onTileClick(name)"
          @dragstart.prevent
          @pointerdown="onTilePointerDown($event, name)"
          @pointermove="onTilePointerMove"
          @pointerup="onTilePointerUp"
          @pointercancel="cancelTileDrag"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" v-html="effectIcon(name)"></svg>
          <span class="tile-label">{{ name }}</span>
        </button>
      </div>
      <!-- Always rendered (visibility, not v-if) so arming/disarming never changes the palette's
           height - a v-if here used to reflow the whole grid below by ~90px every time an effect
           got armed, moving the exact row a user was about to drag on out from under their cursor. -->
      <p class="hint" :class="{ visible: !!pendingEffectName }">
        "{{ pendingEffectName }}" is armed: drag out its length on a row. Or drag any tile straight onto the grid.
      </p>
    </div>
    <!-- The thing being dragged, lifted under the pointer. The grid draws where it will land. -->
    <Teleport to="body">
      <div
        v-if="tileDrag"
        class="drag-proxy"
        :class="{ over: tileDrag.target !== null, blocked: tileDrag.blocked }"
        :style="{ left: `${tileDrag.x}px`, top: `${tileDrag.y}px` }"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" v-html="effectIcon(tileDrag.name)"></svg>
        <span>{{ tileDrag.name }}</span>
      </div>
    </Teleport>

    <div class="editor">
      <div class="timeline">
        <!-- v-show, not v-if: popping the preview back in used to pay a full THREE + geometry +
             compose-cache rebuild. Hidden, the component pauses itself and costs nothing. -->
        <div v-show="!previewPoppedOut" class="preview-wrap">
          <HousePreview
            :house-model="houseModel"
            :models="modelRecords"
            :groups="groupRecords"
            :body="store.body"
            :playhead-ms="playheadMs"
            :frame-ms="store.sequence?.frame_ms ?? 50"
            :audio="audioSeries ?? undefined"
            :blend-between-models="store.sequence?.blend_between_models === true"
            :paused="previewPoppedOut"
          />
        </div>
        <div ref="hScrollRef" class="h-scroll" @wheel="onTimelineWheel">
          <Waveform
            :peaks="peaks"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            @seek="seekTo"
            @scrub="scrubTo"
            @scrub-end="endScrub"
            @play-range="playRange = $event"
            @zoom="(direction, ms, clientX) => zoomBy(direction, { ms, clientX })"
            @reset-zoom="resetZoom"
            :play-range="playRange"
            :small="prefs.smallWaveform"
            :colors="uiColors"
          />
          <SequencerGrid
            ref="gridRef"
            :rows="visibleRows"
            :body="store.body"
            :duration-ms="store.sequence?.duration_ms ?? 0"
            :snap-to-timing="prefs.snapToTiming"
            :row-height="GRID_ROW_HEIGHT_PX[prefs.gridSpacing]"
            :show-transition-marks="prefs.showTransitionMarks"
            :active-track-index="activeTrackIndex"
            :colors="uiColors"
            :px-per-ms="pxPerMs"
            :playhead-ms="playheadMs"
            :selected-effect-id="store.selectedEffectId"
            :pending-effect-name="pendingEffectName"
            @select-many="handleSelectMany"
            :selected-effect-ids="store.selectedEffectIds"
            @wheel="openWheel"
            @row-expand="toggleRowExpanded"
            @place="handlePlace"
            @move-many="handleMoves"
            @fade="handleFade"
            @seek="seekTo"
            @drag-start="handleDragStart"
            @add-mark="handleAddMark"
            @mark-double-click="handleMarkDoubleClick"
            @contextmenu="handleContextMenu"
          />
        </div>
      </div>
      <aside class="props" :class="{ away: propsWindow.popped.value }">
        <div v-if="propsWindow.popped.value" class="props-away">
          <span>Effect settings is in its own window.</span>
          <button type="button" @click="propsWindow.closePopup()">Bring it back</button>
        </div>
        <Teleport :to="propsWindow.teleportTo.value" :disabled="!propsWindow.popped.value">
        <div class="props-body" :class="{ popped: propsWindow.popped.value }">
        <header class="props-head">
          <h2>Effect settings</h2>
          <span v-if="propsWindow.blocked.value" class="props-blocked">Your browser blocked the window</span>
          <button
            v-if="!propsWindow.popped.value"
            type="button"
            class="props-tool"
            title="Open in its own window (shift-click for a tab). Close that window to bring it back."
            aria-label="Open effect settings in its own window"
            @click="propsWindow.popOut($event, { width: 360, height: 820 })"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </button>
          <button v-else type="button" class="props-tool" title="Bring this panel back into the main window" aria-label="Bring back" @click="propsWindow.closePopup()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 7 7 17M15 17H7V9" /></svg>
          </button>
        </header>
        <EffectPropsPanel
          :effect="selectedEffect"
          :timing-track-names="timingTrackNames"
          :state-definition-names="stateDefinitionNames"
          :face-definition-names="faceDefinitionNames"
          :phoneme-names="phonemeNames"
          @update="handleParamsUpdate"
          @update-palette="handlePaletteUpdate"
          @update-color-adjust="handleColorAdjustUpdate"
          @apply-palette-to-selection="applyPaletteToSelection"
          :selection-size="store.selectedEffectIds.length"
          @update-blend="handleBlendUpdate"
          @update-transition="handleTransitionUpdate"
          @update-layer="handleLayerUpdate"
        />
        </div>
        </Teleport>
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
/* Transport and undo are pictures, the way every editor draws them; the name is the tooltip. */
.toolbar button.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.toolbar button.icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.toolbar h1 {
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fpp-row button,
.history-panel button,
.conflict-banner button {
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
  white-space: nowrap;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: pointer;
}
.fpp-row button:hover:not(:disabled),
.history-panel button:hover:not(:disabled),
.conflict-banner button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.toolbar select {
  max-width: 12rem;
  padding-right: 0.3rem;
}
.region-chip {
  font-size: 0.7rem !important;
  padding: 0.15rem 0.5rem !important;
  color: var(--info) !important;
  border-color: transparent !important;
  background: rgba(106, 159, 216, 0.12) !important;
}
.time {
  font-variant-numeric: tabular-nums;
  color: #888;
}
.play-range {
  font-size: 0.7rem;
  color: #6a9fd8;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.active-track {
  font-size: 0.7rem;
  color: #999;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.save-status {
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
  font-size: 0.85rem;
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
/* These panels are dialogs now (components/ModalPanel.vue), which supplies the frame, the
   padding and the scrolling. What is left here is only what their *contents* need - the
   descendant rules below still key off this class. */
.models-panel {
  font-size: 0.85rem;
}
/* The typeahead at the top of a list panel: one box, the whole width, always first. */
.panel-search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.panel-search input[type="search"] {
  flex: 1;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}
.panel-search input[type="search"]:focus {
  border-color: var(--accent);
  outline: none;
}
.panel-search .every {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
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
  margin: 0.5rem 0 1rem;
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
  font-size: 0.85rem;
}
.share-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.share-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.share-field input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.35rem 0.5rem;
  color: var(--text);
  background: var(--bg-control);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}
.share-form .check {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.timing-heading {
  margin: 1rem 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
.lyrics-box {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
}
.timing-note {
  margin: 0 0 0.5rem;
  color: #888;
  font-size: 0.8rem;
}
.shortcut-list {
  list-style: none;
  margin: 0 0 0.6rem;
  padding: 0 0.25rem 0 0;
  max-height: 16rem;
  overflow: auto;
  border-bottom: 1px solid var(--border);
}
.shortcut-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
  padding: 0.1rem 0;
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
  padding: 0.25rem 0.75rem 0.2rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.palette-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem;
}
/* A tile is a picture with its name under it, so the row you reach for is a toolbox rather than
   a line of glyphs you have to hover to decode. Fixed width, so forty-eight of them make an even
   grid whatever the names happen to be. */
.palette-tiles .effect-tile {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 44px;
  padding: 2px 1px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-drag: none;
  transition: background 120ms ease-out, color 120ms ease-out, transform 120ms ease-out;
}
.palette-tiles .effect-tile svg {
  width: 16px;
  height: 16px;
  pointer-events: none;
}
.tile-label {
  max-width: 100%;
  font-size: 0.55rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.palette-tiles .effect-tile:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.palette-tiles .effect-tile:active {
  cursor: grabbing;
}
.palette-tiles .effect-tile.lifted {
  opacity: 0.35;
}
.palette-tiles .effect-tile.armed {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
}
/* Reserved height always present (visibility, not display:none) - see the template comment:
   arming an effect must never change the palette's height, or the grid below jumps under the
   user's cursor mid-interaction. */
.hint {
  margin: 0.25rem 0 0;
  color: var(--accent);
  font-size: 0.75rem;
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
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* While the panel is in its own window, its column shrinks to a note and the grid takes the rest. */
.props.away {
  width: 160px;
}
.props-away {
  padding: 0.9rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.props-away button {
  padding: 0.3rem 0.6rem;
  font: inherit;
  font-size: 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: pointer;
}
.props-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.props-body.popped {
  height: 100vh;
  overflow-y: auto;
  font-family: var(--sans);
}
.props-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-panel);
  z-index: 1;
}
.props-head h2 {
  flex: 1;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.props-blocked {
  font-size: 0.65rem;
  color: var(--danger);
}
.props-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.props-tool svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.props-tool:hover {
  color: var(--text);
  background: var(--bg-hover);
}
</style>
