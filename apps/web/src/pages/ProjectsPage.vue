<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectsStore } from "../stores/projects";
import { useAuthStore } from "../stores/auth";
import AppBar from "../components/AppBar.vue";
import MenuButton from "../components/MenuButton.vue";
import ModalPanel from "../components/ModalPanel.vue";
import { api, type Project, type ProjectMember } from "../lib/api";
import { relativeTime } from "../lib/relativeTime";
import { describeRestore, downloadPackage, exportPackage, importPackage } from "../lib/packageShow";
import { createSampleProject } from "../lib/demoProject";

const projects = useProjectsStore();
const auth = useAuthStore();
const router = useRouter();
const newName = ref("");
// The new-project row is asked for, not always there: a home page that opens on an empty text
// box reads as a form, and this is a place you come back to.
const showNew = ref(false);
const newNameInput = ref<HTMLInputElement | null>(null);
async function startNew(): Promise<void> {
  showNew.value = true;
  await nextTick();
  newNameInput.value?.focus();
}
const sharing = computed(() => projects.projects.find((p) => p.id === sharingProjectId.value) ?? null);
function sequencesCount(p: Project): string {
  const n = p.sequences_count ?? 0;
  return n === 1 ? "1 sequence" : `${n} sequences`;
}
const sharingProjectId = ref<number | null>(null);
const members = ref<ProjectMember[]>([]);
const inviteEmail = ref("");
const inviteRole = ref<"viewer" | "editor">("viewer");
const shareError = ref("");
const packageBusy = ref(false);
const packageMessage = ref("");

// xLights' Settings > Other > Exclude Presets. A package is often made to hand to someone else,
// and presets are the personal part of a show - the sequences and the layout are what they want.
const excludePresets = ref(false);

async function exportProject(p: Project): Promise<void> {
  packageBusy.value = true;
  packageMessage.value = "";
  try {
    const blob = await exportPackage(p.id, p.name, { excludePresets: excludePresets.value });
    downloadPackage(blob, p.name);
  } finally {
    packageBusy.value = false;
  }
}

async function onImportPackage(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  packageBusy.value = true;
  packageMessage.value = "";
  try {
    const result = await importPackage(file);
    await projects.fetchAll();
    // Says what came back rather than only how many sequences: a restore is checked against
    // what was expected, and the audio caveat matters most at exactly this moment.
    packageMessage.value = `Restored ${describeRestore(result)}`;
  } catch (err) {
    packageMessage.value = err instanceof Error ? `Import failed: ${err.message}` : "Import failed";
  } finally {
    packageBusy.value = false;
    input.value = "";
  }
}

onMounted(() => projects.fetchAll());

async function createProject(): Promise<void> {
  if (!newName.value.trim()) return;
  const project = await projects.create(newName.value.trim());
  newName.value = "";
  showNew.value = false;
  // Stays on the list: the new card appears where the others are, which is the confirmation.
  // Where to go next (layout first, usually) is the user's choice from the card.
  packageMessage.value = `Created ${project.name}`;
}

async function openShare(projectId: number): Promise<void> {
  sharingProjectId.value = projectId;
  shareError.value = "";
  members.value = await api.listMembers(projectId);
}

async function invite(): Promise<void> {
  if (!sharingProjectId.value || !inviteEmail.value.trim()) return;
  shareError.value = "";
  try {
    const member = await api.addMember(sharingProjectId.value, inviteEmail.value.trim(), inviteRole.value);
    members.value = [...members.value.filter((m) => m.user.id !== member.user.id), member];
    inviteEmail.value = "";
  } catch {
    shareError.value = "Couldn't add that person — check the email is a registered pixl account.";
  }
}

async function removeMember(userId: number): Promise<void> {
  if (!sharingProjectId.value) return;
  await api.removeMember(sharingProjectId.value, userId);
  members.value = members.value.filter((m) => m.user.id !== userId);
}

const sampleBusy = ref(false);
const sampleError = ref("");

async function loadSampleProject(): Promise<void> {
  sampleBusy.value = true;
  sampleError.value = "";
  try {
    const { projectId, sequenceId } = await createSampleProject();
    router.push({ name: "sequencer", params: { projectId, sequenceId } });
  } catch (err) {
    sampleError.value = err instanceof Error ? `Couldn't create the sample project: ${err.message}` : "Couldn't create the sample project";
  } finally {
    sampleBusy.value = false;
  }
}
</script>

<template>
  <main class="projects">
    <AppBar />
    <header class="page-toolbar">
      <h1>Projects</h1>
      <button class="primary" @click="startNew">New project</button>
      <label class="btn">
        {{ packageBusy ? "Working…" : "Import package (.zip)" }}
        <input type="file" accept=".zip" @change="onImportPackage" :disabled="packageBusy" hidden />
      </label>
      <span v-if="packageMessage" class="status">{{ packageMessage }}</span>
    </header>

    <div class="content">
      <!-- The first thing a new account sees: three ways in, the sample first because it is the
           one that shows what the app is before asking for a single file. -->
      <section v-if="projects.projects.length === 0 && !showNew" class="welcome">
        <h2>Welcome to pixl</h2>
        <p>
          A show is a project: a layout of your props, the sequences you make for them, and the
          controllers that drive them. Start with the sample show to see all three working, or
          begin with your own.
        </p>
        <div class="welcome-actions">
          <button class="primary" :disabled="sampleBusy" @click="loadSampleProject">
            {{ sampleBusy ? "Building the sample show…" : "Open the sample show" }}
          </button>
          <button @click="startNew">Create a blank project</button>
          <label class="btn">
            Import a package (.zip)
            <input type="file" accept=".zip" @change="onImportPackage" :disabled="packageBusy" hidden />
          </label>
        </div>
        <p v-if="sampleError" class="error">{{ sampleError }}</p>
        <p class="welcome-note">
          Coming from xLights? Import <code>xlights_rgbeffects.xml</code> on the Layout page and
          your <code>.xsq</code> files on the Sequences page. The <router-link to="/docs">import guide</router-link> walks through it.
        </p>
      </section>

      <form v-if="showNew" class="new-project" @submit.prevent="createProject">
        <input ref="newNameInput" v-model="newName" placeholder="Project name" required />
        <button type="submit" class="primary" :disabled="!newName.trim()">Create</button>
        <button type="button" @click="showNew = false; newName = ''">Cancel</button>
      </form>

      <ul v-if="projects.projects.length" class="grid">
        <li v-for="p in projects.projects" :key="p.id" class="card">
          <router-link :to="`/projects/${p.id}/sequences`" class="card-main">
            <span class="name">{{ p.name }}</span>
            <span class="meta">
              {{ sequencesCount(p) }}
              <template v-if="p.updated_at"> · edited {{ relativeTime(p.updated_at) }}</template>
              <span v-if="p.owner_id !== auth.user?.id" class="badge">shared with you</span>
            </span>
          </router-link>
          <div class="card-foot">
            <router-link :to="`/projects/${p.id}/layout`">Layout</router-link>
            <router-link :to="`/projects/${p.id}/sequences`">Sequences</router-link>
            <router-link :to="`/projects/${p.id}/controllers`">Network</router-link>
            <MenuButton
              label="⋯"
              :items="[
                ...(p.owner_id === auth.user?.id ? [{ label: 'Share…', run: () => openShare(p.id) }] : []),
                { label: 'Export package (.zip)', disabled: packageBusy, run: () => exportProject(p) },
                {
                  label: excludePresets ? 'Packages include presets' : 'Packages leave out presets',
                  checked: excludePresets,
                  run: () => (excludePresets = !excludePresets),
                },
              ]"
            />
          </div>
        </li>
      </ul>
    </div>

    <ModalPanel v-if="sharing" id="share" :title="`Share ${sharing.name}`" @close="sharingProjectId = null">
      <p class="share-note">
        People you add can open this project. Editors can change the layout and sequences; viewers can
        only look and export.
      </p>
      <ul class="members">
        <li v-for="m in members" :key="m.id">
          <span><strong>{{ m.user.name }}</strong> <span class="muted">{{ m.user.email }}</span></span>
          <span class="member-right"><span class="role">{{ m.role }}</span><button @click="removeMember(m.user.id)">Remove</button></span>
        </li>
        <li v-if="members.length === 0" class="muted">Not shared with anyone yet.</li>
      </ul>
      <form class="invite-form" @submit.prevent="invite">
        <input v-model="inviteEmail" type="email" placeholder="person@example.com" required />
        <select v-model="inviteRole">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button type="submit" class="primary">Add</button>
      </form>
      <p v-if="shareError" class="error">{{ shareError }}</p>
    </ModalPanel>
  </main>
</template>

<style scoped>
.projects {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  text-align: left;
}
.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
.status {
  color: var(--text-muted);
}
.welcome {
  max-width: 60ch;
  margin: 2rem auto 2.5rem;
  padding: 1.5rem 1.75rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
}
.welcome h2 {
  margin: 0 0 0.5rem;
  font-size: 1.2rem;
  font-weight: 600;
}
.welcome p {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.55;
}
.welcome-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.1rem 0;
}
.welcome-note {
  font-size: 0.8rem;
}
.welcome-note a {
  color: var(--accent);
}
.new-project {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.new-project input {
  flex: 1;
  max-width: 28rem;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  overflow: hidden;
  transition: border-color 150ms ease-out;
}
.card:hover {
  border-color: var(--border-strong);
}
.card-main {
  display: block;
  padding: 1rem 1rem 0.75rem;
  color: inherit;
  text-decoration: none;
  flex: 1;
}
.card-main:hover .name {
  color: var(--accent);
}
.name {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.badge {
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: rgba(106, 159, 216, 0.15);
  color: var(--info);
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
}
.card-foot a {
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius);
  color: var(--text-muted);
  text-decoration: none;
}
.card-foot a:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.card-foot :deep(.menu-button) {
  margin-left: auto;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0.1rem 0.45rem;
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
}
.projects button,
.projects .btn,
.projects input,
.projects select,
.members button,
.invite-form button,
.invite-form input,
.invite-form select {
  font: inherit;
  font-size: 0.8rem;
  height: 30px;
  padding: 0 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  box-sizing: border-box;
}
.projects button,
.projects .btn,
.members button,
.invite-form button {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.projects button:hover:not(:disabled),
.projects .btn:hover,
.members button:hover,
.invite-form button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.projects .primary,
.invite-form .primary:disabled {
  opacity: 0.45;
  color: var(--accent-ink);
}
.projects .primary,
.invite-form .primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.projects .primary:hover:not(:disabled) {
  color: var(--accent-ink);
  filter: brightness(1.05);
}
.projects button:disabled {
  color: var(--text-dim);
  cursor: default;
}
.share-note,
.muted {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.members {
  list-style: none;
  margin: 0.75rem 0;
  padding: 0;
  font-size: 0.85rem;
}
.members li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}
.member-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.role {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: capitalize;
}
.invite-form {
  display: flex;
  gap: 0.4rem;
}
.invite-form input {
  flex: 1;
}
.error {
  color: var(--danger);
  font-size: 0.8rem;
  margin-top: 0.5rem;
}
</style>
