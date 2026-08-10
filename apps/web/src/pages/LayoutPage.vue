<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, type ControllerRecord, type Layout, type ModelRecord } from "../lib/api";
import { importRgbEffects } from "../lib/import";
import { channelCountForModel } from "../lib/fseqExport";
import LayoutCanvas from "../components/LayoutCanvas.vue";

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const layout = ref<Layout | null>(null);
const models = ref<ModelRecord[]>([]);
const controllers = ref<ControllerRecord[]>([]);
const assignErrors = ref<Record<number, string>>({});
const importing = ref(false);
const importMessage = ref("");

async function loadLayout(): Promise<void> {
  const [layouts, controllerList] = await Promise.all([api.listLayouts(projectId.value), api.listControllers(projectId.value)]);
  layout.value = layouts[0] ?? null;
  controllers.value = controllerList;
  if (layout.value) models.value = await api.listModels(layout.value.id);
}

// M11: controller_id/controller_offset live on the model, but ModelEntityController::update
// deep-merges only top-level fields (unlike screen, which it replaces wholesale) - a plain
// patch of just these three keys is correct here, no need to resend the whole model.
async function assignController(model: ModelRecord, controllerIdRaw: string): Promise<void> {
  if (!layout.value) return;
  delete assignErrors.value[model.id];
  const controllerId = controllerIdRaw === "" ? null : Number(controllerIdRaw);
  try {
    const updated = await api.updateModel(layout.value.id, model.id, {
      controller_id: controllerId,
      controller_offset: controllerId === null ? null : (model.controller_offset ?? 0),
      ...(controllerId !== null ? { channel_count: channelCountForModel(model) } : {}),
    });
    const idx = models.value.findIndex((m) => m.id === model.id);
    if (idx !== -1) models.value[idx] = updated;
  } catch (err) {
    assignErrors.value[model.id] = err instanceof Error ? err.message : "Assignment failed";
  }
}

async function updateOffset(model: ModelRecord, offsetRaw: string): Promise<void> {
  if (!layout.value || model.controller_id == null) return;
  delete assignErrors.value[model.id];
  try {
    const updated = await api.updateModel(layout.value.id, model.id, {
      controller_id: model.controller_id,
      controller_offset: Number(offsetRaw) || 0,
      channel_count: channelCountForModel(model),
    });
    const idx = models.value.findIndex((m) => m.id === model.id);
    if (idx !== -1) models.value[idx] = updated;
  } catch (err) {
    assignErrors.value[model.id] = err instanceof Error ? err.message : "Assignment failed";
  }
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
      <router-link :to="`/projects/${projectId}/controllers`" class="controllers-link">Controllers &rarr;</router-link>
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
            <div class="controller-assign">
              <select :value="m.controller_id ?? ''" @change="assignController(m, ($event.target as HTMLSelectElement).value)">
                <option value="">No controller</option>
                <option v-for="c in controllers" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <input
                v-if="m.controller_id != null"
                type="number"
                min="0"
                class="offset-input"
                :value="m.controller_offset ?? 0"
                title="Channel offset within the controller's span"
                @change="updateOffset(m, ($event.target as HTMLInputElement).value)"
              />
            </div>
            <p v-if="assignErrors[m.id]" class="assign-error">{{ assignErrors[m.id] }}</p>
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
.controllers-link {
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
.controller-assign {
  display: flex;
  gap: 0.3rem;
  margin: 0.2rem 0 0.4rem;
}
.controller-assign select {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
}
.offset-input {
  width: 3.5rem;
  font-size: 0.75rem;
}
.assign-error {
  margin: 0 0 0.4rem;
  color: #e57373;
  font-size: 0.7rem;
}
.canvas-wrap {
  flex: 1;
  min-width: 0;
}
</style>
