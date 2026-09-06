<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppBar from "../components/AppBar.vue";
import { ApiError, api, type MediaRecord } from "../lib/api";
import { confirm } from "../lib/confirm";
import { relativeTime } from "../lib/relativeTime";

// A project's files: the songs its sequences are set to and the pictures its effects use.
//
// Until this page, a soundtrack was a path hidden on whichever sequence uploaded it: nothing
// listed it, nothing could rename it, and nothing could remove it. Here each file says what it
// is, how big it is and which sequences are set to it, and a file a sequence still needs
// refuses to be deleted rather than silently taking the soundtrack with it.

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const files = ref<MediaRecord[]>([]);
const loaded = ref(false);
const uploading = ref(0);
const message = ref("");
const renaming = ref<{ id: number; name: string } | null>(null);

const ACCEPT = "audio/*,image/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm,.mp4,.png,.jpg,.jpeg,.gif,.webp,.bmp";

async function load(): Promise<void> {
  files.value = await api.listMedia(projectId.value);
  loaded.value = true;
}

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: MediaRecord["kind"]): string {
  return kind === "audio" ? "Audio" : "Picture";
}

// The server's validation and conflict replies carry their reason in a JSON `message`; the
// raw body is what ApiError keeps, so it is unwrapped here rather than shown as JSON.
function reasonFrom(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      /* not JSON */
    }
    return err.message || `Request failed (${err.status})`;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

async function onPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = "";
  if (!picked.length) return;
  message.value = "";
  uploading.value = picked.length;
  const failed: string[] = [];
  for (const file of picked) {
    try {
      const record = await api.uploadMedia(projectId.value, file);
      files.value = [record, ...files.value];
    } catch (err) {
      failed.push(`${file.name}: ${reasonFrom(err)}`);
    } finally {
      uploading.value -= 1;
    }
  }
  if (failed.length) message.value = failed.join(" · ");
}

// A function ref, not a template ref: inside a v-for a template ref collects into an array.
let renameInput: HTMLInputElement | null = null;
function setRenameInput(el: unknown): void {
  renameInput = el instanceof HTMLInputElement ? el : null;
}
async function startRename(f: MediaRecord): Promise<void> {
  renaming.value = { id: f.id, name: f.name };
  await nextTick();
  renameInput?.select();
}

async function commitRename(): Promise<void> {
  const edit = renaming.value;
  if (!edit) return;
  renaming.value = null;
  const name = edit.name.trim();
  const current = files.value.find((f) => f.id === edit.id);
  if (!name || !current || name === current.name) return;
  try {
    const updated = await api.renameMedia(edit.id, name);
    files.value = files.value.map((f) => (f.id === updated.id ? updated : f));
  } catch (err) {
    message.value = reasonFrom(err);
  }
}

async function remove(f: MediaRecord): Promise<void> {
  if (f.used_by.length) {
    // Said up front, not after a confirm: the server would refuse anyway, and a dialog that
    // asks "are you sure?" about something that then doesn't happen is worse than a sentence.
    message.value = `${f.name} is the soundtrack of ${f.used_by.map((s) => s.name).join(", ")}. Change or delete those sequences first.`;
    return;
  }
  const ok = await confirm({
    title: `Delete ${f.name}?`,
    message: `${f.filename} will be removed from this project. This can't be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteMedia(f.id);
    files.value = files.value.filter((x) => x.id !== f.id);
    message.value = "";
  } catch (err) {
    message.value = reasonFrom(err);
  }
}

onMounted(load);
</script>

<template>
  <main class="files-page">
    <AppBar :project-id="projectId" active="files" />
    <header class="page-toolbar">
      <h1>Files</h1>
      <label class="btn primary">
        {{ uploading ? `Uploading ${uploading}…` : "Upload" }}
        <input type="file" :accept="ACCEPT" multiple @change="onPicked" :disabled="uploading > 0" hidden />
      </label>
      <span v-if="message" class="status">{{ message }}</span>
    </header>

    <div class="content">
      <table v-if="files.length" class="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Size</th>
            <th>Used by</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in files" :key="f.id">
            <td class="name">
              <input
                v-if="renaming?.id === f.id"
                v-model="renaming.name"
                type="text"
                class="rename"
                aria-label="File name"
                @keydown.enter.prevent="commitRename"
                @keydown.escape.prevent="renaming = null"
                @blur="commitRename"
                :ref="setRenameInput"
              />
              <template v-else>
                <span>{{ f.name }}</span>
                <small v-if="f.filename !== f.name" class="filename">{{ f.filename }}</small>
              </template>
            </td>
            <td class="muted">{{ kindLabel(f.kind) }}</td>
            <td class="num muted">{{ sizeOf(f.size_bytes) }}</td>
            <td class="muted used">
              <template v-if="f.used_by.length">
                <router-link v-for="s in f.used_by" :key="s.id" :to="{ name: 'sequencer', params: { projectId, sequenceId: s.id } }">{{ s.name }}</router-link>
              </template>
              <span v-else class="dim">Not used</span>
            </td>
            <td class="muted">{{ relativeTime(f.created_at) }}</td>
            <td class="actions">
              <a :href="api.mediaFileUrl(f.id)" target="_blank" rel="noopener" class="btn" title="Open the file in a new tab">Open</a>
              <button @click="startRename(f)">Rename</button>
              <button class="danger" :disabled="f.used_by.length > 0" :title="f.used_by.length ? 'A sequence is set to this file' : ''" @click="remove(f)">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <section v-else-if="loaded" class="empty">
        <h2>No files yet</h2>
        <p>
          Files are the songs your sequences are set to and the pictures your effects use. Upload them here, or start a
          sequence from an audio file and it lands here on its own.
        </p>
        <div class="empty-actions">
          <label class="btn primary">
            Upload
            <input type="file" :accept="ACCEPT" multiple @change="onPicked" hidden />
          </label>
          <router-link :to="`/projects/${projectId}/sequences`" class="btn">Sequences</router-link>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.files-page {
  font-family: var(--sans);
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  text-align: left;
}
.status {
  color: var(--text-muted);
}
.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 3rem;
}
.list {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.list th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.list td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.list tbody tr:hover td {
  background: var(--bg-panel);
}
.name {
  font-weight: 600;
  max-width: 28rem;
}
.name .filename {
  display: block;
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rename {
  width: 100%;
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.muted {
  color: var(--text-muted);
}
.dim {
  color: var(--text-dim);
}
.used {
  max-width: 20rem;
}
.used a {
  color: var(--info);
  text-decoration: none;
  margin-right: 0.6rem;
}
.used a:hover {
  text-decoration: underline;
}
.actions {
  text-align: right;
  width: 1%;
  white-space: nowrap;
}
.actions > * + * {
  margin-left: 0.3rem;
}
.empty {
  max-width: 52ch;
  margin: 3rem auto;
  padding: 1.5rem 1.75rem;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
}
.empty h2 {
  margin: 0 0 0.4rem;
  font-size: 1.1rem;
  font-weight: 600;
}
.empty p {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.empty-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
.files-page button,
.files-page .btn,
.files-page input[type="text"] {
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
.files-page button,
.files-page .btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  text-decoration: none;
}
.files-page button:hover:not(:disabled),
.files-page .btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.files-page .primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.files-page .primary:hover {
  color: var(--accent-ink);
  filter: brightness(1.05);
}
.files-page button.danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.files-page button:disabled {
  color: var(--text-dim);
  cursor: default;
}
</style>
