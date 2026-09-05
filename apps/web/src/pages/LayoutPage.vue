<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import EffectContextMenu from "../components/EffectContextMenu.vue";
import { isTypingTarget } from "../lib/commands";
import { useRoute } from "vue-router";
import {
  chooseBoxedScaleReading,
  computeGeometryFromAttrs,
  DEFAULT_GENERATE_OPTIONS,
  generateCustomModel,
  GROUP_RENDER_STYLES,
  propertyFieldsFor,
  propertyValueFor,
  screenFromAttrs,
  type BoxedScaleReading,
  type ModelGeometry,
  type FaceSpec,
  type StateSpec,
  type SubModelSpec,
} from "@webxlights/engine";
import SubModelEditor from "../components/SubModelEditor.vue";
import StateEditor from "../components/StateEditor.vue";
import FaceEditor from "../components/FaceEditor.vue";
import { allocateStartChannels, controllerLayouts, slotBarStyle, unassignedModels } from "../lib/controllerLayout";
import { backgroundFrom, clampOpacity, prepareBackground, type BackgroundImage } from "../lib/backgroundImage";
import { ALL_MODELS, modelsInPreview, previewNames } from "../lib/layoutPreviews";
import {
  api,
  type ControllerRecord,
  type Layout,
  type LayoutVersion,
  type ModelGroupRecord,
  type ModelRecord,
  type ViewObjectRecord,
} from "../lib/api";
import { importRgbEffects } from "../lib/import";
import { confirm } from "../lib/confirm";
import { loadPreferences } from "../lib/preferences";
import { buildPlacementReport, copyOrDownloadReport } from "../lib/placementReport";
import { channelCountForModel } from "../lib/fseqExport";
import LayoutCanvas3D from "../components/LayoutCanvas3D.vue";

const canvasRef = ref<InstanceType<typeof LayoutCanvas3D> | null>(null);
import ModelPalette from "../components/ModelPalette.vue";
import AppBar from "../components/AppBar.vue";
import { NODE_SPACING } from "../lib/worldUnits";

// The canvases' local-unit-to-world factor, the same value the importer places against
// (lib/import.ts) - re-deriving a placement with a different one would move the model.

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

// How a boxed model's ScaleX is read is decided per file by the importer, from the models in it
// that can already be measured (engine/models/boxedScale.ts). The label is kept for the import
// summary, which says which reading a file got.
//
// There used to be a pair of buttons here to override that by hand and re-scale every boxed
// model. Removed: it existed for a period when the importer's own choice wasn't trusted, and a
// control whose two settings differ by a factor of a model's node count is one that mostly gets
// pressed by accident.
const BOXED_SCALE_LABEL: Record<BoxedScaleReading, string> = {
  perNode: "ScaleX \u00d7 node count",
  worldSize: "ScaleX as world size",
};

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
const selectedModel = computed(() => models.value.find((m) => m.id === selectedModelId.value) ?? null);

// A row expands only when it is the *only* thing selected. A marquee selection of thirty props
// opening thirty panels would be worse than the flat list this replaces, and every control in
// the panel edits one model.
function isExpanded(model: ModelRecord): boolean {
  return selectedModelId.value === model.id;
}
const renamingModelId = ref<number | null>(null);

// Undo for the layout. Every change to where a model sits or what it is called remembers what it
// replaced, and undo writes that back through the same endpoint - so what you see after Ctrl+Z is
// what the server has, not a local guess.
type LayoutEdit = { modelId: number; screen?: { before: ModelRecord["screen"]; after: ModelRecord["screen"] }; name?: { before: string; after: string } };
const undoStack = ref<LayoutEdit[]>([]);
const redoStack = ref<LayoutEdit[]>([]);
async function applyEdit(edit: LayoutEdit, direction: "before" | "after"): Promise<void> {
  if (!layout.value) return;
  const patch = edit.screen ? { screen: edit.screen[direction] } : edit.name ? { name: edit.name[direction] } : null;
  if (!patch) return;
  const updated = await api.updateModel(layout.value.id, edit.modelId, patch);
  const idx = models.value.findIndex((m) => m.id === edit.modelId);
  if (idx !== -1) models.value[idx] = updated;
}
async function undoLayout(): Promise<void> {
  const edit = undoStack.value.pop();
  if (!edit) return;
  await applyEdit(edit, "before");
  redoStack.value.push(edit);
}
async function redoLayout(): Promise<void> {
  const edit = redoStack.value.pop();
  if (!edit) return;
  await applyEdit(edit, "after");
  undoStack.value.push(edit);
}
function remember(edit: LayoutEdit): void {
  undoStack.value.push(edit);
  if (undoStack.value.length > 100) undoStack.value.shift();
  redoStack.value = [];
}
function onLayoutKey(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || isTypingTarget(e.target)) return;
  e.preventDefault();
  void (e.shiftKey ? redoLayout() : undoLayout());
}

// The right-click menu on a model in the canvas.
const contextMenu = ref<{ x: number; y: number; modelId: number } | null>(null);
const MODEL_MENU = [
  { label: "Align with ground", action: "ground" },
  { label: "Reset rotation", action: "rotation" },
  { label: "Rename", action: "rename" },
  { label: "Delete", action: "delete" },
];
function onModelMenu(action: string): void {
  const id = contextMenu.value?.modelId;
  contextMenu.value = null;
  if (id === undefined) return;
  const model = models.value.find((m) => m.id === id);
  if (!model) return;
  if (action === "ground") canvasRef.value?.alignToGround(id);
  else if (action === "rotation") void updateScreen(id, { rotate: 0, rotateX: 0, rotateY: 0 });
  else if (action === "rename") startRename(model);
  else if (action === "delete") void handleDelete(id);
}

// The sidebar's width is yours to set: drag its edge. Remembered per browser.
const SIDEBAR_KEY = "webxlights.layoutSidebarWidth";
const sidebarWidth = ref(Number(typeof localStorage === "undefined" ? 0 : localStorage.getItem(SIDEBAR_KEY)) || 240);
let sidebarDrag: { pointerId: number; startX: number; startWidth: number } | null = null;
function onSplitterDown(e: PointerEvent): void {
  sidebarDrag = { pointerId: e.pointerId, startX: e.clientX, startWidth: sidebarWidth.value };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onSplitterMove(e: PointerEvent): void {
  if (!sidebarDrag || e.pointerId !== sidebarDrag.pointerId) return;
  sidebarWidth.value = Math.max(180, Math.min(560, sidebarDrag.startWidth + e.clientX - sidebarDrag.startX));
}
function onSplitterUp(e: PointerEvent): void {
  if (!sidebarDrag || e.pointerId !== sidebarDrag.pointerId) return;
  sidebarDrag = null;
  try {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value));
  } catch {
    // Private browsing: the width just isn't remembered.
  }
}
const renameValue = ref("");

// M15.5: Model Groups editor - previously import-only (bulkUpsertModelGroups, resolves
// membership by name), no path to create/rename/re-member/delete a group from the app itself.
const activeTab = ref<"models" | "groups" | "controllers">("models");

// xLights filters its model list by name, type and controller. A show has a hundred-odd models,
// so scrolling for one is the single most repeated action on this page.
// The Layout tab's background image: a photo of the house behind the models, so props can be
// placed where they physically are rather than by eye against an empty grid.
const background = ref<BackgroundImage | null>(null);
const backgroundError = ref("");

async function pickBackground(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !layout.value) return;
  backgroundError.value = "";
  const { image, error } = await prepareBackground(file);
  if (!image) {
    backgroundError.value = error;
    return;
  }
  background.value = (await api.replaceBackground(layout.value.id, image)).background;
}

async function setBackgroundOpacity(raw: string): Promise<void> {
  if (!layout.value || !background.value) return;
  const next = { ...background.value, opacity: clampOpacity(raw) };
  background.value = next; // applied straight away; the slider should not wait on a round trip
  await api.replaceBackground(layout.value.id, next);
}

async function clearBackground(): Promise<void> {
  if (!layout.value) return;
  background.value = null;
  await api.replaceBackground(layout.value.id, null);
}

// xLights' Layout Previews: a named view of some of the models, so a roofline can be worked on
// without the mega tree in the way. Which preview a model is in comes from the model, or from a
// group it belongs to - so creating one is nothing more than typing a name onto a model.
const activePreview = ref<string>(ALL_MODELS);
const availablePreviews = computed(() => previewNames(models.value, groups.value));
const previewModels = computed(() => modelsInPreview(models.value, groups.value, activePreview.value));

async function setModelPreview(name: string): Promise<void> {
  const model = selectedModel.value;
  if (!layout.value || !model) return;
  const raw_attrs = { ...model.raw_attrs };
  // An empty name removes the attribute rather than storing "": a model with a blank preview is
  // in none, which is what Unassigned means, and an empty string would read as a preview called
  // nothing at all.
  if (name.trim()) raw_attrs.Preview = name.trim();
  else delete raw_attrs.Preview;
  const updated = await api.updateModel(layout.value.id, model.id, { raw_attrs });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
}

const modelFilter = ref("");
const filteredModels = computed(() => {
  const needle = modelFilter.value.trim().toLowerCase();
  if (!needle) return previewModels.value;
  return previewModels.value.filter((m) => {
    const controllerName = controllers.value.find((c) => c.id === m.controller_id)?.name ?? "";
    return [m.name, m.type, controllerName].some((field) => field.toLowerCase().includes(needle));
  });
});

// xLights' controller visualiser: what is plugged in where. The reason to have it isn't the
// picture - it is that two models on overlapping channels is a show-day bug nothing else in this
// app surfaces. Each model's assignment is validated against the *controller's* span when it is
// made, never against the other models already on it.
const controllerViews = computed(() => controllerLayouts(controllers.value, models.value, channelCountForModel));
const looseModels = computed(() => unassignedModels(models.value));
const collisionCount = computed(() =>
  controllerViews.value.reduce((n, view) => n + view.slots.filter((s) => s.collidesWith.length > 0).length, 0),
);
// The types Replace can swap between: every one with a real geometry default, so a replaced
// model renders straight away rather than becoming a placeholder.
const MODEL_TYPES_FOR_REPLACE = [
  "Matrix",
  "Single Line",
  "Poly Line",
  "Arches",
  "Candy Canes",
  "Circle",
  "Star",
  "Tree",
  "Icicles",
  "Window Frame",
  "Wreath",
  "Spinner",
  "Cube",
  "Sphere",
  "Channel Block",
] as const;

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
async function updateScreen(
  modelId: number,
  patch: Partial<{ x: number; y: number; z: number; scale: number; scaleY: number; scaleZ: number; rotate: number; rotateX: number; rotateY: number }>,
): Promise<void> {
  if (!layout.value) return;
  const model = models.value.find((m) => m.id === modelId);
  if (!model) return;
  const before = { ...model.screen };
  const updated = await api.updateModel(layout.value.id, modelId, { screen: { ...model.screen, ...patch } });
  const idx = models.value.findIndex((m) => m.id === modelId);
  if (idx !== -1) models.value[idx] = updated;
  remember({ modelId, screen: { before, after: { ...updated.screen } } });
}

// Corner grips on the 3D canvas. The canvas has already worked out the new scales and, when
// "keep on the ground" is on, the anchor Y that plants the prop back on the lawn - resizing
// about the centre otherwise drops the base by half of whatever height was added.
/**
 * Re-derives a model's position, size and angles from the file it was imported out of.
 *
 * Placement is worked out once, at import, and written into the model's `screen`. So every later
 * improvement to how a file is read - measuring a run's real length instead of its shadow on the
 * front wall, turning a run into the depth it has, taking the magnitude of a negative scale -
 * reaches new imports only. A layout imported before the fix keeps the old answer forever, and
 * there was no way to pick up the new one short of importing the whole show again and losing
 * everything arranged by hand since.
 *
 * `raw_attrs` is lossless - it is xLights' own XML for this model, verbatim - so the derivation
 * can simply be run again. Explicit rather than automatic: this overwrites whatever the model's
 * position has been adjusted to, and doing that silently on load would undo somebody's afternoon.
 */
const recomputeMessage = ref("");

async function recomputePlacement(modelId: number): Promise<void> {
  const model = models.value.find((m) => m.id === modelId);
  if (!model || !layout.value) return;
  const attrs = model.raw_attrs ?? {};
  if (Object.keys(attrs).length === 0) {
    recomputeMessage.value = "This model wasn't imported from a file, so there's nothing to re-read.";
    return;
  }
  let geo: ModelGeometry | null;
  try {
    geo = computeGeometryFromAttrs(model.type, attrs);
  } catch {
    geo = null;
  }
  // The same reading the importer would choose for this show, rather than a guess per model:
  // the two readings differ by a factor of a model's node count, and picking one prop's answer
  // in isolation is how a single model ends up thirty times the size of its neighbours.
  const reading = chooseBoxedScaleReading(
    models.value.filter((m) => m.supported).map((m) => ({ displayAs: m.type, attrs: m.raw_attrs ?? {} })),
    NODE_SPACING,
  ).reading;
  const screen = screenFromAttrs(model.type, attrs, geo, NODE_SPACING, reading);
  await updateScreen(modelId, {
    x: screen.x,
    y: screen.y,
    z: screen.z,
    scale: screen.scale,
    scaleY: screen.scaleY,
    scaleZ: screen.scaleZ,
    rotate: screen.rotate,
    rotateX: screen.rotateX,
    rotateY: screen.rotateY,
  });
  recomputeMessage.value = `Re-read ${model.name} from the imported file.`;
}

function handleResize3D(modelId: number, screen: { scale: number; scaleY: number; scaleZ: number; y: number }): void {
  void updateScreen(modelId, screen);
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
type ScreenField = "x" | "y" | "z" | "scale" | "scaleY" | "scaleZ" | "rotate" | "rotateX" | "rotateY";

function handlePositionField(field: ScreenField, raw: string): void {
  if (!selectedModel.value) return;
  const value = Number(raw);
  if (Number.isNaN(value)) return;
  void updateScreen(selectedModel.value.id, { [field]: value });
}

/**
 * One number for all three axes.
 *
 * Sizing a prop is usually "make the whole thing bigger", and doing that through three fields
 * means getting three numbers to agree and watching the shape distort in between. The per-axis
 * fields are still there for the cases that genuinely want one axis - a matrix stretched wider
 * than it is tall - so this doesn't take anything away.
 *
 * Shows the shared value when the three already agree, and blank when they don't, because there
 * is no honest single number for a model scaled 2 x 1 x 2 and putting one there would suggest
 * the axes match when they don't.
 */
const uniformScale = computed<number | null>(() => {
  const s = selectedModel.value?.screen;
  if (!s) return null;
  const x = s.scale ?? 1;
  const y = s.scaleY ?? x;
  const z = s.scaleZ ?? x;
  return Math.abs(x - y) < 1e-9 && Math.abs(x - z) < 1e-9 ? x : null;
});

function handleUniformScale(raw: string): void {
  if (!selectedModel.value) return;
  const value = Number(raw);
  if (Number.isNaN(value) || value === 0) return;
  void updateScreen(selectedModel.value.id, { scale: value, scaleY: value, scaleZ: value });
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

async function updateStates(states: StateSpec[]): Promise<void> {
  if (!layout.value || !selectedModel.value) return;
  const model = selectedModel.value;
  const updated = await api.updateModel(layout.value.id, model.id, { states });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
}

async function updateFaces(faces: FaceSpec[]): Promise<void> {
  if (!layout.value || !selectedModel.value) return;
  const model = selectedModel.value;
  const updated = await api.updateModel(layout.value.id, model.id, { faces });
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

// Dropped from ModelPalette.vue onto the ground plane (LayoutCanvas3D's worldAt). raw_attrs stays {}
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

// xLights can clone a model, and create N instances in one action. Both matter for the same
// reason: a run of identical props - twelve mini-trees, eight arches - is set up once and then
// repeated, and doing that by hand means twelve trips through the property grid.
//
// Copies are offset from the original rather than placed on top of it, or the whole run would be
// one indistinguishable pile that has to be dragged apart before it can be told apart.
const cloneCount = ref(1);

// xLights' Tools > Generate Custom Model: build a Custom model from a picture of the prop. The
// props that most need one - a hand-made snowflake, a wire-frame reindeer - are exactly the ones
// with no library entry, and hand-writing a grid for anything past a dozen nodes is why people
// don't.
const generateOptions = ref({ ...DEFAULT_GENERATE_OPTIONS });
const generateNote = ref("");

async function generateFromImage(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !layout.value) return;
  generateNote.value = "";
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    const model = generateCustomModel(data, canvas.width, canvas.height, generateOptions.value);
    if (model.nodeCount === 0) {
      generateNote.value = "Nothing bright enough to make a node. Try lowering the threshold.";
      return;
    }
    const [created] = await api.bulkUpsertModels(layout.value.id, [
      {
        name: nextNameForType("Custom"),
        type: "Custom",
        supported: true,
        params: {},
        raw_attrs: { CustomModel: model.grid },
        screen: { x: 0, y: 0, z: 0, scale: 1, rotate: 0 },
        order: models.value.length,
      },
    ]);
    if (!created) return;
    models.value = [...models.value, created];
    selectedIds.value = [created.id];
    generateNote.value = `Made a ${model.width}×${model.height} model with ${model.nodeCount} nodes.`;
  } catch {
    // A file picker is where the wrong file gets chosen; a throw here would take the page down.
    generateNote.value = `Couldn't read "${file.name}".`;
  }
}

// xLights' Replace Model: change what a model *is* while keeping where it is and what it's
// wired to. Retyping a prop by deleting and recreating loses its position, its controller
// assignment and its sub-models - which is most of the work that went into it.
async function replaceModelType(type: string): Promise<void> {
  const model = selectedModel.value;
  if (!layout.value || !model || !type || type === model.type) return;
  // raw_attrs is cleared rather than carried: the attributes are per-type, and a Tree's
  // TreeDegrees on an Arches model is an attribute nothing reads that would reappear if it were
  // ever changed back. Every type has a sensible geometry default, so an empty bag renders.
  const updated = await api.updateModel(layout.value.id, model.id, {
    type,
    raw_attrs: {},
    ...(model.controller_id != null ? { channel_count: channelCountForModel({ type, raw_attrs: {} }) } : {}),
  });
  const idx = models.value.findIndex((m) => m.id === model.id);
  if (idx !== -1) models.value[idx] = updated;
}

async function cloneSelectedModel(): Promise<void> {
  const source = selectedModel.value;
  if (!layout.value || !source) return;
  const copies = Math.max(1, Math.min(50, Math.trunc(cloneCount.value)));
  const spacing = 8; // local units, roughly a prop's width apart

  const payloads = Array.from({ length: copies }, (_, i) => ({
    name: nextNameForType(source.type),
    type: source.type,
    supported: source.supported,
    params: { ...source.params },
    raw_attrs: { ...source.raw_attrs },
    screen: { ...source.screen, x: (source.screen.x ?? 0) + spacing * (i + 1) },
    sub_models: source.sub_models ?? [],
    string_type: source.string_type,
    // Deliberately not copied: the controller assignment. Two models on the same channels is a
    // show-day bug that nothing errors on, and a clone is exactly how you would create one by
    // accident. The new copies come out unassigned, ready for auto-allocation.
    order: models.value.length + i,
  }));

  // Names are generated one at a time from what already exists, so a batch would otherwise give
  // every copy the same name.
  const created: ModelRecord[] = [];
  for (const payload of payloads) {
    const [model] = await api.bulkUpsertModels(layout.value.id, [{ ...payload, name: nextNameForType(source.type) }]);
    if (model) {
      created.push(model);
      models.value = [...models.value, model];
    }
  }
  if (created.length) selectedIds.value = created.map((m) => m.id);
}

// xLights' auto start-channel allocation. Pairs with the collision view above: run it and the
// visualiser should have nothing left to complain about.
const allocationNote = ref("");
async function autoAllocateChannels(): Promise<void> {
  if (!layout.value) return;
  const { allocations, unplaced } = allocateStartChannels(controllers.value, models.value, channelCountForModel);
  for (const a of allocations) {
    const updated = await api.updateModel(layout.value.id, a.modelId, {
      controller_id: a.controllerId,
      controller_offset: a.controllerOffset,
      channel_count: a.channelCount,
    });
    const idx = models.value.findIndex((m) => m.id === a.modelId);
    if (idx !== -1) models.value[idx] = updated;
  }
  allocationNote.value = unplaced.length
    ? `Assigned ${allocations.length}. No room for: ${unplaced.map((u) => `${u.model.name} (${u.reason})`).join(", ")}`
    : `Assigned ${allocations.length} model${allocations.length === 1 ? "" : "s"}.`;
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
  remember({ modelId: model.id, name: { before: model.name, after: name } });
}
function cancelRename(): void {
  renamingModelId.value = null;
}

async function loadLayout(): Promise<void> {
  const [layouts, controllerList] = await Promise.all([api.listLayouts(projectId.value), api.listControllers(projectId.value)]);
  layout.value = layouts[0] ?? null;
  controllers.value = controllerList;
  background.value = backgroundFrom(layout.value?.settings as Record<string, unknown> | undefined);
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
    importMessage.value =
      `Imported ${summary.imported} models` +
      (summary.groups ? `, ${summary.groups} groups` : "") +
      ` — placement: ${boxed} boxed, ${twoPoint} two-point, ${threePoint} three-point, ${polyLine} poly-line` +
      (summary.boxedScale.decided
        ? ` — boxed sizes read as ${BOXED_SCALE_LABEL[summary.boxedScale.reading]}, matched against ${summary.boxedScale.referenceCount} models sized by their endpoints`
        : ` — boxed sizes read as ${BOXED_SCALE_LABEL[summary.boxedScale.reading]} (nothing in this file to check it against)`) +
      (summary.subModels ? ` — ${summary.subModels} sub-models` : "") +
      (summary.states ? ` — ${summary.states} state definitions` : "") +
      (summary.faces ? ` — ${summary.faces} face definitions` : "") +
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

// xLights' periodic backup: "Every x minutes, the xlights_rgbeffects.xml is backed up... This
// includes the layout as well". Sequences here have had version history for a long time; the
// layout had none, so a mis-drag or a bad import was unrecoverable.
//
// Only taken when something has actually changed since the last one, as xLights does ("This will
// occur if there have been any changes since the last auto save"). Otherwise leaving the page open
// overnight would fill the history with twenty identical layouts and push the useful ones out.
const versions = ref<LayoutVersion[]>([]);
const versionMessage = ref("");
const layoutPrefs = ref(loadPreferences(typeof localStorage === "undefined" ? null : localStorage));
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotFingerprint = "";

/** What the layout looks like right now, cheaply enough to compare every few minutes. */
function layoutFingerprint(): string {
  return JSON.stringify({
    models: models.value.map((m) => [m.name, m.type, m.screen, m.sub_models, m.states, m.faces, m.controller_id, m.controller_offset]),
    groups: groups.value.map((g) => [g.name, g.buffer_style, g.members.map((x) => x.name)]),
    settings: layout.value?.settings ?? {},
  });
}

async function loadVersions(): Promise<void> {
  if (!layout.value) return;
  versions.value = await api.listLayoutVersions(layout.value.id);
}

async function snapshotLayout(reason: "manual" | "auto" = "manual"): Promise<void> {
  if (!layout.value) return;
  versionMessage.value = "";
  try {
    await api.snapshotLayout(layout.value.id, reason);
    lastSnapshotFingerprint = layoutFingerprint();
    // The retention preference governs this history too. It applied only to sequence snapshots
    // before, which is worse than governing neither: a setting that silently covers one of two
    // things reads as though it worked.
    const days = layoutPrefs.value.versionRetentionDays;
    if (days > 0) {
      try {
        await api.purgeLayoutVersions(layout.value.id, days);
      } catch {
        // Leaves more history than asked for, which is the safe direction.
      }
    }
    await loadVersions();
    if (reason === "manual") versionMessage.value = "Snapshot taken.";
  } catch (err) {
    versionMessage.value = err instanceof Error ? err.message : "Couldn't take a snapshot.";
  }
}

async function restoreVersion(versionId: number): Promise<void> {
  if (!layout.value) return;
  const ok = await confirm({
    title: "Restore this snapshot",
    // Said plainly because it is the surprising half: a restore is not a merge.
    message:
      "The layout goes back to how it was. Models added since the snapshot are removed, and the ones it contains are restored to how they were then.",
    confirmLabel: "Restore",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.restoreLayoutVersion(layout.value.id, versionId);
    await loadLayout();
    await loadVersions();
    versionMessage.value = "Layout restored.";
  } catch (err) {
    versionMessage.value = err instanceof Error ? err.message : "Couldn't restore that snapshot.";
  }
}

// xLights' "Backup on Save": "If you have enabled Backup on Save, it will also take a snapshot
// after every Save operation."
//
// Watched rather than hooked into each save, because there are a dozen paths that write to the
// layout - dragging a model, editing a state, importing - and hooking each would be a dozen places
// to forget. Debounced, because dragging a model across the canvas writes continuously and one
// snapshot per frame of a drag is not a backup, it is a flood.
let saveSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => (layoutPrefs.value.snapshotOnSave ? layoutFingerprint() : ""),
  (now, before) => {
    if (!layoutPrefs.value.snapshotOnSave || !now || now === before || before === undefined) return;
    if (saveSnapshotTimer) clearTimeout(saveSnapshotTimer);
    saveSnapshotTimer = setTimeout(() => {
      // The same changed-since-last-snapshot check the timer uses, so a save that changed nothing
      // in the end - dragging a model and putting it back - doesn't add a duplicate.
      if (layoutFingerprint() === lastSnapshotFingerprint) return;
      void snapshotLayout("auto");
    }, 3000);
  },
);

function startSnapshotTimer(): void {
  if (snapshotTimer) clearInterval(snapshotTimer);
  const minutes = layoutPrefs.value.layoutSnapshotMinutes;
  if (minutes <= 0) return;
  snapshotTimer = setInterval(() => {
    if (layoutFingerprint() === lastSnapshotFingerprint) return;
    void snapshotLayout("auto");
  }, minutes * 60_000);
}

// Clicking a model on the canvas brings its row into view in the list; clicking the row selects
// it on the canvas (selectedIds is what both read).
watch(selectedModelId, (id) => {
  if (id === null) return;
  void nextTick(() => document.getElementById(`model-${id}`)?.scrollIntoView({ block: "nearest" }));
});
onMounted(() => window.addEventListener("keydown", onLayoutKey));
onUnmounted(() => window.removeEventListener("keydown", onLayoutKey));

onMounted(async () => {
  await loadLayout();
  lastSnapshotFingerprint = layoutFingerprint();
  await loadVersions();
  startSnapshotTimer();
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (saveSnapshotTimer) clearTimeout(saveSnapshotTimer);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <main class="layout-page">
    <AppBar :project-id="projectId" active="layout" />
    <header class="page-toolbar">
      <h1>Layout</h1>
      <div class="group">
        <button class="icon" :disabled="undoStack.length === 0" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undoLayout">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a5 5 0 0 1 0 10h-3" /></svg>
        </button>
        <button class="icon" :disabled="redoStack.length === 0" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" @click="redoLayout">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M20 12H10a5 5 0 0 0 0 10h3" /></svg>
        </button>
      </div>
      <label class="btn">
        {{ importing ? "Importing..." : "Import xlights_rgbeffects.xml" }}
        <input type="file" accept=".xml" @change="handleFileChange" :disabled="importing" hidden />
      </label>
      <button
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
      <aside class="model-list" :style="{ width: `${sidebarWidth}px` }">
        <div class="tabs">
          <button :class="{ active: activeTab === 'models' }" @click="activeTab = 'models'">Models <span class="count">{{ models.length }}</span></button>
          <button :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">Groups <span class="count">{{ groups.length }}</span></button>
          <button :class="{ active: activeTab === 'controllers' }" :title="collisionCount ? 'Some models share channels' : ''" @click="activeTab = 'controllers'">
            Controllers <span class="count" :class="{ warn: collisionCount }">{{ controllers.length }}</span>
          </button>
        </div>

        <template v-if="activeTab === 'controllers'">
          <p v-if="collisionCount" class="controller-warning">
            {{ collisionCount }} model{{ collisionCount === 1 ? "" : "s" }} share channels with
            another on the same controller. Nothing will error — they'll simply light each other's
            effects.
          </p>
          <div v-for="view in controllerViews" :key="view.controller.id" class="controller-view">
            <div class="controller-head">
              <strong>{{ view.controller.name }}</strong>
              <span class="controller-meta">
                ch {{ view.controller.start_channel }}–{{ view.controller.start_channel + view.controller.channel_count - 1 }},
                {{ view.freeChannels }} free
                <template v-if="view.overrunChannels">
                  , <span class="bad">{{ view.overrunChannels }} past the end</span>
                </template>
              </span>
            </div>
            <div class="channel-track">
              <div
                v-for="slot in view.slots"
                :key="slot.model.id"
                class="channel-slot"
                :class="{ bad: slot.collidesWith.length > 0 }"
                :style="slotBarStyle(view, slot)"
                :title="`${slot.model.name}: ch ${slot.startChannel}–${slot.endChannel}`"
              />
            </div>
            <ul class="controller-models">
              <li v-for="slot in view.slots" :key="slot.model.id" :class="{ bad: slot.collidesWith.length > 0 }">
                <span>{{ slot.model.name }}</span>
                <span class="controller-meta">ch {{ slot.startChannel }}–{{ slot.endChannel }}</span>
                <span v-if="slot.collidesWith.length" class="bad">overlaps {{ slot.collidesWith.join(", ") }}</span>
              </li>
              <li v-if="view.slots.length === 0" class="empty">Nothing assigned to this controller.</li>
            </ul>
          </div>
          <div class="controller-head">
            <button :disabled="controllers.length === 0 || looseModels.length === 0" @click="autoAllocateChannels">
              Auto-assign start channels
            </button>
            <span v-if="allocationNote" class="controller-meta">{{ allocationNote }}</span>
          </div>
          <p v-if="controllers.length === 0" class="empty">No controllers in this project yet.</p>
          <div v-if="looseModels.length" class="controller-view">
            <div class="controller-head"><strong>Not assigned to a controller</strong></div>
            <p class="controller-meta">
              These still export — they're written after every controller-routed span — but their
              channel numbers move whenever a controller assignment changes.
            </p>
            <ul class="controller-models">
              <li v-for="m in looseModels" :key="m.id"><span>{{ m.name }}</span></li>
            </ul>
          </div>
        </template>

        <template v-else-if="activeTab === 'groups'">
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
        <div class="model-filter">
          <button :disabled="!selectedModel" title="Copy the selected model" @click="cloneSelectedModel">
            Clone
          </button>
          <input v-model.number="cloneCount" type="number" min="1" max="50" class="clone-count" title="How many copies" />
          <select
            :value="selectedModel?.type ?? ''"
            :disabled="!selectedModel"
            title="Change what this model is, keeping its position and wiring"
            @change="replaceModelType(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Replace with…</option>
            <option v-for="t in MODEL_TYPES_FOR_REPLACE" :key="t" :value="t">{{ t }}</option>
          </select>
          <select v-model="activePreview" title="Which preview the layout is showing">
            <option v-for="p in availablePreviews" :key="p" :value="p">{{ p }}</option>
          </select>
          <input
            v-if="selectedModel"
            type="text"
            class="clone-count preview-name"
            placeholder="In preview…"
            :value="selectedModel.raw_attrs?.Preview ?? ''"
            title="Which preview this model is in. Blank means none."
            @change="setModelPreview(($event.target as HTMLInputElement).value)"
          />
          <input v-model="modelFilter" type="search" placeholder="Filter by name, type or controller" />
          <label class="background-pick" title="A photo of the house, behind the layout">
            Backdrop
            <input type="file" accept="image/*" @change="pickBackground" />
          </label>
          <template v-if="background">
            <input
              type="range"
              min="0"
              max="100"
              class="background-opacity"
              :value="background.opacity"
              title="How strongly the photo shows through"
              @input="setBackgroundOpacity(($event.target as HTMLInputElement).value)"
            />
            <button title="Remove the backdrop" @click="clearBackground">×</button>
          </template>
          <span v-if="modelFilter" class="controller-meta">{{ filteredModels.length }}/{{ models.length }}</span>
        </div>
        <p v-if="backgroundError" class="export-error">{{ backgroundError }}</p>
        <div class="model-filter">
          <label class="background-pick" title="Build a Custom model from a picture of the prop">
            From photo
            <input type="file" accept="image/*" @change="generateFromImage" />
          </label>
          <input
            v-model.number="generateOptions.columns"
            type="number"
            min="2"
            max="200"
            class="clone-count"
            title="Grid width in cells"
          />
          <input
            v-model.number="generateOptions.threshold"
            type="range"
            min="1"
            max="255"
            class="background-opacity"
            title="How bright a pixel has to be to become a node"
          />
          <select v-model="generateOptions.order" title="Wiring order - this is the channel order">
            <option value="rows">Rows</option>
            <option value="rowsZigZag">Rows, zig-zag</option>
            <option value="columns">Columns</option>
            <option value="columnsZigZag">Columns, zig-zag</option>
          </select>
        </div>
        <p v-if="generateNote" class="controller-meta">{{ generateNote }}</p>
        <ul>
          <li
            v-for="m in filteredModels"
            :id="`model-${m.id}`"
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
                Scale Z
                <input
                  type="number"
                  step="0.1"
                  :value="selectedModel.screen.scaleZ ?? selectedModel.screen.scale ?? 1"
                  title="Depth. Defaults to Scale X until set independently"
                  @change="handlePositionField('scaleZ', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="uniform-scale">
                Scale all
                <input
                  type="number"
                  step="0.1"
                  :value="uniformScale ?? ''"
                  :placeholder="uniformScale === null ? 'mixed' : ''"
                  title="Sets all three axes at once. Blank when they differ."
                  @change="handleUniformScale(($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                Rotate X
                <input
                  type="number"
                  :value="selectedModel.screen.rotateX ?? 0"
                  title="Tips the model forwards or back - a stake laid flat on the lawn is 90"
                  @change="handlePositionField('rotateX', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                Rotate Y
                <input
                  type="number"
                  :value="selectedModel.screen.rotateY ?? 0"
                  title="Swings the model round to face elsewhere - how a tree is turned on its own axis"
                  @change="handlePositionField('rotateY', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                Rotate Z
                <input
                  type="number"
                  :value="selectedModel.screen.rotate ?? 0"
                  title="Spins the model in its own face plane"
                  @change="handlePositionField('rotate', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <button
                class="recompute-btn"
                title="Work this model's position, size and angles out again from the file it was imported from. Replaces anything set by hand."
                @click="recomputePlacement(selectedModel.id)"
              >
                Re-read placement from import
              </button>
              <p v-if="recomputeMessage" class="timing-note">{{ recomputeMessage }}</p>
              <button class="delete-btn" @click="handleDelete(selectedModel.id)">Delete model</button>
            </div>

            <div v-if="selectedModel" class="properties-panel">
              <SubModelEditor
                :sub-models="selectedModel.sub_models ?? []"
                :geometry="selectedGeometry"
                @update="updateSubModels"
              />
            </div>
            <div v-if="selectedModel" class="properties-panel">
              <StateEditor :states="selectedModel.states ?? []" :geometry="selectedGeometry" @update="updateStates" />
            </div>
            <div v-if="selectedModel" class="properties-panel">
              <FaceEditor :faces="selectedModel.faces ?? []" :geometry="selectedGeometry" @update="updateFaces" />
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

        <div class="properties-panel">
          <h2>Snapshots</h2>
          <p class="multi-hint">
            The whole layout — models with their sub-models, states and faces, groups, view objects,
            views and presets — kept so a bad import or a mis-drag can be undone. Taken
            automatically every {{ layoutPrefs.layoutSnapshotMinutes }} minutes when something has
            changed, and whenever you ask.
          </p>
          <div class="models-panel-actions">
            <button @click="snapshotLayout('manual')">Take a snapshot</button>
          </div>
          <p v-if="versionMessage" class="multi-hint">{{ versionMessage }}</p>
          <ul v-if="versions.length" class="multi-list">
            <li v-for="v in versions" :key="v.id">
              <span>#{{ v.number }} {{ v.reason === "auto" ? "(auto)" : "" }}</span>
              <button @click="restoreVersion(v.id)">Restore</button>
            </li>
          </ul>
          <p v-else class="multi-hint">None yet.</p>
        </div>
      </aside>
      <div
        class="splitter"
        title="Drag to resize the panel"
        @pointerdown="onSplitterDown"
        @pointermove="onSplitterMove"
        @pointerup="onSplitterUp"
        @pointercancel="onSplitterUp"
      ></div>
      <div class="canvas-wrap">
        <ModelPalette :target="(x, y) => canvasRef?.worldAt(x, y) ?? null" @create="handleCreate" />
        <div class="canvas-area">
          <!--
            The house photo sits behind the 2D canvas rather than being drawn into it: the canvas
            redraws on every drag, and re-painting a 1600px photo on each pointermove is the one
            thing that would make dragging a model feel heavy. As a sibling it is composited by
            the browser and costs nothing per frame.
          -->
          <img
            v-if="background"
            class="layout-background"
            :src="background.dataUrl"
            :style="{ opacity: background.opacity / 100 }"
            alt=""
          />
          <LayoutCanvas3D
            ref="canvasRef"
            :models="previewModels"
            :view-objects="viewObjects"
            :selected-model-id="selectedModelId"
            @select="selectedIds = $event === null ? [] : [$event]"
            @move="handleMove3D"
            @create="handleCreate"
            @resize="handleResize3D"
            @contextmenu="(id, x, y) => (contextMenu = { modelId: id, x, y })"
          />
          <EffectContextMenu
            v-if="contextMenu"
            :x="contextMenu.x"
            :y="contextMenu.y"
            :items="MODEL_MENU"
            @action="onModelMenu"
            @close="contextMenu = null"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.layout-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  z-index: 0;
}
.background-pick {
  font-size: 0.7rem;
  color: #555;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.background-pick input[type="file"] {
  width: 5.5rem;
  font-size: 0.6rem;
}
.background-opacity {
  width: 4rem;
}
.model-filter {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.3rem;
}
.model-filter input[type="search"] {
  flex: 1;
  min-width: 0;
}
.clone-count {
  width: 3rem;
}
.preview-name {
  width: 7rem;
}
.controller-view {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.4rem;
  margin-bottom: 0.5rem;
}
.controller-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.controller-meta {
  font-size: 0.7rem;
  color: #777;
}
/* An overlap is the one thing on this screen that will ruin a show, so it is the one thing
   coloured. Everything else stays quiet. */
.bad {
  color: #b3261e;
}
.controller-warning {
  color: #b3261e;
  font-size: 0.75rem;
  margin: 0 0 0.4rem;
}
.channel-track {
  position: relative;
  height: 12px;
  margin: 0.3rem 0;
  background: #eee;
  border-radius: 2px;
  overflow: hidden;
}
.channel-slot {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #50a0ff;
  border-right: 1px solid #fff;
}
.channel-slot.bad {
  background: #b3261e;
}
.controller-models {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.72rem;
}
.controller-models li {
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
}

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
.splitter {
  width: 6px;
  flex: none;
  cursor: col-resize;
  background: transparent;
  border-right: 1px solid var(--border);
  touch-action: none;
}
.splitter:hover {
  background: var(--bg-hover);
}
.page-toolbar button.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.page-toolbar button.icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.model-list {
  width: 240px;
  flex: none;
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
/* One segmented control, never wrapping: the count is a small badge, not part of the name. */
.tabs {
  display: flex;
  gap: 0.15rem;
  margin-bottom: 0.6rem;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}
.tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.25rem 0.15rem;
  font: inherit;
  font-size: 0.7rem;
  white-space: nowrap;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.tabs button:hover {
  color: var(--text);
}
.tabs button.active {
  color: var(--accent-ink);
  background: var(--accent);
}
.tabs .count {
  font-size: 0.65rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}
.tabs button.active .count {
  background: rgba(0, 0, 0, 0.15);
}
.tabs .count.warn {
  background: var(--danger);
  color: #fff;
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
.recompute-btn {
  margin-top: 0.4rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid #3a3a44;
  border-radius: 3px;
  background: #23232b;
  color: #cfcfd8;
  cursor: pointer;
}
.recompute-btn:hover {
  border-color: #e8c468;
  color: #e8c468;
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
  /* The backdrop is absolutely positioned inside this box, so it has to be the containing block -
     otherwise the photo would size itself against the page rather than the canvas. */
  position: relative;
  /* The 3D scene renders transparent so the house photo behind it shows through, which means
     this is now what's behind the scene when there is no photo. Same colour the renderer used
     to clear to, so a layout without a backdrop looks exactly as it did. */
  background: #0a0a0d;
}
</style>
