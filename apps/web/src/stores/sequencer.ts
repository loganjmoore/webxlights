import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api, type SequenceBody, type SequenceEffect, type SequenceRecord, type TimingTrack } from "../lib/api";
import type { StoredSwatch } from "@webxlights/engine";
import { withLabelSet, withMarkRemoved, withMarksAdded } from "../lib/timingMarks";

const UNDO_LIMIT = 100;
const AUTOSAVE_DEBOUNCE_MS = 800;

// How long an edit sits before it is saved, and whether it is saved at all. Driven by the user's
// Autosave preference (lib/preferences.ts); 0 turns it off, which is the setting for someone who
// would rather save deliberately than have a half-finished edit persisted.
let autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS;
export function setAutosaveDebounce(ms: number): void {
  autosaveDebounceMs = Math.max(0, Math.round(ms));
}

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
  // The *reference* effect: what the props panel edits, what the keyboard commands act on, and
  // what an alignment aligns to. Always either null or a member of selectedEffectIds.
  const selectedEffectId = ref<string | null>(null);
  // The block selection (lib/blockSelect.ts). One selected effect is the ordinary case and is
  // simply a selection of one, so the two can't drift apart into "which is really selected".
  const selectedEffectIds = ref<string[]>([]);
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
    selectedEffectIds.value = [];
    suppressAutosave = false;
  }

  /**
   * Saves the Sequence Settings dialog's fields.
   *
   * Not part of the body, so not undoable and not autosaved: these are deliberate changes made in
   * a dialog, where the body is every drag of every effect. Putting them on the undo stack would
   * mean Ctrl+Z after an hour's work could silently change the frame rate.
   */
  async function saveSettings(patch: Partial<SequenceRecord>): Promise<void> {
    if (!sequence.value) return;
    const updated = await api.updateSequenceSettings(sequence.value.id, patch);
    // Only the settings are taken back, not the body: a save that returned the server's body would
    // discard whatever has been edited since the request went out.
    sequence.value = { ...sequence.value, ...updated, body: sequence.value.body };
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

  function ensureRow(elementType: "model" | "group" | "submodel", elementId: number, subName: string | undefined) {
    // A sub-model row is identified by its parent's id *and* its own name: several sub-models
    // share one parent id, so matching on the id alone would collapse them into one row and
    // silently merge everyone's effects.
    let row = body.value.rows.find(
      (r) => r.elementType === elementType && r.elementId === elementId && (r.subName ?? undefined) === subName,
    );
    if (!row) {
      row = subName === undefined ? { elementType, elementId, effects: [] } : { elementType, elementId, subName, effects: [] };
      body.value.rows.push(row);
    }
    return row;
  }

  function addEffect(elementType: "model" | "group" | "submodel", elementId: number, subName: string | undefined, effect: SequenceEffect): void {
    pushUndoSnapshot();
    ensureRow(elementType, elementId, subName).effects.push(effect);
  }

  function applyEffectPatch(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition" | "layer" | "colorAdjust">>): void {
    for (const row of body.value.rows) {
      const effect = row.effects.find((e) => e.id === effectId);
      if (effect) Object.assign(effect, patch);
    }
  }

  function updateEffect(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition" | "layer" | "colorAdjust">>): void {
    pushUndoSnapshot();
    applyEffectPatch(effectId, patch);
  }

  // Same mutation as updateEffect but no snapshot - a pointermove-driven drag calls this on
  // every move event, so snapshotting here fills the 100-entry undo stack with intermediate
  // drag frames (Ctrl+Z nudges by a pixel instead of undoing the drag). The caller snapshots
  // once via snapshot() at drag start instead (see SequencerGrid's dragStart emit).
  function updateEffectLive(effectId: string, patch: Partial<Pick<SequenceEffect, "startMs" | "endMs" | "params" | "palette" | "blendMode" | "mix" | "transition" | "layer" | "colorAdjust">>): void {
    applyEffectPatch(effectId, patch);
  }

  /**
   * Moves an effect to another row, keeping its timing and its id.
   *
   * Same id deliberately: the effect the user is looking at should still be the selected one
   * after it moves, and a new id would deselect it mid-gesture.
   */
  function moveEffectToRow(
    effectId: string,
    elementType: "model" | "group" | "submodel",
    elementId: number,
    subName: string | undefined,
  ): void {
    let moving: SequenceEffect | undefined;
    for (const row of body.value.rows) {
      const found = row.effects.find((e) => e.id === effectId);
      if (found) moving = found;
    }
    if (!moving) return;
    pushUndoSnapshot();
    for (const row of body.value.rows) row.effects = row.effects.filter((e) => e.id !== effectId);
    ensureRow(elementType, elementId, subName).effects.push(moving);
  }

  /**
   * Moves an effect to another row without taking a snapshot.
   *
   * The caller has already snapshotted for the batch it belongs to - a drag that moved effects
   * both in time and across rows should be one Ctrl+Z, not two.
   */
  function moveEffectToRowLive(
    effectId: string,
    elementType: "model" | "group" | "submodel",
    elementId: number,
    subName: string | undefined,
  ): void {
    let moving: SequenceEffect | undefined;
    for (const row of body.value.rows) {
      const found = row.effects.find((e) => e.id === effectId);
      if (found) moving = found;
    }
    if (!moving) return;
    const target = ensureRow(elementType, elementId, subName);
    if (target.effects.some((e) => e.id === effectId)) return; // already there
    for (const row of body.value.rows) row.effects = row.effects.filter((e) => e.id !== effectId);
    ensureRow(elementType, elementId, subName).effects.push(moving);
  }

  /**
   * Puts one effect on a layer without taking a snapshot.
   *
   * Paired with moveEffectToRowLive: a drag that crossed both rows and layers is one action, so
   * the snapshot belongs to the batch rather than to each step of it.
   */
  function setEffectLayerLive(effectId: string, layerIndex: number): void {
    for (const row of body.value.rows) {
      const effect = row.effects.find((e) => e.id === effectId);
      if (effect) effect.layerIndex = layerIndex;
    }
  }

  function deleteEffect(effectId: string): void {
    pushUndoSnapshot();
    for (const row of body.value.rows) {
      row.effects = row.effects.filter((e) => e.id !== effectId);
    }
    if (selectedEffectId.value === effectId) selectedEffectId.value = null;
    selectedEffectIds.value = selectedEffectIds.value.filter((id) => id !== effectId);
  }

  /**
   * Replaces the selection and its reference together.
   *
   * One setter rather than two refs the caller keeps in step: a reference that isn't in the
   * selection would align effects to something not selected, which is invisible and wrong.
   */
  function setSelection(ids: readonly string[], reference: string | null): void {
    selectedEffectIds.value = [...ids];
    selectedEffectId.value = reference && ids.includes(reference) ? reference : (ids[0] ?? null);
  }

  /** Deletes every selected effect under one undo entry. */
  function deleteSelected(): void {
    const ids = new Set(selectedEffectIds.value);
    if (ids.size === 0) return;
    pushUndoSnapshot();
    for (const row of body.value.rows) row.effects = row.effects.filter((e) => !ids.has(e.id));
    selectedEffectIds.value = [];
    selectedEffectId.value = null;
  }

  /**
   * Puts one palette on several effects, under one undo entry.
   *
   * The Colour panel's Update button. Only the palette: it means the same thing to every effect,
   * where an effect's own parameters mean nothing to an effect of another kind.
   */
  function updateEffectsPalette(ids: readonly string[], palette: StoredSwatch[] | undefined): void {
    if (ids.length === 0) return;
    pushUndoSnapshot();
    for (const id of ids) applyEffectPatch(id, { palette });
  }

  /**
   * Moves effects between layers, and deletes any the edit removes, under one undo entry.
   *
   * Adding or deleting a layer renumbers everything above it, so it is one action however many
   * effects it touches - undoing an "add layer" one effect at a time would leave the row in a
   * state nobody asked for.
   */
  function applyLayerEdit(moves: readonly { id: string; layerIndex: number }[], deleted: readonly string[] = []): void {
    if (moves.length === 0 && deleted.length === 0) return;
    pushUndoSnapshot();
    const gone = new Set(deleted);
    for (const row of body.value.rows) row.effects = row.effects.filter((e) => !gone.has(e.id));
    for (const move of moves) {
      for (const row of body.value.rows) {
        const effect = row.effects.find((e) => e.id === move.id);
        if (effect) effect.layerIndex = move.layerIndex;
      }
    }
    selectedEffectIds.value = selectedEffectIds.value.filter((id) => !gone.has(id));
    if (selectedEffectId.value && gone.has(selectedEffectId.value)) selectedEffectId.value = null;
  }

  /** Applies a patch to several effects under one undo entry (an alignment moves all of them). */
  function updateEffects(patches: readonly { id: string; startMs: number; endMs: number }[]): void {
    if (patches.length === 0) return;
    pushUndoSnapshot();
    for (const patch of patches) applyEffectPatch(patch.id, { startMs: patch.startMs, endMs: patch.endMs });
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

  function pasteEffectAt(elementType: "model" | "group" | "submodel", elementId: number, subName: string | undefined, copied: SequenceEffect, atMs: number): void {
    const duration = copied.endMs - copied.startMs;
    const clone = JSON.parse(JSON.stringify(copied)) as SequenceEffect;
    addEffect(elementType, elementId, subName, { ...clone, id: newEffectId(), startMs: atMs, endMs: atMs + duration });
  }

  /**
   * Adds several effects under one undo entry.
   *
   * Pasting a block of eight is one action, so it has to be one Ctrl+Z - eight presses to undo one
   * paste is the kind of thing that stops people using paste.
   */
  function addEffects(placements: readonly { elementType: "model" | "group" | "submodel"; elementId: number; subName?: string; effect: SequenceEffect }[]): void {
    if (placements.length === 0) return;
    pushUndoSnapshot();
    for (const p of placements) ensureRow(p.elementType, p.elementId, p.subName).effects.push(p.effect);
  }

  function addTimingMark(trackIndex: number, ms: number): void {
    addTimingMarks(trackIndex, [ms]);
  }

  /**
   * Adds several marks under one undo entry.
   *
   * Subdividing a marked region adds dozens at once, and adding them one at a time would mean
   * dozens of presses of Ctrl+Z to undo one press of `4`.
   *
   * The label bookkeeping is in lib/timingMarks.ts - labels are positional, so an insert has to
   * move them or a lyric track's words come out one phrase late with nothing reporting an error.
   */
  function addTimingMarks(trackIndex: number, msList: readonly number[]): void {
    const track = body.value.timingTracks[trackIndex];
    if (!track) return;
    const next = withMarksAdded(track, msList);
    if (next === track) return; // nothing new - not worth an undo entry
    pushUndoSnapshot();
    Object.assign(track, next);
  }

  function deleteTimingMark(trackIndex: number, ms: number): void {
    const track = body.value.timingTracks[trackIndex];
    if (!track) return;
    const next = withMarkRemoved(track, ms);
    if (next === track) return;
    pushUndoSnapshot();
    Object.assign(track, next);
  }

  /** Sets the label on one mark (xLights' Edit Label dialog). */
  function setTimingLabel(trackIndex: number, markIndex: number, label: string): void {
    const track = body.value.timingTracks[trackIndex];
    if (!track) return;
    const next = withLabelSet(track, markIndex, label);
    if (next === track) return;
    pushUndoSnapshot();
    Object.assign(track, next);
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

  /**
   * Adds a track that came from somewhere else - today, a MIDI file's notes.
   *
   * Named uniquely like the generated ones, and for the same reason: an imported sequence's own
   * tracks are real data, and a name collision that overwrote one would destroy it silently.
   */
  function addTimingTrack(track: TimingTrack): void {
    pushUndoSnapshot();
    let name = track.name;
    let n = 2;
    while (body.value.timingTracks.some((t) => t.name === name)) name = `${track.name} ${n++}`;
    body.value.timingTracks.push({ ...track, name });
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
      if (autosaveDebounceMs === 0) return; // autosave off; the Snapshot button still saves
      saveTimer = setTimeout(saveNow, autosaveDebounceMs);
    },
    { deep: true },
  );

  return {
    sequence,
    body,
    selectedEffectId,
    selectedEffectIds,
    setSelection,
    deleteSelected,
    updateEffects,
    updateEffectsPalette,
    applyLayerEdit,
    saveStatus,
    conflictRemote,
    keepMine,
    takeTheirs,
    canUndo,
    canRedo,
    load,
    undo,
    redo,
    saveSettings,
    addEffect,
    addEffects,
    updateEffect,
    updateEffectLive,
    deleteEffect,
    findEffect,
    copyEffect,
    pasteEffectAt,
    addTimingMark,
    addTimingMarks,
    deleteTimingMark,
    setTimingLabel,
    ensureDefaultTimingTrack,
    generateTimingMarks,
    addTimingTrack,
    moveEffectToRow,
    moveEffectToRowLive,
    setEffectLayerLive,
    snapshot: pushUndoSnapshot,
    saveNow,
  };
});
