<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectsStore } from "../stores/projects";
import { useAuthStore } from "../stores/auth";
import { api, type Project, type ProjectMember } from "../lib/api";
import { downloadPackage, exportPackage, importPackage } from "../lib/packageShow";

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

async function exportProject(p: Project): Promise<void> {
  packageBusy.value = true;
  packageMessage.value = "";
  try {
    const blob = await exportPackage(p.id, p.name);
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
    packageMessage.value = `Imported ${result.sequenceCount} sequence(s) into a new project.`;
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
</script>

<template>
  <main class="projects">
    <header class="page-header">
      <h1>Your projects</h1>
      <button class="logout-btn" @click="logout">Log out ({{ auth.user?.name }})</button>
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
    <ul>
      <li v-for="p in projects.projects" :key="p.id">
        <router-link :to="`/projects/${p.id}/layout`">{{ p.name }}</router-link>
        <button v-if="p.owner_id === auth.user?.id" class="share-btn" @click="toggleShare(p.id)">Share</button>
        <button class="share-btn" :disabled="packageBusy" @click="exportProject(p)">Export package</button>
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
  max-width: 480px;
  margin: 4rem auto;
  font-family: system-ui, sans-serif;
}
form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
form input {
  flex: 1;
}
.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.logout-btn {
  font-size: 0.8rem;
}
li {
  margin-bottom: 0.5rem;
}
.share-btn {
  margin-left: 0.5rem;
  font-size: 0.8rem;
}
.share-panel {
  margin: 0.4rem 0 0.8rem;
  padding: 0.6rem;
  background: #f4f4f4;
  border-radius: 4px;
  font-size: 0.85rem;
}
.members {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
}
.members li {
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
.share-error {
  color: #b00020;
  margin: 0.4rem 0 0;
}
.import-package-btn {
  display: inline-block;
  margin-bottom: 1rem;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  border: 1px solid #999;
  border-radius: 4px;
  font-size: 0.8rem;
}
.package-message {
  font-size: 0.85rem;
  color: #555;
}
</style>
