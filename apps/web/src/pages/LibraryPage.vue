<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import ImportMappingDialog from "../components/ImportMappingDialog.vue";
import { api, type LibrarySequenceRecord, type LibrarySequenceSummary, type ModelGroupRecord, type ModelRecord } from "../lib/api";
import { mappingTargets, type DonorRow, type EffectMapping, type MappingTarget } from "../lib/importMapping";
import { applyLibraryMapping, libraryDonorRows } from "../lib/libraryMapping";
import { useAuthStore } from "../stores/auth";

// The shared sequence library. Browse what people have published, see which models a sequence
// was written for, and copy it onto your own layout: the same mapping dialog an xsq import uses
// asks which of your models takes which of theirs, and the copy opens in the sequencer where the
// preview shows it on your show.

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const projectId = computed(() => Number(route.params.projectId));

const query = ref("");
const sort = ref<"recent" | "popular">("recent");
const scope = ref<"all" | "mine">("all");
const entries = ref<LibrarySequenceSummary[]>([]);
const total = ref(0);
const page = ref(1);
const lastPage = ref(1);
const loading = ref(false);
const message = ref("");

async function load(reset = true): Promise<void> {
  loading.value = true;
  try {
    if (reset) page.value = 1;
    const result = await api.listLibrary({ q: query.value.trim() || undefined, sort: sort.value, mine: scope.value === "mine", page: page.value });
    entries.value = reset ? result.data : [...entries.value, ...result.data];
    total.value = result.total;
    lastPage.value = result.last_page;
  } catch (err) {
    message.value = err instanceof Error ? err.message : "Couldn't load the library.";
  } finally {
    loading.value = false;
  }
}
async function more(): Promise<void> {
  page.value += 1;
  await load(false);
}
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 250);
});
watch([sort, scope], () => void load());
onMounted(() => void load());

function minutes(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- onto my layout --------------------------------------------------------------------------

const pending = ref<{ entry: LibrarySequenceRecord; targets: MappingTarget[]; donors: DonorRow[]; timingTrackNames: string[] } | null>(null);
const busy = ref(false);

async function useOnMyLayout(summary: LibrarySequenceSummary): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    const [entry, layouts] = await Promise.all([api.getLibrarySequence(summary.id), api.listLayouts(projectId.value)]);
    const layout = layouts[0];
    const [models, groups]: [ModelRecord[], ModelGroupRecord[]] = await Promise.all([
      layout ? api.listModels(layout.id) : Promise.resolve([]),
      layout ? api.listModelGroups(layout.id) : Promise.resolve([]),
    ]);
    const targets = mappingTargets(models, groups);
    if (targets.length === 0) {
      message.value = "This project has no models yet, so there is nowhere for the effects to go. Add some on the Layout page first.";
      return;
    }
    pending.value = { entry, targets, donors: libraryDonorRows(entry.donors), timingTrackNames: entry.timing_track_names };
  } catch (err) {
    message.value = err instanceof Error ? err.message : "Couldn't open that sequence.";
  } finally {
    busy.value = false;
  }
}

async function confirmMapping(mapping: EffectMapping, timingTracks: string[]): Promise<void> {
  const p = pending.value;
  if (!p) return;
  pending.value = null;
  busy.value = true;
  try {
    const applied = applyLibraryMapping(p.entry, p.targets, mapping, timingTracks);
    const record = await api.copyLibrarySequence(p.entry.id, { project_id: projectId.value, name: p.entry.title, body: applied.body });
    const parts = [`${applied.mappedCount} rows onto your models`];
    if (applied.unusedDonorNames.length) parts.push(`left behind: ${applied.unusedDonorNames.join(", ")}`);
    if (!p.entry.has_audio) parts.push("no audio came with it; add the song in the sequencer");
    // The sequencer is where you look at it: its preview draws the copy on your own layout.
    await router.push({ name: "sequencer", params: { projectId: projectId.value, sequenceId: record.id }, query: { importMessage: `Copied ${parts.join(" — ")}` } });
  } catch (err) {
    message.value = err instanceof Error ? err.message : "Couldn't copy that sequence.";
  } finally {
    busy.value = false;
  }
}

async function remove(entry: LibrarySequenceSummary): Promise<void> {
  if (!window.confirm(`Take "${entry.title}" out of the library? People who already copied it keep their copy.`)) return;
  try {
    await api.deleteLibrarySequence(entry.id);
    entries.value = entries.value.filter((e) => e.id !== entry.id);
    total.value -= 1;
  } catch (err) {
    message.value = err instanceof Error ? err.message : "Couldn't remove it.";
  }
}
</script>

<template>
  <main class="library-page">
    <AppBar :project-id="projectId" active="library" />
    <header class="page-toolbar">
      <h1>Library</h1>
      <input v-model="query" class="search" type="search" placeholder="Search sequences…" aria-label="Search the library" />
      <select v-model="scope" aria-label="Whose">
        <option value="all">Everyone's</option>
        <option value="mine">Mine</option>
      </select>
      <select v-model="sort" aria-label="Sort">
        <option value="recent">Newest</option>
        <option value="popular">Most used</option>
      </select>
      <span class="count">{{ total }} shared</span>
    </header>

    <p v-if="message" class="notice">{{ message }}</p>
    <p class="intro">
      Sequences people have shared. Pick one and <strong>Use on my layout</strong>: you choose which of your models takes which of theirs, and the copy opens
      in the sequencer with the preview drawn on your show. Share your own from the sequencer's Sequence menu.
    </p>

    <p v-if="loading && entries.length === 0" class="empty">Loading…</p>
    <p v-else-if="entries.length === 0" class="empty">Nothing here yet{{ query ? " for that search" : "" }}. Be the first: open a sequence and choose Sequence › Share to library.</p>

    <ul v-else class="grid">
      <li v-for="e in entries" :key="e.id" class="card">
        <div class="head">
          <h2>{{ e.title }}</h2>
          <span class="meta">{{ minutes(e.duration_ms) }} · {{ e.frame_ms }} ms frames · used {{ e.uses }}×</span>
        </div>
        <p v-if="e.description" class="desc">{{ e.description }}</p>
        <p class="by">by {{ e.author?.name ?? "someone" }}<span v-if="e.has_audio"> · with audio ({{ e.audio_filename }})</span><span v-else> · no audio</span></p>
        <ul class="donors" :title="`Written for ${e.donors.length} models`">
          <li v-for="d in e.donors.slice(0, 8)" :key="d.name">{{ d.name }} <span class="type">{{ d.type }}</span></li>
          <li v-if="e.donors.length > 8" class="more-donors">+{{ e.donors.length - 8 }} more</li>
        </ul>
        <div class="actions">
          <button type="button" class="primary" :disabled="busy" @click="useOnMyLayout(e)">Use on my layout</button>
          <button v-if="e.user_id === auth.user?.id" type="button" class="link danger" @click="remove(e)">Remove</button>
        </div>
      </li>
    </ul>
    <button v-if="page < lastPage" type="button" class="more" :disabled="loading" @click="more">Show more</button>

    <ImportMappingDialog
      v-if="pending"
      :targets="pending.targets"
      :donors="pending.donors"
      :timing-track-names="pending.timingTrackNames"
      :file-name="pending.entry.title"
      @cancel="pending = null"
      @confirm="confirmMapping"
    />
  </main>
</template>

<style scoped>
.library-page {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  text-align: left;
}
.page-toolbar .search {
  width: 18rem;
  max-width: 40vw;
}
.count {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.intro,
.notice,
.empty {
  margin: 0.75rem 1.25rem;
  font-size: 0.9rem;
  color: var(--text-muted);
  max-width: 70ch;
}
.notice {
  color: var(--accent);
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0.5rem 1.25rem 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0.75rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.85rem 1rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
}
.head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.meta,
.by {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text);
}
.donors {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.donors li {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-control);
}
.donors .type {
  color: var(--text-dim);
}
.more-donors {
  color: var(--text-muted);
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.5rem;
}
button.primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  font-weight: 500;
}
button.link {
  background: none;
  border: none;
  color: var(--info);
  text-decoration: underline;
  padding: 0 0.3rem;
}
button.link.danger {
  color: var(--danger);
}
.more {
  margin: 0 1.25rem 2rem;
}
</style>
