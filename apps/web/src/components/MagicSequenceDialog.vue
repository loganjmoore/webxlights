<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import type { SongMap, SectionLabel, StoredSwatch } from "@webxlights/engine";
import ModalPanel from "./ModalPanel.vue";
import { api, type ModelGroupRecord, type ModelRecord } from "../lib/api";
import { confirm } from "../lib/confirm";
import { propMap, ROLE_NAMES, type PropInfo, type Role } from "../lib/propRoles";
import { feelFromSong, feelSpec, FEELS } from "../lib/magic/feels";
import { rulesDirector } from "../lib/magic/director";
import { choreograph } from "../lib/magic/choreograph";
import { magicBody, sectionNames, type MagicMode } from "../lib/magic/apply";
import { ROLE_EFFECTS } from "../lib/magic/roleEffects";
import type { Feel, ShowPlan } from "../lib/magic/plan";
import { analyzeSongInWorker, audioHash, cachedSongMap, withCachedSongMap } from "../lib/magic/songMapClient";
import { directPlan, planRequest } from "../lib/magic/aiDirector";
import type { MagicStatus } from "../lib/magic/plan";
import { loadKey, loadProvider } from "../lib/anthropicKey";
import { newEffectId, useSequencerStore } from "../stores/sequencer";

// Magic Sequence (docs/MAGIC-SEQUENCE.md 4): one press, an editable sequence across the user's
// own props. Everything here runs in the browser; the analysis runs in a worker.

const props = defineProps<{
  layoutId: number | null;
  models: ModelRecord[];
  groups: ModelGroupRecord[];
  audio: AudioBuffer;
  audioFile: File | null;
  savedPalettes: StoredSwatch[][];
}>();
const emit = defineEmits<{ close: []; layoutChanged: [] }>();

const store = useSequencerStore();

const ROLE_LABELS: Record<Role, string> = {
  mega_tree: "Mega tree", mini_tree: "Mini trees", matrix: "Matrix", singing_face: "Singing faces", arch: "Arches", cane: "Canes",
  spinner: "Spinners", snowflake: "Snowflakes", star: "Stars", window: "Windows", outline: "Outlines", icicle: "Icicles", wreath: "Wreaths",
  bush: "Bushes", flood: "Floods", present: "Presents", character: "Characters", pathway: "Pathway", moving_head: "Moving heads",
  whole_house: "Whole house", other: "Other",
};
const LABELS: SectionLabel[] = ["intro", "verse", "prechorus", "chorus", "bridge", "breakdown", "solo", "outro"];

const song = shallowRef<SongMap | null>(null);
const songHash = ref<string | null>(null);
const analysis = ref("Reading the song…");
const analysisFailed = ref(false);
const selectedSection = ref<number | null>(null);

const feel = ref<Feel>("auto");
const paletteChoice = ref(-1); // -1: from the feel
const excluded = ref<Set<Role>>(new Set());
const createGroups = ref(true);
const fixingRoles = ref(false);
const mode = ref<MagicMode>("fill-empty");
// The AI director: offered when the server has a provider or the user has their own key, the
// same rules as the shader assistant.
const status = ref<MagicStatus | null>(null);
const userKey = loadKey();
const aiAvailable = computed(() => !!status.value && (status.value.available || (status.value.accepts_user_keys && userKey !== null)));
const useAi = ref(true);
const direction = ref("");
const notice = ref("");

const busy = ref(false);
const progress = ref("");
const result = ref<{ added: number; skippedRows: number } | null>(null);
// Undo and Try another touch the undo stack only when the top entry is still ours.
const appliedAtDepth = ref<number | null>(null);
const lastPlan = shallowRef<ShowPlan | null>(null);
const seed = ref(Math.floor(Math.random() * 2 ** 31));

const allProps = computed(() => propMap(props.models, props.groups));
const roleCounts = computed(() => {
  const counts = new Map<Role, number>();
  for (const p of allProps.value) if (p.key.startsWith("model:") && p.nodes > 0 && ROLE_EFFECTS[p.role].length) counts.set(p.role, (counts.get(p.role) ?? 0) + 1);
  return ROLE_NAMES.filter((r) => counts.has(r)).map((role) => ({ role, count: counts.get(role)! }));
});
const scopedProps = computed<PropInfo[]>(() => allProps.value.filter((p) => !excluded.value.has(p.role)));
const hexPalettes = computed(() => props.savedPalettes.filter((p) => p.length >= 2 && p.every((s): s is string => typeof s === "string")) as string[][]);
const resolvedFeel = computed(() => (song.value ? feelFromSong(song.value) : "joyful"));
const feelPalette = computed(() => FEELS[feel.value === "auto" ? resolvedFeel.value : feel.value].palettes[0]!);
const hasEffects = computed(() => store.body.rows.some((r) => r.effects.length > 0));
const canUndo = computed(() => appliedAtDepth.value !== null && store.undoDepth === appliedAtDepth.value);
const names = computed(() => (song.value ? sectionNames(song.value) : []));

onMounted(async () => {
  api.magicStatus().then((s) => (status.value = s), () => undefined);
  try {
    const hash = props.audioFile ? await audioHash(await props.audioFile.arrayBuffer()) : null;
    songHash.value = hash;
    const cached = hash ? cachedSongMap(store.sequence?.metadata, hash) : null;
    if (cached) {
      song.value = cached;
      analysis.value = "";
      return;
    }
    analysis.value = "Finding beats…";
    const map = await analyzeSongInWorker(props.audio, (_fraction, step) => (analysis.value = `${step}…`));
    song.value = map;
    analysis.value = "";
    void saveSongMap(map);
  } catch (err) {
    analysisFailed.value = true;
    analysis.value = err instanceof Error ? `Couldn't analyse the song: ${err.message}` : "Couldn't analyse the song.";
  }
});

/** Kept on the sequence so the song is analysed once. A viewer can't save; that's fine. */
async function saveSongMap(map: SongMap): Promise<void> {
  if (!songHash.value || !store.sequence) return;
  try {
    await store.saveSettings({ metadata: withCachedSongMap(store.sequence.metadata, songHash.value, map) });
  } catch {
    /* the next press analyses again */
  }
}

function relabel(index: number, label: SectionLabel): void {
  if (!song.value) return;
  const sections = song.value.sections.map((s, i) => (i === index ? { ...s, label } : s));
  song.value = { ...song.value, sections };
  void saveSongMap(song.value);
}

function toggleRole(role: Role): void {
  const next = new Set(excluded.value);
  if (next.has(role)) next.delete(role);
  else next.add(role);
  excluded.value = next;
}

/** The user's correction, stored on the model, wins next time (params.magicRole). */
async function setRole(model: ModelRecord, role: string): Promise<void> {
  if (props.layoutId === null) return;
  const params = { ...model.params };
  if (role) params.magicRole = role;
  else delete params.magicRole;
  await api.updateModel(props.layoutId, model.id, { params });
  emit("layoutChanged");
}

/**
 * "Magic: Arches" for every role with two or more props and no group of its own. Ordinary groups
 * afterwards; one effect on the group renders the same as the same effect on each member.
 */
async function ensureGroups(): Promise<void> {
  if (props.layoutId === null || !createGroups.value) return;
  const wanted = roleCounts.value
    .filter(({ role, count }) => count >= 2 && !["whole_house", "other", "moving_head"].includes(role) && !excluded.value.has(role))
    .filter(({ role }) => !allProps.value.some((p) => p.key.startsWith("group:") && p.role === role))
    .map(({ role }) => ({
      name: `Magic: ${ROLE_LABELS[role]}`,
      memberNames: allProps.value.filter((p) => p.key.startsWith("model:") && p.role === role).map((p) => p.name),
    }));
  if (wanted.length === 0) return;
  await api.bulkUpsertModelGroups(props.layoutId, wanted);
  emit("layoutChanged");
  // The parent reloads its copy; this press needs the groups now.
  const groups = await api.listModelGroups(props.layoutId);
  generationProps.value = propMap(props.models, groups).filter((p) => !excluded.value.has(p.role));
}
const generationProps = shallowRef<PropInfo[] | null>(null);

async function generate(again = false): Promise<void> {
  if (!song.value || !store.sequence || busy.value) return;
  if (mode.value === "replace" && hasEffects.value && !again) {
    const ok = await confirm({ title: "Replace everything?", message: "Every effect in this sequence is replaced. One Undo brings them back.", confirmLabel: "Replace", danger: true });
    if (!ok) return;
  }
  busy.value = true;
  result.value = null;
  try {
    if (again && canUndo.value) store.undo();
    else {
      generationProps.value = null;
      progress.value = "Grouping props…";
      await ensureGroups().catch(() => undefined);
    }
    const scope = generationProps.value ?? scopedProps.value;
    const palette = paletteChoice.value >= 0 ? hexPalettes.value[paletteChoice.value] : undefined;
    notice.value = "";
    let plan = again && lastPlan.value ? lastPlan.value : rulesDirector({ song: song.value, props: scope, feel: feel.value, seed: seed.value, ...(palette ? { palette } : {}) });
    if (!again && aiAvailable.value && useAi.value) {
      progress.value = "Asking the director…";
      const meta = store.sequence.metadata;
      const stored = loadProvider();
      const directed = await directPlan(
        store.sequence.id,
        planRequest(song.value, scope, feel.value, { direction: direction.value, title: meta?.song || store.sequence.name, ...(meta?.artist ? { artist: meta.artist } : {}) }),
        plan,
        userKey ? { key: userKey, provider: stored.provider, model: stored.model } : undefined,
      );
      plan = directed.plan;
      if (directed.notice) notice.value = directed.notice;
      if (directed.dropped?.length) console.info("Magic Sequence: the director's plan lost", directed.dropped);
      if (status.value?.available && !userKey) api.magicStatus().then((s) => (status.value = s), () => undefined);
    }
    lastPlan.value = plan;
    const placements = choreograph(song.value, scope, plan, {
      feel: feelSpec(feel.value, song.value), seed: seed.value, frameMs: store.sequence.frame_ms,
      title: store.sequence.metadata?.song || store.sequence.name,
    });
    progress.value = `Placing ${placements.length.toLocaleString()} effects…`;
    const applied = magicBody(store.body, placements, song.value, mode.value, newEffectId);
    store.replaceBody(applied.body);
    appliedAtDepth.value = store.undoDepth;
    result.value = { added: applied.added, skippedRows: applied.skippedRows };
    progress.value = "";
  } finally {
    busy.value = false;
  }
}

function tryAnother(): void {
  seed.value = (seed.value + 0x9e3779b1) >>> 0;
  void generate(true);
}

function undo(): void {
  if (!canUndo.value) return;
  store.undo();
  appliedAtDepth.value = null;
  result.value = null;
}

const strip = computed(() => {
  const s = song.value;
  if (!s) return [];
  return s.sections.map((section, i) => ({ i, name: names.value[i]!, group: section.group, width: ((section.endMs - section.startMs) / s.durationMs) * 100, energy: section.energy }));
});
</script>

<template>
  <ModalPanel id="magic" wide title="Magic Sequence" @close="emit('close')">
    <div class="magic">
      <section aria-labelledby="magic-song">
        <h2 id="magic-song">Song</h2>
        <p v-if="!song" class="note" role="status" :class="{ error: analysisFailed }">{{ analysis }}</p>
        <template v-else>
          <p class="note">
            <span class="num">{{ Math.round(song.bpm) }}</span> BPM · {{ song.beatsPerBar }}/4 · {{ song.sections.length }} sections
            <span v-if="song.confidence.beats < 0.5"> · the beat is hard to hear in this song, so check the Magic Beats track</span>
          </p>
          <div class="strip" role="group" aria-label="Sections">
            <button
              v-for="seg in strip"
              :key="seg.i"
              type="button"
              class="segment"
              :class="{ current: selectedSection === seg.i }"
              :style="{ flexGrow: seg.width, '--energy': seg.energy }"
              :title="`${seg.name} (group ${seg.group})`"
              :aria-pressed="selectedSection === seg.i"
              @click="selectedSection = selectedSection === seg.i ? null : seg.i"
            >{{ seg.name }}</button>
          </div>
          <label v-if="selectedSection !== null" class="row">
            {{ names[selectedSection] }} is a
            <select :value="song.sections[selectedSection]!.label" @change="relabel(selectedSection!, ($event.target as HTMLSelectElement).value as SectionLabel)">
              <option v-for="label in LABELS" :key="label" :value="label">{{ label }}</option>
            </select>
          </label>
        </template>
      </section>

      <section aria-labelledby="magic-feel">
        <h2 id="magic-feel">Feel</h2>
        <select v-model="feel" aria-labelledby="magic-feel">
          <option value="auto">From the song{{ song ? ` (${FEELS[resolvedFeel].label})` : "" }}</option>
          <option v-for="(spec, key) in FEELS" :key="key" :value="key">{{ spec.label }}</option>
        </select>
      </section>

      <section v-if="aiAvailable" aria-labelledby="magic-director">
        <h2 id="magic-director">Director</h2>
        <label class="row"><input v-model="useAi" type="checkbox" /> Ask the AI director for the plan</label>
        <textarea
          v-if="useAi"
          v-model="direction"
          maxlength="500"
          rows="2"
          placeholder="Direction, if you have one: “icy blue and white, make the tree the star of the chorus”"
          aria-label="Direction for the AI director"
        />
        <p v-if="useAi && status && !userKey && status.monthly_limit > 0" class="note">
          <span class="num">{{ Math.max(0, status.monthly_limit - status.used_this_month) }}</span> of {{ status.monthly_limit }} free plans left this month.
          Try another reuses the plan.
        </p>
      </section>

      <section aria-labelledby="magic-colours">
        <h2 id="magic-colours">Colours</h2>
        <div class="palettes" role="radiogroup" aria-labelledby="magic-colours">
          <button type="button" role="radio" :aria-checked="paletteChoice === -1" :class="{ current: paletteChoice === -1 }" @click="paletteChoice = -1">
            <span class="swatches"><span v-for="c in feelPalette" :key="c" :style="{ background: c }" /></span>
            From the feel
          </button>
          <button
            v-for="(palette, i) in hexPalettes"
            :key="i"
            type="button"
            role="radio"
            :aria-checked="paletteChoice === i"
            :class="{ current: paletteChoice === i }"
            :title="palette.join(', ')"
            @click="paletteChoice = i"
          >
            <span class="swatches"><span v-for="c in palette" :key="c" :style="{ background: c }" /></span>
          </button>
        </div>
      </section>

      <section aria-labelledby="magic-props">
        <h2 id="magic-props">Props</h2>
        <div class="chips">
          <button
            v-for="{ role, count } in roleCounts"
            :key="role"
            type="button"
            :aria-pressed="!excluded.has(role)"
            :class="{ off: excluded.has(role) }"
            :title="excluded.has(role) ? 'Left out. Click to include.' : 'Included. Click to leave out.'"
            @click="toggleRole(role)"
          >{{ ROLE_LABELS[role] }} <span class="num">{{ count }}</span></button>
        </div>
        <div class="row">
          <label><input v-model="createGroups" type="checkbox" /> Create groups for roles without one</label>
          <button type="button" class="link" :aria-expanded="fixingRoles" @click="fixingRoles = !fixingRoles">Fix roles…</button>
        </div>
        <ul v-if="fixingRoles" class="roles">
          <li v-for="model in models" :key="model.id">
            <span>{{ model.name }}</span>
            <select :value="(model.params?.magicRole as string | undefined) ?? ''" :aria-label="`Role of ${model.name}`" @change="setRole(model, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ ROLE_LABELS[allProps.find((p) => p.key === `model:${model.id}`)?.role ?? "other"] }} (detected)</option>
              <option v-for="role in ROLE_NAMES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
            </select>
          </li>
        </ul>
      </section>

      <section aria-labelledby="magic-mode">
        <h2 id="magic-mode">Where</h2>
        <div class="modes" role="radiogroup" aria-labelledby="magic-mode">
          <label><input v-model="mode" type="radio" value="fill-empty" /> Fill empty rows</label>
          <label><input v-model="mode" type="radio" value="replace" /> Replace everything</label>
          <label><input v-model="mode" type="radio" value="new-layers" /> New layers on top</label>
        </div>
      </section>

      <footer>
        <button type="button" class="primary" :disabled="!song || busy" @click="generate()">Generate</button>
        <button v-if="result" type="button" :disabled="busy || !canUndo" title="A new arrangement of the same plan" @click="tryAnother">Try another</button>
        <button v-if="result" type="button" :disabled="busy || !canUndo" :title="canUndo ? 'Remove what Magic Sequence placed' : 'You have edited since; use Ctrl+Z'" @click="undo">Undo</button>
        <span class="note" role="status" aria-live="polite">
          <template v-if="progress">{{ progress }}</template>
          <template v-else-if="result">
            Placed <span class="num">{{ result.added.toLocaleString() }}</span> effects<template v-if="result.skippedRows">, leaving {{ result.skippedRows }} rows that already had effects</template>.
            {{ notice }}
          </template>
        </span>
      </footer>
    </div>
  </ModalPanel>
</template>

<style scoped>
.magic {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: min(40rem, 90vw);
  font-size: 0.85rem;
  text-align: left;
}
h2 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.note {
  color: var(--text-muted);
}
.note.error {
  color: var(--danger);
}
.num {
  font-variant-numeric: tabular-nums;
}
textarea {
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.4rem 0.5rem;
  box-sizing: border-box;
  font: inherit;
  resize: vertical;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
}
button,
select {
  height: 28px;
  padding: 0 0.65rem;
  font: inherit;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--text-muted);
}
button:disabled {
  color: var(--text-dim);
  cursor: default;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
button.primary:disabled {
  background: var(--bg-control);
  border-color: var(--border-strong);
  color: var(--text-dim);
}
button.link {
  border: none;
  background: none;
  padding: 0;
  height: auto;
  color: var(--text-muted);
  text-decoration: underline;
}
.strip {
  display: flex;
  gap: 2px;
  height: 2.2rem;
}
.segment {
  flex-basis: 0;
  min-width: 0;
  height: 100%;
  padding: 0 0.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  /* Louder sections read brighter: the strip is the song's shape at a glance. */
  background: color-mix(in srgb, var(--bg-hover) calc(100% - var(--energy) * 60%), var(--text-muted));
  border-color: transparent;
}
.segment.current {
  border-color: var(--accent);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.palettes,
.chips,
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.palettes button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.palettes button.current {
  border-color: var(--accent);
}
.swatches {
  display: inline-flex;
}
.swatches span {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  margin-right: 2px;
  outline: 1px solid rgba(0, 0, 0, 0.4);
}
.chips button.off {
  color: var(--text-dim);
  text-decoration: line-through;
}
.modes label,
.row label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}
.modes {
  gap: 1rem;
}
.roles {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  max-height: 14rem;
  overflow: auto;
}
.roles li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  padding: 0.2rem 0;
  border-bottom: 1px solid var(--border);
}
footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
</style>
