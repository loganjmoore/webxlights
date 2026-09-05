<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import MenuButton from "../components/MenuButton.vue";
import { useRoute } from "vue-router";
import { api, type ControllerProtocol, type ControllerRecord, type ControllerUpsertPayload, type ModelRecord } from "../lib/api";
import ControllerVisualiser from "../components/ControllerVisualiser.vue";
import { applyChainPatches, type ChainPatch } from "../lib/controllerChain";
import { channelCountForModel } from "../lib/fseqExport";

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const controllers = ref<ControllerRecord[]>([]);
const models = ref<ModelRecord[]>([]); // to derive each controller's assigned-models list
const layoutId = ref<number | null>(null);
const chaining = ref(false);

/**
 * A drop in the visualiser: the chain arithmetic said which models move; this writes them.
 *
 * The page shows the result before the writes land, then reconciles with what the server
 * returned - a chain of six models is six small PATCHes, and waiting on all of them before
 * moving anything on screen would make the drop feel like it missed.
 */
async function applyPatches(patches: ChainPatch[]): Promise<void> {
  if (patches.length === 0 || layoutId.value === null) return;
  const before = models.value;
  models.value = applyChainPatches(models.value, patches);
  chaining.value = true;
  error.value = "";
  try {
    for (const p of patches) {
      const updated = await api.updateModel(layoutId.value, p.modelId, {
        controller_id: p.controller_id,
        controller_offset: p.controller_offset,
        channel_count: p.channel_count ?? undefined,
      });
      models.value = models.value.map((m) => (m.id === updated.id ? updated : m));
    }
  } catch (err) {
    models.value = before;
    error.value = err instanceof Error ? `Couldn't move that model: ${err.message}` : "Couldn't move that model";
  } finally {
    chaining.value = false;
  }
}
const selectedId = ref<number | null>(null);
const error = ref("");

const selected = computed(() => controllers.value.find((c) => c.id === selectedId.value) ?? null);
const assignedModels = computed(() => (selected.value ? models.value.filter((m) => m.controller_id === selected.value!.id) : []));

async function load(): Promise<void> {
  controllers.value = await api.listControllers(projectId.value);
  const layouts = await api.listLayouts(projectId.value);
  const layout = layouts[0];
  if (layout) {
    layoutId.value = layout.id;
    models.value = await api.listModels(layout.id);
  }
}

// "Add Ethernet" defaults to DDP, not E1.31 - the reference screenshot's own new-controller
// flow defaults to Protocol=E131, which this MVP doesn't implement (DDP-first, see
// DECISIONS.md M11). There's no separate "Add DDP" button; DDP is Ethernet with its protocol
// set, matching how the reference screenshot itself represents its DDP controllers.
async function addController(protocol: ControllerProtocol, label: string): Promise<void> {
  error.value = "";
  try {
    const name = `${label} Controller ${controllers.value.length + 1}`;
    const created = await api.createController(projectId.value, {
      name,
      protocol: protocol === "ethernet" ? "ddp" : protocol,
      start_channel: 1,
      channel_count: 0,
      active: true,
    });
    controllers.value.push(created);
    selectedId.value = created.id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Couldn't create controller";
  }
}

async function saveField(patch: Partial<ControllerUpsertPayload>): Promise<void> {
  if (!selected.value) return;
  error.value = "";
  try {
    const updated = await api.updateController(selected.value.id, patch);
    const idx = controllers.value.findIndex((c) => c.id === updated.id);
    if (idx !== -1) controllers.value[idx] = updated;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Update failed";
  }
}

async function removeSelected(): Promise<void> {
  if (!selected.value) return;
  await api.deleteController(selected.value.id);
  controllers.value = controllers.value.filter((c) => c.id !== selected.value!.id);
  selectedId.value = null;
}

onMounted(load);
</script>

<template>
  <main class="controllers-page">
    <AppBar :project-id="projectId" active="controllers" />
    <header class="page-toolbar">
      <h1>Controllers</h1>
      <MenuButton
        label="Add controller"
        :items="[
          { label: 'Ethernet (DDP / E1.31)', run: () => addController('ethernet', 'Ethernet') },
          { label: 'USB (serial)', run: () => addController('usb', 'USB') },
          { label: 'Null (channels with no output)', run: () => addController('null', 'Null') },
        ]"
      />
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="body">
      <div class="left">
      <table class="controller-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Protocol</th>
            <th>Address</th>
            <th>Channels</th>
            <th>Vendor</th>
            <th>Model</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in controllers"
            :key="c.id"
            :class="{ selected: c.id === selectedId, inactive: !c.active }"
            @click="selectedId = c.id"
          >
            <td>{{ c.name }}</td>
            <td>{{ c.protocol }}</td>
            <td>{{ c.ip_address ?? "—" }}</td>
            <td>{{ c.channel_count > 0 ? `${c.start_channel}–${c.start_channel + c.channel_count - 1}` : "—" }}</td>
            <td>{{ c.vendor ?? "—" }}</td>
            <td>{{ c.model ?? "—" }}</td>
          </tr>
          <tr v-if="controllers.length === 0">
            <td colspan="6" class="empty">No controllers yet. Add one from the menu above.</td>
          </tr>
        </tbody>
      </table>
      <ControllerVisualiser
        :controllers="controllers"
        :models="models"
        :channel-count-for="channelCountForModel"
        :saving="chaining"
        @patches="applyPatches"
      />
      </div>

      <aside v-if="selected" class="props-panel">
        <label>
          Name
          <input type="text" :value="selected.name" @change="saveField({ name: ($event.target as HTMLInputElement).value })" />
        </label>
        <label>
          Protocol
          <select :value="selected.protocol" @change="saveField({ protocol: ($event.target as HTMLSelectElement).value as ControllerProtocol })">
            <option value="ddp">DDP</option>
            <option value="ethernet">Ethernet (E1.31, unimplemented)</option>
            <option value="usb">USB</option>
            <option value="null">Null</option>
          </select>
        </label>
        <label>
          IP Address
          <input
            type="text"
            :value="selected.ip_address ?? ''"
            placeholder="192.168.1.50"
            @change="saveField({ ip_address: ($event.target as HTMLInputElement).value || null })"
          />
        </label>
        <label>
          Start channel
          <input
            type="number"
            min="1"
            :value="selected.start_channel"
            @change="saveField({ start_channel: Number(($event.target as HTMLInputElement).value) || 1 })"
          />
        </label>
        <label>
          Channel count
          <input
            type="number"
            min="0"
            :value="selected.channel_count"
            @change="saveField({ channel_count: Number(($event.target as HTMLInputElement).value) || 0 })"
          />
        </label>
        <label>
          Vendor
          <input type="text" :value="selected.vendor ?? ''" @change="saveField({ vendor: ($event.target as HTMLInputElement).value || null })" />
        </label>
        <label>
          Model
          <input type="text" :value="selected.model ?? ''" @change="saveField({ model: ($event.target as HTMLInputElement).value || null })" />
        </label>
        <label class="active-toggle">
          <input type="checkbox" :checked="selected.active" @change="saveField({ active: ($event.target as HTMLInputElement).checked })" />
          Active
        </label>

        <div class="assigned-models">
          <h3>Assigned models</h3>
          <ul v-if="assignedModels.length">
            <li v-for="m in assignedModels" :key="m.id">{{ m.name }} <span class="offset">offset {{ m.controller_offset }}</span></li>
          </ul>
          <p v-else class="empty">None yet — drag models onto this controller in the visualiser.</p>
        </div>

        <button class="delete-btn" @click="removeSelected">Delete</button>
      </aside>
      <aside v-else class="props-panel empty-panel">
        <p>Select a controller to edit its properties.</p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
/* M15: this page inherited the app shell's white-background/56px-<h1> default the same way
   LayoutPage.vue did before M13 - fixed the same way, scoped to this page's own chrome. Also
   a spacing/sizing pass: consistent 4px-based rhythm (0.25rem steps), clearer grouping in the
   props panel, and generous enough row/cell padding to read as a real data table, not a cramped
   default one. */
.controllers-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0d0d11;
  color: #ddd;
}
.controllers-page a {
  color: #e8c468;
}
.error {
  margin: 0;
  padding: 0.6rem 1.25rem;
  font-size: 0.85rem;
  color: #e57373;
  background: #241414;
  border-bottom: 1px solid #3a1f1f;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.left {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.controller-table {
  width: 100%;
  flex: none;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.controller-table th {
  text-align: left;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #333;
  color: #888;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.controller-table td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #222;
}
.controller-table tbody tr {
  cursor: pointer;
}
.controller-table tbody tr:hover {
  background: #1a1a20;
}
.controller-table tbody tr.selected {
  background: #2c2712;
  outline: 1px solid #e8c468;
  outline-offset: -1px;
}
.controller-table tbody tr.inactive {
  opacity: 0.5;
}
.controller-table .empty {
  padding: 1.5rem 1rem;
  color: #666;
  cursor: default;
  text-align: center;
}
.props-panel {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-panel);
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 0.85rem;
}
.props-panel label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.props-panel label > input,
.props-panel label > select {
  width: 100%;
  box-sizing: border-box;
}
.props-panel input,
.props-panel select {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
}
.active-toggle {
  flex-direction: row !important;
  align-items: center;
  gap: 0.5rem !important;
}
.empty-panel {
  color: #666;
  font-size: 0.85rem;
}
.assigned-models {
  padding-top: 0.85rem;
  border-top: 1px solid #2a2a33;
}
.assigned-models h3 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.assigned-models ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.assigned-models .offset {
  color: #666;
  font-size: 0.7rem;
}
.assigned-models .empty {
  color: #666;
  font-size: 0.75rem;
}
.delete-btn {
  margin-top: auto;
  padding: 0.45rem 0.75rem;
  color: #e57373;
  background: #1e1e26;
  border: 1px solid #5a2f2f;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #2c1a1a;
}
</style>
