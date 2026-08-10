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
  const saveStatus = ref<"idle" | "saving" | "saved" | "error">("idle");

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

  function updateEffect(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params">>): void {
    pushUndoSnapshot();
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
      await api.saveSequenceBody(sequence.value.id, body.value);
      saveStatus.value = "saved";
    } catch {
      saveStatus.value = "error";
    }
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
