<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  appliedPlacementFor,
  computeGeometryFromAttrs,
  GROUP_RENDER_STYLES,
  propertyFieldsFor,
  transformedHalfExtents,
  propertyValueFor,
  screenFromAttrs,
  type BoxedScaleReading,
  type ModelGeometry,
  type SubModelSpec,
} from "@webxlights/engine";
import SubModelEditor from "../components/SubModelEditor.vue";
import { api, type ControllerRecord, type Layout, type ModelGroupRecord, type ModelRecord, type ViewObjectRecord } from "../lib/api";
import { importRgbEffects } from "../lib/import";
import { confirm } from "../lib/confirm";
import { buildPlacementReport, copyOrDownloadReport } from "../lib/placementReport";
import { channelCountForModel } from "../lib/fseqExport";
import LayoutCanvas from "../components/LayoutCanvas.vue";
import LayoutCanvas3D from "../components/LayoutCanvas3D.vue";
import ModelPalette from "../components/ModelPalette.vue";

// The canvases' local-unit-to-world factor, same value LayoutCanvas and the importer use.
const NODE_SPACING = 4;

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));

const layout = ref<Layout | null>(null);
const models = ref<ModelRecord[]>([]);
const viewObjects = ref<ViewObjectRecord[]>([]); // M15.7: Gridlines/Mesh/... - view-only for now
const viewObjectsError = ref(""); // non-fatal: the layout still loads without its helper objects
const controllers = ref<ControllerRecord[]>([]);
const assignErrors = ref<Record<number, string>>({});
const importing = ref(false);
const importMessage = ref("");
const reportMessage = ref("");

// How a boxed model's ScaleX is read. The importer decides this per file from the models it can
// already measure (engine/models/boxedScale.ts), but the two readings differ by a model's node
// count, so when a show has nothing to check against, the wrong call is dramatic and obvious -
// one prop swallowing the yard. This is the one-click way out: flip it, look, keep whichever is
// right. Nothing is lost either way, because raw_attrs is what gets re-read.
const BOXED_SCALE_LABEL: Record<BoxedScaleReading, string> = {
  perNode: "ScaleX × node count",
  worldSize: "ScaleX as world size",
};
const boxedScale = ref<BoxedScaleReading>("perNode");
const rescaling = ref(false);

async function setBoxedScale(reading: BoxedScaleReading): Promise<void> {
  if (!layout.value || reading === boxedScale.value) return;
  boxedScale.value = reading;
  rescaling.value = true;
  try {
    const boxedModels = models.value.filter((m) => m.supported && appliedPlacementFor(m.type, m.raw_attrs) === "boxed");
    await Promise.all(
      boxedModels.map(async (model) => {
        let geo: ModelGeometry | null;
        try {
          geo = computeGeometryFromAttrs(model.type, model.raw_attrs);
        } catch {
          geo = null;
        }
        const screen = screenFromAttrs(model.type, model.raw_attrs, geo, NODE_SPACING, reading);
        // Position and rotation don't depend on the reading; only rewrite what does, so a model
        // that has since been dragged or resized by hand keeps where it was put.
        const updated = await api.updateModel(layout.value!.id, model.id, {
          screen: { ...model.screen, scale: screen.scale, scaleY: screen.scaleY, scaleZ: screen.scaleZ },
        });
        const idx = models.value.findIndex((m) => m.id === model.id);
        if (idx !== -1) models.value[idx] = updated;
      }),
    );
    importMessage.value = `Boxed model sizes re-read as ${BOXED_SCALE_LABEL[reading]} (${boxedModels.length} models).`;
  } finally {
    rescaling.value = false;
  }
}

// Placement can't be verified from inside the app - the maths is unit-tested and the placement
// systems are confirmed against the xLights manual, but whether a real show lands where it does
// in xLights can only be checked against that show. raw_attrs is lossless, so this hands over
// everything needed to check it (what xLights wrote, and what the importer derived) without
// anyone having to go and find the original xlights_rgbeffects.xml.
async function copyPlacementReport(): Promise<void> {
  if (models.value.length === 0) {
    reportMessage.value = "Nothing to report yet — import a show first.";
    return;
  }
  const where = await copyOrDownloadReport(buildPlacementReport(models.value));
  reportMessage.value =
    where === "copied"
      ? `Placement report for ${models.value.length} models copied to the clipboard.`
      : `Clipboard unavailable — downloaded the placement report for ${models.value.length} models instead.`;
}
// Multi-select: the canvas can rubber-band several models at once. Everything that only
// makes sense for one model (the property panel, resize handles) reads `selectedModelId`,
// which is only set when the selection is exactly one.
const selectedIds = ref<number[]>([]);
const selectedModelId = computed(() => (selectedIds.value.length === 1 ? selectedIds.value[0]! : null));
const selectedModels = computed(() => models.value.filter((m) => selectedIds.value.includes(m.id)));
const viewMode = ref<"2d" | "3d">("2d");
const selectedModel = computed(() => models.value.find((m) => m.id === selectedModelId.value) ?? null);

// A row expands only when it is the *only* thing selected. A marquee selection of thirty props
// opening thirty panels would be worse than the flat list this replaces, and every control in
// the panel edits one model.
function isExpanded(model: ModelRecord): boolean {
  return selectedModelId.value === model.id;
}
const renamingModelId = ref<number | null>(null);
const renameValue = ref("");

// M15.5: Model Groups editor - previously import-only (bulkUpsertModelGroups, resolves
// membership by name), no path to create/rename/re-member/delete a group from the app itself.
const activeTab = ref<"models" | "groups">("models");
const groups = ref<ModelGroupRecord[]>([]);
const selectedGroupId = ref<number | null>(null);
const selectedGroup = computed(() => groups.value.find((g) => g.id === selectedGroupId.value) ?? null);
const groupNameDraft = ref("");
const groupBufferStyleDraft = ref("Default");
const groupMemberIds = ref<Set<number>>(new Set());
const groupError = ref("");

// A style the imported show carries that isn't in our list. Kept as an option of its own rather
// than silently reset to Default: the value came out of the show's own XML, and re-saving a
// group after glancing at it shouldn't rewrite what it said. (The four-option select this
// replaced did exactly that - "Horizontal Per Model" became "Horizontal" on the next save.)
const unknownGroupStyle = computed(() => {
  const current = groupBufferStyleDraft.value;
  return current && !(GROUP_RENDER_STYLES as string[]).includes(current) ? current : null;
});

function selectGroup(g: ModelGroupRecord): void {
  selectedGroupId.value = g.id;
  groupNameDraft.value = g.name;
  groupBufferStyleDraft.value = g.buffer_style || "Default";
  groupMemberIds.value = new Set(g.members.map((m) => m.id));
}
function newGroup(): void {
  selectedGroupId.value = null;
  groupNameDraft.value = "New Group";
  groupBufferStyleDraft.value = "Default";
  groupMemberIds.value = new Set();
}
function toggleGroupMember(modelId: number): void {
  const next = new Set(groupMemberIds.value);
  if (next.has(modelId)) next.delete(modelId);
  else next.add(modelId);
  groupMemberIds.value = next;
}
async function saveGroup(): Promise<void> {
  if (!layout.value || !groupNameDraft.value.trim()) return;
  groupError.value = "";
  const name = groupNameDraft.value.trim();
  const renaming = selectedGroup.value && selectedGroup.value.name !== name;
  try {
    // bulkUpsert matches groups by name (the import path's own contract), so a plain resave
    // under a new name would create a second group instead of renaming this one - delete the
    // old row first so the id changes but there's still exactly one group.
    if (renaming) await api.deleteModelGroup(layout.value.id, selectedGroup.value!.id);

    const memberNames = models.value.filter((m) => groupMemberIds.value.has(m.id)).map((m) => m.name);
    const [saved] = await api.bulkUpsertModelGroups(layout.value.id, [
      { name, bufferStyle: groupBufferStyleDraft.value, memberNames },
    ]);
    if (!saved) return;
    groups.value = renaming
      ? [...groups.value.filter((g) => g.id !== selectedGroup.value!.id), saved]
      : groups.value.some((g) => g.id === saved.id)
        ? groups.value.map((g) => (g.id === saved.id ? saved : g))
        : [...groups.value, saved];
    selectGroup(saved);
  } catch (err) {
    groupError.value = err instanceof Error ? err.message : "Couldn't save group";
  }
}
async function deleteGroup(): Promise<void> {
  if (!layout.value || !selectedGroup.value) return;
  const ok = await confirm({
    title: "Delete group",
    message: `"${selectedGroup.value.name}" will be removed. The models in it aren't deleted. This can't be undone.`,
    confirmLabel: "Delete group",
    danger: true,
  });
  if (!ok) return;
  await api.deleteModelGroup(layout.value.id, selectedGroup.value.id);
  groups.value = groups.value.filter((g) => g.id !== selectedGroup.value!.id);
  selectedGroupId.value = null;
}

// First real caller of api.updateModel() (previously unused anywhere in the app) - the
// persist path M12 exists to prove. ModelEntityController::update replaces `screen` wholesale,
// it does not deep-merge, so this must always spread the model's existing screen values and
// override only the changed keys, or a drag silently wipes scale/rotate/z. See DECISIONS.md.
async function updateScreen(modelId: number, patch: Partial<{ x: number; y: number; z: number; scale: number; scaleY: number; scaleZ: number; rotate: number }>): Promise<void> {
  if (!layout.value) return;
  const model = models.value.find((m) => m.id === modelId);
  if (!model) return;
  const updated = await api.updateModel(layout.value.id, modelId, { screen: { ...model.screen, ...patch } });
  const idx = models.value.findIndex((m) => m.id === modelId);
  if (idx !== -1) models.value[idx] = updated;
}

// The 2D canvas moves the whole selection at once, so this takes a batch. Each model still
// gets its own PATCH - ModelEntityController::update is per-model, and a drag of a handful of
// props isn't worth a bulk endpoint that would need its own screen-merge semantics.
// The same rule the 3D view enforces while dragging: the 2D canvas is a front elevation on the
// same Y axis, so a drag there can put a prop underground just as easily. The floor is never
// above where the model already was, so a show that deliberately places something low doesn't
// get it yanked up the first time it's nudged sideways.
function groundedY(model: ModelRecord, y: number): number {
  let geo: ModelGeometry | null;
  try {
    geo = computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    geo = null;
  }
  if (!geo) return y;
  const halfH = transformedHalfExtents(geo, {
    scale: model.screen.scale ?? 1,
    scaleY: model.screen.scaleY,
    scaleZ: model.screen.scaleZ,
    rotateDeg: model.screen.rotate ?? 0,
  }).halfH * NODE_SPACING;
  return Math.max(y, Math.min(halfH, model.screen.y ?? 0));
}

async function handleMove(moves: Array<{ id: number; x: number; y: number }>): Promise<void> {
  await Promise.all(
    moves.map((m) => {
      const model = models.value.find((mm) => mm.id === m.id);
      return updateScreen(m.id, { x: m.x, y: model ? groundedY(model, m.y) : m.y });
    }),
  );
}

// Corner/edge handles on the 2D canvas. scaleZ follows scaleX so a model resized in the 2D
// view keeps its proportions in the 3D view - a prop that got wider but stayed the same depth
// would look wrong the moment you switched views.
function handleResize(modelId: number, scale: number, scaleY: number): void {
  void updateScreen(modelId, { scale, scaleY, scaleZ: scale });
}

// Ctrl/Cmd-click and shift-click in the model list mirror the canvas's own modifiers.
function selectFromList(model: ModelRecord, e: MouseEvent): void {
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    selectedIds.value = selectedIds.value.includes(model.id)
      ? selectedIds.value.filter((id) => id !== model.id)
      : [...selectedIds.value, model.id];
  } else {
    selectedIds.value = [model.id];
  }
}
function handleMove3D(modelId: number, x: number, y: number, z: number): void {
  void updateScreen(modelId, { x, y, z });
}
function handlePositionField(field: "x" | "y" | "z" | "scale" | "scaleY" | "scaleZ" | "rotate", raw: string): void {
  if (!selectedModel.value) return;
  const value = Number(raw);
  if (Number.isNaN(value)) return;
  void updateScreen(selectedModel.value.id, { [field]: value });
}

// M15.2: the structural-property editor the M13 "no other recovery path" comment (see
// handleDelete below) flagged as missing - matches real xLights' Layout tab property grid,
// scoped to exactly the raw_attrs keys computeGeometryFromAttrs actually reads for this type
// (packages/engine's propertyFieldsFor) so every field here has a real, visible effect.
const propertyFields = computed(() => (selectedModel.value ? propertyFieldsFor(selectedModel.value.type) : []));

// The selected model's geometry, so the sub-model editor can say what each spec resolves to.
const selectedGeometry = computed<ModelGeometry | null>(() => {
  const model = selectedModel.value;
  if (!model) return null;
  try {
    return computeGeometryFromAttrs(model.type, model.raw_attrs);
  } catch {
    return null;
  }
});

async function updateSubModels(subModels: SubModelSpec[]): Promise<void> {
  if (!layout.value || !selectedModel.value) return;
  const model = selectedModel.value;
  const updated = await api.updateModel(layout.value.id, model.id, { sub_models: subModels });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
}

async function updateProperty(key: string, raw: string): Promise<void> {
  if (!layout.value || !selectedModel.value) return;
  const model = selectedModel.value;
  const raw_attrs = { ...model.raw_attrs, [key]: raw };
  const updated = await api.updateModel(layout.value.id, model.id, {
    raw_attrs,
    // A geometry-affecting edit (e.g. more strings) changes the model's node/channel count -
    // resend it alongside raw_attrs so a controller-assigned model's span check stays correct,
    // same pattern assignController/updateOffset already use for controller_offset edits.
    ...(model.controller_id != null ? { channel_count: channelCountForModel({ ...model, raw_attrs }) } : {}),
  });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
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
  selectedIds.value = [created.id];
}

// The necessary complement to create (see GOAL-M13.md) - a mis-dropped or duplicate model has
// no other recovery path since there's no structural-param editor yet.
async function handleDelete(modelId: number): Promise<void> {
  await deleteModels([modelId]);
}

// One confirmation for the whole selection, not one per model - a marquee over twenty props
// followed by twenty dialogs would be unusable.
async function deleteModels(ids: number[]): Promise<void> {
  if (!layout.value || ids.length === 0) return;
  const targets = models.value.filter((m) => ids.includes(m.id));
  if (targets.length === 0) return;
  const ok = await confirm({
    title: targets.length === 1 ? "Delete model" : `Delete ${targets.length} models`,
    message:
      targets.length === 1
        ? `"${targets[0]!.name}" will be removed from this layout. This can't be undone.`
        : `${targets.map((m) => m.name).join(", ")} will be removed from this layout. This can't be undone.`,
    confirmLabel: targets.length === 1 ? "Delete model" : `Delete ${targets.length} models`,
    danger: true,
  });
  if (!ok) return;

  const layoutId = layout.value.id;
  await Promise.all(targets.map((m) => api.deleteModel(layoutId, m.id)));
  const removed = new Set(targets.map((m) => m.id));
  models.value = models.value.filter((m) => !removed.has(m.id));
  selectedIds.value = selectedIds.value.filter((id) => !removed.has(id));
}

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.value.length > 0) {
    e.preventDefault();
    void deleteModels([...selectedIds.value]);
  } else if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    selectedIds.value = models.value.map((m) => m.id);
  } else if (e.key === "Escape") {
    selectedIds.value = [];
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
  if (layout.value) {
    // View objects are a decorative helper layer (Gridlines and friends) - the layout is
    // perfectly usable without them, so a failure there degrades to "no gridlines" rather than
    // rejecting the whole Promise.all and leaving the page with no models, no groups and a
    // full-page error banner. That is exactly what M15.7 caused in production: the
    // view_objects table's migration hadn't been applied, so one optional sub-resource 500'd
    // and took the entire Layout page down with it.
    viewObjectsError.value = "";
    const [modelList, groupList, viewObjectList] = await Promise.all([
      api.listModels(layout.value.id),
      api.listModelGroups(layout.value.id),
      api.listViewObjects(layout.value.id).catch((err: unknown) => {
        viewObjectsError.value = err instanceof Error ? `3D objects unavailable: ${err.message}` : "3D objects unavailable.";
        return [] as ViewObjectRecord[];
      }),
    ]);
    models.value = modelList;
    groups.value = groupList;
    viewObjects.value = viewObjectList;
  }
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
    [models.value, groups.value, viewObjects.value] = await Promise.all([
      api.listModels(layout.value.id),
      api.listModelGroups(layout.value.id),
      api.listViewObjects(layout.value.id),
    ]);
    // Placement counts are shown because they're the one number that says whether xLights'
    // two/three-point placement actually applied to this show. A yard that's visibly full of
    // arches, candy canes, rooflines and icicles but reports 0 two/three-point models means
    // those attributes aren't named what the importer expects in this file - worth seeing
    // rather than silently falling back to the boxed reading.
    const { boxed, twoPoint, threePoint, polyLine } = summary.placement;
    boxedScale.value = summary.boxedScale.reading;
    importMessage.value =
      `Imported ${summary.imported} models` +
      (summary.groups ? `, ${summary.groups} groups` : "") +
      ` — placement: ${boxed} boxed, ${twoPoint} two-point, ${threePoint} three-point, ${polyLine} poly-line` +
      (summary.boxedScale.decided
        ? ` — boxed sizes read as ${BOXED_SCALE_LABEL[summary.boxedScale.reading]}, matched against ${summary.boxedScale.referenceCount} models sized by their endpoints`
        : ` — boxed sizes read as ${BOXED_SCALE_LABEL[summary.boxedScale.reading]} (nothing in this file to check it against)`) +
      (summary.subModels ? ` — ${summary.subModels} sub-models` : "") +
      (summary.negativeScales
        ? ` — ${summary.negativeScales} ${summary.negativeScales === 1 ? "model" : "models"} had a negative scale, read as upright`
        : "") +
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
      <span v-if="models.length" class="boxed-scale" title="How ScaleX sizes models that aren't placed by their endpoints. If one prop swallows the yard, it's this.">
        Boxed sizes:
        <button
          v-for="reading in (['perNode', 'worldSize'] as BoxedScaleReading[])"
          :key="reading"
          :class="{ active: boxedScale === reading }"
          :disabled="rescaling"
          @click="setBoxedScale(reading)"
        >
          {{ BOXED_SCALE_LABEL[reading] }}
        </button>
      </span>
      <button
        class="report-btn"
        :disabled="models.length === 0"
        title="Copy what xLights wrote and what the importer derived, for every model"
        @click="copyPlacementReport"
      >
        Copy placement report
      </button>
    </header>
    <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
    <p v-if="viewObjectsError" class="view-objects-error">{{ viewObjectsError }}</p>
    <p v-if="reportMessage" class="import-message">{{ reportMessage }}</p>
    <div class="body">
      <aside class="model-list">
        <div class="tabs">
          <button :class="{ active: activeTab === 'models' }" @click="activeTab = 'models'">Models ({{ models.length }})</button>
          <button :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">Groups ({{ groups.length }})</button>
        </div>

        <template v-if="activeTab === 'groups'">
          <ul class="group-list">
            <li v-for="g in groups" :key="g.id" :class="{ selected: g.id === selectedGroupId }" @click="selectGroup(g)">
              <span>{{ g.name }}</span>
              <span class="type">{{ g.members.length }} model{{ g.members.length === 1 ? "" : "s" }}</span>
            </li>
          </ul>
          <p v-if="groups.length === 0" class="empty">No groups yet.</p>
          <button class="new-group-btn" @click="newGroup">+ New group</button>

          <div v-if="selectedGroupId !== null || groupNameDraft" class="group-editor">
            <label>
              Name
              <input v-model="groupNameDraft" type="text" />
            </label>
            <label>
              Render style
              <select v-model="groupBufferStyleDraft">
                <option v-for="s in GROUP_RENDER_STYLES" :key="s" :value="s">{{ s }}</option>
                <!--
                  A style this app doesn't know - an older spelling, or one xLights added - is
                  still offered so saving the group doesn't quietly rewrite what the show said.
                -->
                <option v-if="unknownGroupStyle" :value="unknownGroupStyle">
                  {{ unknownGroupStyle }} (imported)
                </option>
              </select>
            </label>
            <p class="members-label">Members</p>
            <ul class="member-checklist">
              <li v-for="m in models" :key="m.id">
                <label>
                  <input type="checkbox" :checked="groupMemberIds.has(m.id)" @change="toggleGroupMember(m.id)" />
                  {{ m.name }}
                </label>
              </li>
            </ul>
            <p v-if="groupError" class="assign-error">{{ groupError }}</p>
            <div class="group-actions">
              <button @click="saveGroup">Save</button>
              <button v-if="selectedGroupId !== null" class="delete-btn" @click="deleteGroup">Delete group</button>
            </div>
          </div>
        </template>

        <template v-else>
        <ul>
          <li
            v-for="m in models"
            :key="m.id"
            :class="{ unsupported: !m.supported, selected: selectedIds.includes(m.id) }"
            @click="selectFromList(m, $event)"
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
            <span v-else class="model-name" @dblclick.stop="startRename(m)">
              <span class="caret" :class="{ open: isExpanded(m) }">&#9656;</span>{{ m.name }}
            </span>

            <!-- A show has a hundred-odd models, and a row per model carrying a type, a channel
                 and a controller dropdown made the list impossible to scan. Only the model being
                 worked on shows its details; everything else is a name. -->
            <div v-if="isExpanded(m)" class="model-detail" @click.stop>
              <p class="detail-meta">
                <span class="type">{{ m.type }}</span>
                <span v-if="m.start_channel" class="channel">ch {{ m.start_channel }}</span>
              </p>
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

            <div v-if="selectedModel" class="properties-panel">
              <SubModelEditor
                :sub-models="selectedModel.sub_models ?? []"
                :geometry="selectedGeometry"
                @update="updateSubModels"
              />
            </div>
            <div v-if="selectedModel && propertyFields.length" class="properties-panel">
              <h2>Properties</h2>
              <label v-for="field in propertyFields" :key="field.key">
                {{ field.label }}
                <select
                  v-if="field.type === 'select'"
                  :value="propertyValueFor(field, selectedModel.raw_attrs)"
                  @change="updateProperty(field.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <input
                  v-else
                  :type="field.type === 'number' ? 'number' : 'text'"
                  :step="field.step ?? 1"
                  :value="propertyValueFor(field, selectedModel.raw_attrs)"
                  @change="updateProperty(field.key, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
            </div>
          </li>
        </ul>
        <p v-if="models.length === 0" class="empty">No models yet — import a show to get started.</p>

        <div v-if="selectedIds.length > 1" class="position-panel">
          <h2>{{ selectedIds.length }} models selected</h2>
          <p class="multi-hint">Drag any of them on the canvas to move the whole selection. Resize handles apply to one model at a time.</p>
          <ul class="multi-list">
            <li v-for="m in selectedModels" :key="m.id">{{ m.name }}</li>
          </ul>
          <button class="delete-btn" @click="deleteModels([...selectedIds])">Delete {{ selectedIds.length }} models</button>
        </div>

        </template>
      </aside>
      <div class="canvas-wrap">
        <ModelPalette v-if="viewMode === '2d'" />
        <div class="canvas-area">
          <LayoutCanvas
            v-if="viewMode === '2d'"
            :models="models"
            :view-objects="viewObjects"
            :selected-ids="selectedIds"
            @select="selectedIds = $event"
            @move="handleMove"
            @resize="handleResize"
            @create="handleCreate"
          />
          <LayoutCanvas3D
            v-else
            :models="models"
            :view-objects="viewObjects"
            :selected-model-id="selectedModelId"
            @select="selectedIds = $event === null ? [] : [$event]"
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
.boxed-scale {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #888;
}
.boxed-scale button {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
}
.boxed-scale button.active {
  background: #e8c468;
  color: #111;
  border-color: #e8c468;
}
.import-btn {
  cursor: pointer;
  padding: 0.4rem 0.8rem;
  border: 1px solid #555;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #ddd;
}
.report-btn {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}
.import-message {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: #aaa;
}
.view-objects-error {
  margin: 0;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: #e8c468;
  background: #241f10;
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
.model-name {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.caret {
  display: inline-block;
  color: #666;
  font-size: 0.65rem;
  transition: transform 0.12s ease;
}
.caret.open {
  transform: rotate(90deg);
  color: #e8c468;
}
.model-detail {
  margin: 0.35rem 0 0.2rem;
  padding: 0.4rem 0.1rem 0.1rem;
  border-top: 1px solid #3a3320;
  cursor: default;
}
.detail-meta {
  display: flex;
  gap: 0.5rem;
  margin: 0 0 0.35rem;
}
.model-list .type {
  color: #888;
  font-size: 0.75rem;
}
.model-list .channel {
  color: #666;
  font-size: 0.7rem;
}
.model-list .empty {
  color: #666;
  font-size: 0.8rem;
}
.tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}
.tabs button {
  flex: 1;
  padding: 0.3rem 0.4rem;
  font-size: 0.75rem;
  color: #999;
  background: #1a1a20;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
}
.tabs button.active {
  color: #e8c468;
  border-color: #e8c468;
  background: #2c2712;
}
.new-group-btn {
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.3rem;
  font-size: 0.75rem;
  color: #999;
  background: #1a1a20;
  border: 1px dashed #444;
  border-radius: 4px;
  cursor: pointer;
}
.new-group-btn:hover {
  color: #ddd;
  border-color: #666;
}
.group-editor {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #333;
}
.group-editor label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}
.group-editor input[type="text"],
.group-editor select {
  width: 8.5rem;
  font-size: 0.8rem;
}
.members-label {
  font-size: 0.75rem;
  color: #888;
  margin: 0.5rem 0 0.3rem;
}
.member-checklist {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  max-height: 12rem;
  overflow-y: auto;
  font-size: 0.75rem;
}
.member-checklist li {
  padding: 0.15rem 0;
}
.member-checklist label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #ccc;
  cursor: pointer;
}
.group-actions {
  display: flex;
  gap: 0.4rem;
}
.group-actions button {
  flex: 1;
  padding: 0.35rem;
  font-size: 0.75rem;
  color: #ddd;
  background: #1e1e26;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
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
.properties-panel {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #333;
}
.properties-panel h2 {
  font-size: 0.9rem;
  font-weight: normal;
  color: #888;
  margin: 0 0 0.5rem;
}
.properties-panel label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.4rem;
  gap: 0.5rem;
}
.properties-panel input,
.properties-panel select {
  width: 6rem;
  font-size: 0.8rem;
}
.multi-hint {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: #888;
}
.multi-list {
  list-style: none;
  margin: 0 0 0.6rem;
  padding: 0;
  max-height: 140px;
  overflow-y: auto;
  font-size: 0.8rem;
  color: #aaa;
}
.multi-list li {
  padding: 0.1rem 0;
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
