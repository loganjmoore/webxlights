<script setup lang="ts">
import { ref } from "vue";

// Every supported model type that has a real geometry default. Custom is excluded because it
// needs a real grid to render - dragging one out here would place a permanently geometry-less
// model - and so is Image, which is a picture of a prop rather than something to draw in a yard
// from nothing.
const MODEL_TYPES = [
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

// Dragging a type onto the layout, with pointer capture rather than HTML5 drag-and-drop - the
// same gesture the sequencer's effect palette uses, for the same reason: the tile lifts under the
// pointer, the proxy says whether it is over ground, Escape cancels. The page supplies `target`,
// which turns a viewport point into a spot on the ground plane (LayoutCanvas3D's worldAt), so this
// component knows nothing about cameras.
const props = defineProps<{ target: (clientX: number, clientY: number) => { x: number; y: number } | null }>();
const emit = defineEmits<{ create: [type: string, x: number, y: number] }>();

const drag = ref<{ type: string; x: number; y: number; over: boolean } | null>(null);
let pointer: { id: number; type: string; startX: number; startY: number; el: HTMLElement; started: boolean } | null = null;

function onPointerDown(e: PointerEvent, type: string): void {
  if (e.button !== 0) return;
  if (e.pointerType === "mouse") e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  pointer = { id: e.pointerId, type, startX: e.clientX, startY: e.clientY, el, started: false };
  el.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!pointer || e.pointerId !== pointer.id) return;
  if (!pointer.started) {
    if (Math.abs(e.clientX - pointer.startX) < 4 && Math.abs(e.clientY - pointer.startY) < 4) return;
    pointer.started = true;
    document.body.classList.add("dragging-tile");
    window.addEventListener("keydown", onKey, true);
    // Ends that arrive when capture is lost - see SequencerPage.vue's palette for the reasoning.
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("blur", finish);
  }
  drag.value = { type: pointer.type, x: e.clientX, y: e.clientY, over: props.target(e.clientX, e.clientY) !== null };
}

function onPointerUp(e: PointerEvent): void {
  if (!pointer || e.pointerId !== pointer.id) return;
  try {
    if (pointer.started) {
      const spot = props.target(e.clientX, e.clientY);
      if (spot) emit("create", pointer.type, spot.x, spot.y);
    }
  } finally {
    finish();
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  finish();
}

function finish(): void {
  const p = pointer;
  if (p) {
    try {
      if (p.el.hasPointerCapture?.(p.id)) p.el.releasePointerCapture(p.id);
    } catch {
      // Already released.
    }
  }
  pointer = null;
  drag.value = null;
  document.body.classList.remove("dragging-tile");
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("blur", finish);
}
</script>

<template>
  <div class="model-palette" role="toolbar" aria-label="Models">
    <button
      v-for="type in MODEL_TYPES"
      :key="type"
      type="button"
      class="palette-item"
      :class="{ lifted: drag?.type === type }"
      :title="`Drag onto the layout to place a ${type}`"
      @dragstart.prevent
      @pointerdown="onPointerDown($event, type)"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="finish"
    >
      {{ type }}
    </button>
  </div>
  <Teleport to="body">
    <div v-if="drag" class="drag-proxy" :class="{ over: drag.over }" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }" aria-hidden="true">
      <span>{{ drag.type }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.model-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.palette-item {
  cursor: grab;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  touch-action: none;
  user-select: none;
  -webkit-user-drag: none;
}
.palette-item:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.palette-item:active {
  cursor: grabbing;
}
.palette-item.lifted {
  opacity: 0.35;
}
</style>
