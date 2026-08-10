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

  // Dragging a slider or a value-curve point fires an update per pointer event. Snapshotting
  // each one would bury every earlier action under a hundred one-pixel steps (and blow the
  // undo limit), so consecutive updates of the same kind, to the same effect, within
  // COALESCE_WINDOW_MS reuse the first snapshot - which is the state the user actually wants
  // to get back to. Passing no key always snapshots (discrete actions: place, delete, paste).
  const COALESCE_WINDOW_MS = 700;
  let lastUndoKey: string | null = null;
  let lastUndoAt = 0;

  function pushUndoSnapshot(coalesceKey?: string): void {
    const now = Date.now();
    if (coalesceKey && coalesceKey === lastUndoKey && now - lastUndoAt < COALESCE_WINDOW_MS) {
      lastUndoAt = now;
      return;
    }
    lastUndoKey = coalesceKey ?? null;
    lastUndoAt = now;

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

  function updateEffect(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "transition">>): void {
    // key on what changed as well as which effect, so a param drag and a timeline drag on the
    // same effect stay separately undoable
    pushUndoSnapshot(`${Object.keys(patch).sort().join(",")}:${effectId}`);
    for (const row of body.value.rows) {
      const effect = row.effects.find((e) => e.id === effectId);
      if (effect) Object.assign(effect, patch);
    }
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

  function ensureDefaultTimingTrack(): void {
    if (body.value.timingTracks.length === 0) {
      body.value.timingTracks.push({ name: "Marks", marks: [] });
    }
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
    deleteEffect,
    findEffect,
    copyEffect,
    pasteEffectAt,
    addTimingMark,
    ensureDefaultTimingTrack,
    saveNow,
  };
});
