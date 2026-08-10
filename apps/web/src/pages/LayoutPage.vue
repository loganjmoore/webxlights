<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, type Layout, type ModelRecord } from "../lib/api";
import { importRgbEffects } from "../lib/import";
import LayoutCanvas from "../components/LayoutCanvas.vue";

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const layout = ref<Layout | null>(null);
const models = ref<ModelRecord[]>([]);
const importing = ref(false);
const importMessage = ref("");

async function loadLayout(): Promise<void> {
  const layouts = await api.listLayouts(projectId.value);
  layout.value = layouts[0] ?? null;
  if (layout.value) models.value = await api.listModels(layout.value.id);
}

async function handleFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!layout.value) {
    importMessage.value = "Layout isn't loaded yet — try again in a moment.";
    return;
  }

  importing.value = true;
  importMessage.value = "";
  try {
    const text = await file.text();
    const summary = await importRgbEffects(layout.value.id, text);
    models.value = await api.listModels(layout.value.id);
    importMessage.value = `Imported ${summary.imported} models` +
      (summary.groups ? `, ${summary.groups} groups` : "") +
      (summary.unsupported.length ? ` — unsupported types kept but not rendered: ${summary.unsupported.join(", ")}` : "");
  } catch (err) {
    importMessage.value = err instanceof Error ? `Import failed: ${err.message}` : "Import failed";
  } finally {
    importing.value = false;
    input.value = "";
  }
}

onMounted(loadLayout);
</script>

<template>
  <main class="layout-page">
    <header>
      <router-link to="/projects">&larr; Projects</router-link>
      <h1>Layout</h1>
      <router-link :to="`/projects/${projectId}/sequences`" class="sequences-link">Sequences &rarr;</router-link>
      <label class="import-btn">
        {{ importing ? "Importing..." : "Import xlights_rgbeffects.xml" }}
        <input type="file" accept=".xml" @change="handleFileChange" :disabled="importing" hidden />
      </label>
    </header>
    <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
    <div class="body">
      <aside class="model-list">
        <h2>Models ({{ models.length }})</h2>
        <ul>
          <li v-for="m in models" :key="m.id" :class="{ unsupported: !m.supported }">
            {{ m.name }} <span class="type">{{ m.type }}</span>
            <span v-if="m.start_channel" class="channel">ch {{ m.start_channel }}</span>
          </li>
        </ul>
        <p v-if="models.length === 0" class="empty">No models yet — import a show to get started.</p>
      </aside>
      <div class="canvas-wrap">
        <LayoutCanvas :models="models" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.layout-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
.sequences-link {
  margin-left: auto;
}
.import-btn {
  cursor: pointer;
  padding: 0.4rem 0.8rem;
  border: 1px solid #555;
  border-radius: 4px;
  font-size: 0.85rem;
}
.import-message {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: #aaa;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.model-list {
  width: 220px;
  overflow-y: auto;
  padding: 0.75rem;
  border-right: 1px solid #333;
}
.model-list h2 {
  font-size: 0.9rem;
  font-weight: normal;
  color: #888;
}
.model-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
}
.model-list li {
  padding: 0.25rem 0;
}
.model-list li.unsupported {
  opacity: 0.5;
}
.model-list .type {
  color: #888;
  font-size: 0.75rem;
}
.model-list .channel {
  display: block;
  color: #666;
  font-size: 0.7rem;
}
.model-list .empty {
  color: #666;
  font-size: 0.8rem;
}
.canvas-wrap {
  flex: 1;
  min-width: 0;
}
</style>
