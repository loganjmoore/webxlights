<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, type ControllerRecord, type Layout, type ModelRecord } from "../lib/api";
import { importRgbEffects } from "../lib/import";
import { channelCountForModel } from "../lib/fseqExport";
import LayoutCanvas from "../components/LayoutCanvas.vue";
import LayoutCanvas3D from "../components/LayoutCanvas3D.vue";
import ModelPalette from "../components/ModelPalette.vue";

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const layout = ref<Layout | null>(null);
const models = ref<ModelRecord[]>([]);
const controllers = ref<ControllerRecord[]>([]);
const assignErrors = ref<Record<number, string>>({});
const importing = ref(false);
const importMessage = ref("");
const selectedModelId = ref<number | null>(null);
const viewMode = ref<"2d" | "3d">("2d");
const selectedModel = computed(() => models.value.find((m) => m.id === selectedModelId.value) ?? null);
const renamingModelId = ref<number | null>(null);
const renameValue = ref("");

// First real caller of api.updateModel() (previously unused anywhere in the app) - the
// persist path M12 exists to prove. ModelEntityController::update replaces `screen` wholesale,
// it does not deep-merge, so this must always spread the model's existing screen values and
// override only the changed keys, or a drag silently wipes scale/rotate/z. See DECISIONS.md.
async function updateScreen(modelId: number, patch: Partial<{ x: number; y: number; z: number; scale: number; scaleY: number; rotate: number }>): Promise<void> {
  if (!layout.value) return;
  const model = models.value.find((m) => m.id === modelId);
  if (!model) return;
  const updated = await api.updateModel(layout.value.id, modelId, { screen: { ...model.screen, ...patch } });
  const idx = models.value.findIndex((m) => m.id === modelId);
  if (idx !== -1) models.value[idx] = updated;
}

function handleMove(modelId: number, x: number, y: number): void {
  void updateScreen(modelId, { x, y });
}
function handleMove3D(modelId: number, x: number, y: number, z: number): void {
  void updateScreen(modelId, { x, y, z });
}
function handlePositionField(field: "x" | "y" | "z" | "scale" | "scaleY" | "rotate", raw: string): void {
  if (!selectedModel.value) return;
  const value = Number(raw);
  if (Number.isNaN(value)) return;
  void updateScreen(selectedModel.value.id, { [field]: value });
}

// M13: name auto-numbered per type ("Tree-1", "Tree-2", ...), matching the convention xLights'
// own reference screenshots show (NEXT-MILESTONES.md's "RRBL" through "RRBL-8" example).
function nextNameForType(type: string): string {
  const prefix = `${type}-`;
  let max = 0;
  for (const m of models.value) {
    if (!m.name.startsWith(prefix)) continue;
    const n = Number(m.name.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

// Dropped from ModelPalette.vue via LayoutCanvas's dragover/drop handlers. raw_attrs stays {}
// deliberately - computeGeometryFromAttrs (packages/engine) already has a sensible fallback
// default for every draggable type, so an empty bag renders exactly like a real xLights
// "place with defaults" model would, ready to resize via the position panel below.
async function handleCreate(type: string, x: number, y: number): Promise<void> {
  if (!layout.value) return;
  const name = nextNameForType(type);
  const [created] = await api.bulkUpsertModels(layout.value.id, [
    {
      name,
      type,
      supported: true,
      params: {},
      raw_attrs: {},
      screen: { x, y, z: 0, scale: 1, rotate: 0 },
      order: models.value.length,
    },
  ]);
  if (!created) return;
  models.value = [...models.value, created];
  selectedModelId.value = created.id;
}

// The necessary complement to create (see GOAL-M13.md) - a mis-dropped or duplicate model has
// no other recovery path since there's no structural-param editor yet.
async function handleDelete(modelId: number): Promise<void> {
  if (!layout.value) return;
  if (!window.confirm("Delete this model? This can't be undone.")) return;
  await api.deleteModel(layout.value.id, modelId);
  models.value = models.value.filter((m) => m.id !== modelId);
  if (selectedModelId.value === modelId) selectedModelId.value = null;
}

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedModelId.value != null) {
    e.preventDefault();
    void handleDelete(selectedModelId.value);
  }
}

// Auto-generated names ("Tree-2") are otherwise indistinguishable in the model list once more
// than one of a type exists - double-click to rename, reusing the update endpoint verbatim.
function startRename(model: ModelRecord): void {
  renamingModelId.value = model.id;
  renameValue.value = model.name;
}
async function commitRename(model: ModelRecord): Promise<void> {
  const name = renameValue.value.trim();
  renamingModelId.value = null;
  if (!layout.value || !name || name === model.name) return;
  const updated = await api.updateModel(layout.value.id, model.id, { name });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
}
function cancelRename(): void {
  renamingModelId.value = null;
}

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

onMounted(() => {
  void loadLayout();
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <main class="layout-page">
    <header>
      <router-link to="/projects">&larr; Projects</router-link>
      <h1>Layout</h1>
      <div class="view-toggle">
        <button :class="{ active: viewMode === '2d' }" @click="viewMode = '2d'">2D</button>
        <button :class="{ active: viewMode === '3d' }" @click="viewMode = '3d'">3D</button>
      </div>
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
          <li
            v-for="m in models"
            :key="m.id"
            :class="{ unsupported: !m.supported, selected: m.id === selectedModelId }"
            @click="selectedModelId = m.id"
          >
            <input
              v-if="renamingModelId === m.id"
              v-model="renameValue"
              class="rename-input"
              autofocus
              @click.stop
              @keydown.enter="commitRename(m)"
              @keydown.escape="cancelRename"
              @blur="commitRename(m)"
            />
            <span v-else @dblclick.stop="startRename(m)">{{ m.name }}</span>
            <span class="type">{{ m.type }}</span>
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

        <div v-if="selectedModel" class="position-panel">
          <h2>Position</h2>
          <label>
            X
            <input type="number" :value="selectedModel.screen.x ?? 0" @change="handlePositionField('x', ($event.target as HTMLInputElement).value)" />
          </label>
          <label>
            Y
            <input type="number" :value="selectedModel.screen.y ?? 0" @change="handlePositionField('y', ($event.target as HTMLInputElement).value)" />
          </label>
          <label>
            Z
            <input type="number" :value="selectedModel.screen.z ?? 0" @change="handlePositionField('z', ($event.target as HTMLInputElement).value)" />
          </label>
          <label>
            Scale X
            <input
              type="number"
              step="0.1"
              min="0.1"
              :value="selectedModel.screen.scale ?? 1"
              @change="handlePositionField('scale', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label>
            Scale Y
            <input
              type="number"
              step="0.1"
              min="0.1"
              :value="selectedModel.screen.scaleY ?? selectedModel.screen.scale ?? 1"
              title="Defaults to Scale X (uniform) until set independently"
              @change="handlePositionField('scaleY', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label>
            Rotate
            <input type="number" :value="selectedModel.screen.rotate ?? 0" @change="handlePositionField('rotate', ($event.target as HTMLInputElement).value)" />
          </label>
          <button class="delete-btn" @click="handleDelete(selectedModel.id)">Delete model</button>
        </div>
      </aside>
      <div class="canvas-wrap">
        <ModelPalette v-if="viewMode === '2d'" />
        <div class="canvas-area">
          <LayoutCanvas
            v-if="viewMode === '2d'"
            :models="models"
            :selected-model-id="selectedModelId"
            @select="selectedModelId = $event"
            @move="handleMove"
            @create="handleCreate"
          />
          <LayoutCanvas3D
            v-else
            :models="models"
            :selected-model-id="selectedModelId"
            @select="selectedModelId = $event"
            @move="handleMove3D"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* M13: xLights' own Layout tab is a dark editor UI throughout the window, not just the
   preview canvas - this page inherited the app shell's default black-on-white (see
   GOAL-M13.md's "Correction found during execution"). Scoped to this page's own chrome only. */
.layout-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0d0d11;
  color: #ddd;
}
.layout-page a {
  color: #e8c468;
}
header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: baseline;
  gap: 1rem;
  background: #16161c;
}
header h1 {
  color: #ddd;
  font-size: 1.1rem;
  margin: 0;
}
.view-toggle {
  display: flex;
  gap: 0.25rem;
}
.view-toggle button {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.view-toggle button.active {
  background: #e8c468;
  color: #111;
  border-color: #e8c468;
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
  color: #ddd;
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
  background: #16161c;
  color: #ddd;
}
.rename-input {
  width: 100%;
  font-size: 0.85rem;
  background: #0d0d11;
  color: #ddd;
  border: 1px solid #e8c468;
  border-radius: 2px;
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
  padding: 0.25rem 0.3rem;
  cursor: pointer;
  border-radius: 3px;
}
.model-list li:hover {
  background: #1a1a20;
}
.model-list li.selected {
  background: #2c2712;
  outline: 1px solid #e8c468;
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
.position-panel {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #333;
}
.position-panel h2 {
  font-size: 0.9rem;
  font-weight: normal;
  color: #888;
  margin: 0 0 0.5rem;
}
.position-panel label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.4rem;
}
.position-panel input {
  width: 5rem;
  font-size: 0.8rem;
}
.delete-btn {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.35rem;
  font-size: 0.75rem;
  color: #e57373;
  background: #1e1e26;
  border: 1px solid #5c3333;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #2c1a1a;
}
.canvas-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.canvas-area {
  flex: 1;
  min-height: 0;
}
</style>
