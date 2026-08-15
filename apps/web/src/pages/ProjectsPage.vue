<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectsStore } from "../stores/projects";
import { useAuthStore } from "../stores/auth";
import { api, type Project, type ProjectMember } from "../lib/api";
import { describeRestore, downloadPackage, exportPackage, importPackage } from "../lib/packageShow";
import { createSampleProject } from "../lib/demoProject";

const projects = useProjectsStore();
const auth = useAuthStore();
const router = useRouter();
const newName = ref("");
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
  router.push(`/projects/${project.id}/layout`);
}

async function toggleShare(projectId: number): Promise<void> {
  sharingProjectId.value = sharingProjectId.value === projectId ? null : projectId;
  shareError.value = "";
  if (sharingProjectId.value) members.value = await api.listMembers(projectId);
}

async function invite(): Promise<void> {
  if (!sharingProjectId.value || !inviteEmail.value.trim()) return;
  shareError.value = "";
  try {
    const member = await api.addMember(sharingProjectId.value, inviteEmail.value.trim(), inviteRole.value);
    members.value = [...members.value.filter((m) => m.user.id !== member.user.id), member];
    inviteEmail.value = "";
  } catch {
    shareError.value = "Couldn't add that person — check the email is a registered webXLights account.";
  }
}

async function removeMember(userId: number): Promise<void> {
  if (!sharingProjectId.value) return;
  await api.removeMember(sharingProjectId.value, userId);
  members.value = members.value.filter((m) => m.user.id !== userId);
}

async function logout(): Promise<void> {
  await auth.logout();
  router.push("/auth");
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
    <header class="page-header">
      <h1>Your projects</h1>
      <nav class="header-nav">
        <router-link to="/docs" class="docs-nav-link">Docs</router-link>
        <button class="logout-btn" @click="logout">Log out ({{ auth.user?.name }})</button>
      </nav>
    </header>
    <form @submit.prevent="createProject">
      <input v-model="newName" placeholder="New project name" required />
      <button type="submit">Create</button>
    </form>
    <label class="import-package-btn">
      {{ packageBusy ? "Working..." : "Import package (.zip)" }}
      <input type="file" accept=".zip" @change="onImportPackage" :disabled="packageBusy" hidden />
    </label>
    <p v-if="packageMessage" class="package-message">{{ packageMessage }}</p>

    <div v-if="projects.projects.length === 0" class="onboarding">
      <p>New here? Load a sample show to see how layouts, effects, and export work — no files needed.</p>
      <button :disabled="sampleBusy" @click="loadSampleProject">{{ sampleBusy ? "Building sample show..." : "Load sample project" }}</button>
      <p v-if="sampleError" class="error">{{ sampleError }}</p>
      <p class="docs-link"><router-link to="/docs">Import guide &amp; effect reference &rarr;</router-link></p>
    </div>

    <ul>
      <li v-for="p in projects.projects" :key="p.id">
        <router-link :to="`/projects/${p.id}/layout`">{{ p.name }}</router-link>
        <button v-if="p.owner_id === auth.user?.id" class="share-btn" @click="toggleShare(p.id)">Share</button>
        <button class="share-btn" :disabled="packageBusy" @click="exportProject(p)">Export package</button>
        <label class="package-option" title="Leave effect presets out of the package">
          <input v-model="excludePresets" type="checkbox" />
          without presets
        </label>
        <div v-if="sharingProjectId === p.id" class="share-panel">
          <ul class="members">
            <li v-for="m in members" :key="m.id">
              {{ m.user.name }} ({{ m.user.email }}) — {{ m.role }}
              <button @click="removeMember(m.user.id)">Remove</button>
            </li>
            <li v-if="members.length === 0" class="empty">Not shared with anyone yet.</li>
          </ul>
          <form @submit.prevent="invite" class="invite-form">
            <input v-model="inviteEmail" type="email" placeholder="person@example.com" required />
            <select v-model="inviteRole">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="submit">Invite</button>
          </form>
          <p v-if="shareError" class="share-error">{{ shareError }}</p>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.projects {
  min-height: 100vh;
  background: #0d0d11;
  color: #ddd;
  font-family: system-ui, sans-serif;
}
.projects > * {
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
}
.page-header {
  max-width: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid #333;
  background: #16161c;
  margin: 0;
}
.page-header h1 {
  font-size: 1.15rem;
  margin: 0;
  color: #fff;
  font-weight: 600;
}
.header-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.logout-btn,
.docs-nav-link {
  font-size: 0.8rem;
  color: #aaa;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.docs-nav-link:hover,
.logout-btn:hover {
  color: #e8c468;
}
form {
  display: flex;
  gap: 0.5rem;
  margin: 1.5rem auto 0;
  padding: 0 1.25rem;
}
form input {
  flex: 1;
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
  border: 1px solid #333;
  border-radius: 5px;
  background: #16161c;
  color: #eee;
}
form input:focus {
  outline: none;
  border-color: #e8c468;
}
form button {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  border-radius: 5px;
  background: #e8c468;
  color: #111;
  cursor: pointer;
}
.import-package-btn {
  display: inline-block;
  margin: 0.85rem 1.25rem 0;
  cursor: pointer;
  padding: 0.4rem 0.85rem;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 0.8rem;
  background: #1e1e26;
  color: #ddd;
}
.import-package-btn:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.package-message {
  font-size: 0.85rem;
  color: #888;
  padding: 0 1.25rem;
}
.onboarding {
  margin: 1.25rem 1.25rem 1.5rem;
  padding: 1.1rem;
  border: 1px dashed #444;
  border-radius: 8px;
  background: #16161c;
}
.onboarding p {
  margin: 0 0 0.6rem;
  color: #ccc;
}
.onboarding button {
  padding: 0.45rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  border-radius: 5px;
  background: #e8c468;
  color: #111;
  cursor: pointer;
}
.docs-link {
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
}
.docs-link a {
  color: #e8c468;
}
ul {
  padding: 0 1.25rem 1.5rem;
  margin: 0.5rem 0 0;
  list-style: none;
}
li {
  padding: 0.6rem 0;
  border-bottom: 1px solid #222;
}
li:last-child {
  border-bottom: none;
}
li > a {
  color: #ddd;
  font-weight: 500;
}
li > a:hover {
  color: #e8c468;
}
.share-btn {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e26;
  color: #ccc;
  cursor: pointer;
}
.share-btn:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.share-panel {
  margin: 0.6rem 0 0;
  padding: 0.75rem;
  background: #16161c;
  border: 1px solid #2a2a33;
  border-radius: 6px;
  font-size: 0.85rem;
}
.members {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
}
.members li {
  border-bottom: none;
  padding: 0.25rem 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.members .empty {
  color: #888;
}
.invite-form {
  display: flex;
  gap: 0.4rem;
}
.invite-form input,
.invite-form select {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}
.share-error {
  color: #e57373;
  margin: 0.4rem 0 0;
}
</style>
