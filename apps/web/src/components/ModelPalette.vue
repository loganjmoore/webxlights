<script setup lang="ts">
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

// Must match LayoutCanvas.vue's onDrop MIME check exactly.
const MODEL_DRAG_MIME = "application/x-webxlights-model-type";

function onDragStart(e: DragEvent, type: string): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(MODEL_DRAG_MIME, type);
  e.dataTransfer.effectAllowed = "copy";
}
</script>

<template>
  <div class="model-palette">
    <button
      v-for="type in MODEL_TYPES"
      :key="type"
      type="button"
      class="palette-item"
      draggable="true"
      :title="`Drag onto the layout to place a ${type}`"
      @dragstart="onDragStart($event, type)"
    >
      {{ type }}
    </button>
  </div>
</template>

<style scoped>
.model-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #333;
  background: #16161c;
}
.palette-item {
  cursor: grab;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  border: 1px solid #444;
  border-radius: 4px;
  background: #1e1e26;
  color: #ddd;
}
.palette-item:hover {
  border-color: #e8c468;
  color: #e8c468;
}
.palette-item:active {
  cursor: grabbing;
}
</style>
