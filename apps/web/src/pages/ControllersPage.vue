<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, type ControllerProtocol, type ControllerRecord, type ControllerUpsertPayload, type ModelRecord } from "../lib/api";

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const controllers = ref<ControllerRecord[]>([]);
const models = ref<ModelRecord[]>([]); // to derive each controller's assigned-models list
const selectedId = ref<number | null>(null);
const error = ref("");

const selected = computed(() => controllers.value.find((c) => c.id === selectedId.value) ?? null);
const assignedModels = computed(() => (selected.value ? models.value.filter((m) => m.controller_id === selected.value!.id) : []));

async function load(): Promise<void> {
  controllers.value = await api.listControllers(projectId.value);
  const layouts = await api.listLayouts(projectId.value);
  const layout = layouts[0];
  if (layout) models.value = await api.listModels(layout.id);
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
    <header>
      <router-link :to="`/projects/${projectId}/layout`">&larr; Layout</router-link>
      <h1>Controllers</h1>
      <div class="add-buttons">
        <button @click="addController('usb', 'USB')">Add USB</button>
        <button @click="addController('ethernet', 'Ethernet')">Add Ethernet</button>
        <button @click="addController('null', 'Null')">Add Null</button>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="body">
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
            <td>{{ c.start_channel }}–{{ c.start_channel + c.channel_count - 1 }}</td>
            <td>{{ c.vendor ?? "—" }}</td>
            <td>{{ c.model ?? "—" }}</td>
          </tr>
          <tr v-if="controllers.length === 0">
            <td colspan="6" class="empty">No controllers yet — add one above.</td>
          </tr>
        </tbody>
      </table>

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
          <p v-else class="empty">None yet — assign from the Layout page's model list.</p>
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
.controllers-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #ddd;
}
header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
.add-buttons {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
}
.error {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: #e57373;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.controller-table {
  flex: 1;
  overflow-y: auto;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.controller-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #333;
  color: #888;
  font-weight: normal;
}
.controller-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid #222;
}
.controller-table tbody tr {
  cursor: pointer;
}
.controller-table tbody tr:hover {
  background: #1a1a20;
}
.controller-table tbody tr.selected {
  background: #26262f;
}
.controller-table tbody tr.inactive {
  opacity: 0.5;
}
.controller-table .empty {
  color: #666;
  cursor: default;
}
.props-panel {
  width: 260px;
  border-left: 1px solid #333;
  padding: 0.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.props-panel label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #aaa;
}
.active-toggle {
  flex-direction: row !important;
  align-items: center;
  gap: 0.4rem !important;
}
.empty-panel {
  color: #666;
  font-size: 0.85rem;
}
.assigned-models h3 {
  margin: 0.4rem 0 0.3rem;
  font-size: 0.8rem;
  color: #888;
  font-weight: normal;
}
.assigned-models ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
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
  color: #e57373;
  border-color: #5a2f2f;
}
</style>
