import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api, type SequenceBody, type SequenceEffect, type SequenceRecord } from "../lib/api";

const UNDO_LIMIT = 100;
const AUTOSAVE_DEBOUNCE_MS = 800;

// structuredClone() throws DataCloneError on Vue/Pinia reactive Proxy objects (observed
// live: it silently aborted every mutation, since pushUndoSnapshot() runs before the
// actual state change). JSON round-trip sidesteps proxies entirely and is fine here since
// SequenceBody is plain JSON-safe data (no Date/Map/etc).
function cloneBody(body: SequenceBody): SequenceBody {
  return JSON.parse(JSON.stringify(body)) as SequenceBody;
}

function emptyBody(): SequenceBody {
  return { timingTracks: [], rows: [] };
}

let nextEffectId = 1;
export function newEffectId(): string {
  return `e${Date.now()}_${nextEffectId++}`;
}

export const useSequencerStore = defineStore("sequencer", () => {
  const sequence = ref<SequenceRecord | null>(null);
  const body = ref<SequenceBody>(emptyBody());
  const selectedEffectId = ref<string | null>(null);
  const saveStatus = ref<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  // Set when a save lost a race (someone else saved since our etag was read) - the UI
  // offers "keep mine" / "take theirs" instead of the store silently picking one.
  const conflictRemote = ref<SequenceRecord | null>(null);

  // ponytail: full-body snapshots, not true command-pattern inverses. Sequence bodies stay
  // small through M2 (a handful of rows/effects), so this is cheap; revisit if per-action
  // memory becomes an issue once shows have thousands of effects.
  const undoStack = ref<SequenceBody[]>([]);
  const redoStack = ref<SequenceBody[]>([]);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressAutosave = false;

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  async function load(sequenceId: number): Promise<void> {
    suppressAutosave = true;
    const record = await api.getSequence(sequenceId);
    sequence.value = record;
    body.value = record.body && record.body.rows ? record.body : emptyBody();
    undoStack.value = [];
    redoStack.value = [];
    selectedEffectId.value = null;
    suppressAutosave = false;
  }

  function pushUndoSnapshot(): void {
    undoStack.value.push(cloneBody(body.value));
    if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift();
    redoStack.value = [];
  }

  function undo(): void {
    const prev = undoStack.value.pop();
    if (!prev) return;
    redoStack.value.push(cloneBody(body.value));
    body.value = prev;
  }

  function redo(): void {
    const next = redoStack.value.pop();
    if (!next) return;
    undoStack.value.push(cloneBody(body.value));
    body.value = next;
  }

  function ensureRow(elementType: "model" | "group", elementId: number) {
    let row = body.value.rows.find((r) => r.elementType === elementType && r.elementId === elementId);
    if (!row) {
      row = { elementType, elementId, effects: [] };
      body.value.rows.push(row);
    }
    return row;
  }

  function addEffect(elementType: "model" | "group", elementId: number, effect: SequenceEffect): void {
    pushUndoSnapshot();
    ensureRow(elementType, elementId).effects.push(effect);
  }

  function applyEffectPatch(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition">>): void {
    for (const row of body.value.rows) {
      const effect = row.effects.find((e) => e.id === effectId);
      if (effect) Object.assign(effect, patch);
    }
  }

  function updateEffect(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition">>): void {
    pushUndoSnapshot();
    applyEffectPatch(effectId, patch);
  }

  // Same mutation as updateEffect but no snapshot - a pointermove-driven drag calls this on
  // every move event, so snapshotting here fills the 100-entry undo stack with intermediate
  // drag frames (Ctrl+Z nudges by a pixel instead of undoing the drag). The caller snapshots
  // once via snapshot() at drag start instead (see SequencerGrid's dragStart emit).
  function updateEffectLive(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition">>): void {
    applyEffectPatch(effectId, patch);
  }

  function deleteEffect(effectId: string): void {
    pushUndoSnapshot();
    for (const row of body.value.rows) {
      row.effects = row.effects.filter((e) => e.id !== effectId);
    }
    if (selectedEffectId.value === effectId) selectedEffectId.value = null;
  }

  function findEffect(effectId: string): SequenceEffect | null {
    for (const row of body.value.rows) {
      const effect = row.effects.find((e) => e.id === effectId);
      if (effect) return effect;
    }
    return null;
  }

  function copyEffect(effectId: string): SequenceEffect | null {
    const effect = findEffect(effectId);
    return effect ? (JSON.parse(JSON.stringify(effect)) as SequenceEffect) : null;
  }

  function pasteEffectAt(elementType: "model" | "group", elementId: number, copied: SequenceEffect, atMs: number): void {
    const duration = copied.endMs - copied.startMs;
    const clone = JSON.parse(JSON.stringify(copied)) as SequenceEffect;
    addEffect(elementType, elementId, { ...clone, id: newEffectId(), startMs: atMs, endMs: atMs + duration });
  }

  function addTimingMark(trackIndex: number, ms: number): void {
    pushUndoSnapshot();
    const track = body.value.timingTracks[trackIndex];
    if (!track) return;
    if (!track.marks.includes(ms)) {
      track.marks.push(ms);
      track.marks.sort((a, b) => a - b);
    }
  }

  function deleteTimingMark(trackIndex: number, ms: number): void {
    pushUndoSnapshot();
    const track = body.value.timingTracks[trackIndex];
    if (!track) return;
    track.marks = track.marks.filter((m) => m !== ms);
  }

  function ensureDefaultTimingTrack(): void {
    if (body.value.timingTracks.length === 0) {
      body.value.timingTracks.push({ name: "Marks", marks: [] });
    }
  }

  // M15.6: real xLights' "New Timing" generator (25ms/50ms/100ms fixed-interval, Metronome
  // BPM) - PARITY.md's "manual marks only" gap. Always creates a *new* named track rather than
  // overwriting trackIndex 0 - a real imported sequence commonly has several named tracks
  // (Beats/Lyrics/Mark/...) with no guaranteed "the generic one is always index 0" ordering;
  // clobbering whatever happens to be first would silently destroy real imported timing data.
  // Matches real xLights' own New Timing dialog, which always adds a new track too.
  function generateTimingMarks(name: string, intervalMs: number): void {
    if (!sequence.value || intervalMs <= 0) return;
    pushUndoSnapshot();
    let trackName = name;
    let n = 2;
    while (body.value.timingTracks.some((t) => t.name === trackName)) trackName = `${name} ${n++}`;
    const marks: number[] = [];
    for (let ms = 0; ms < sequence.value.duration_ms; ms += intervalMs) marks.push(ms);
    body.value.timingTracks.push({ name: trackName, marks });
  }

  async function saveNow(): Promise<void> {
    if (!sequence.value) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveStatus.value = "saving";
    try {
      const result = await api.saveSequenceBody(sequence.value.id, body.value, sequence.value.etag);
      if (result.ok) {
        sequence.value = result.data;
        saveStatus.value = "saved";
      } else {
        conflictRemote.value = result.current;
        saveStatus.value = "conflict";
      }
    } catch {
      saveStatus.value = "error";
    }
  }

  // Overwrite the other writer's save with what's in this tab right now.
  function keepMine(): void {
    if (!sequence.value || !conflictRemote.value) return;
    sequence.value.etag = conflictRemote.value.etag;
    conflictRemote.value = null;
    saveStatus.value = "idle";
    void saveNow();
  }

  // Discard local changes and load what the other writer saved.
  function takeTheirs(): void {
    if (!conflictRemote.value) return;
    suppressAutosave = true;
    sequence.value = conflictRemote.value;
    body.value = conflictRemote.value.body;
    undoStack.value = [];
    redoStack.value = [];
    conflictRemote.value = null;
    saveStatus.value = "saved";
    suppressAutosave = false;
  }

  watch(
    body,
    () => {
      if (suppressAutosave || !sequence.value) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, AUTOSAVE_DEBOUNCE_MS);
    },
    { deep: true },
  );

  return {
    sequence,
    body,
    selectedEffectId,
    saveStatus,
    conflictRemote,
    keepMine,
    takeTheirs,
    canUndo,
    canRedo,
    load,
    undo,
    redo,
    addEffect,
    updateEffect,
    updateEffectLive,
    deleteEffect,
    findEffect,
    copyEffect,
    pasteEffectAt,
    addTimingMark,
    deleteTimingMark,
    ensureDefaultTimingTrack,
    generateTimingMarks,
    snapshot: pushUndoSnapshot,
    saveNow,
  };
});
