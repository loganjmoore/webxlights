<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PictureImage } from "@webxlights/engine";

// xLights' Pixel Editor (manual: Sequencer > Pixel Editor): a matrix drawing tool to "amend a
// picture or draw your own pictures or animations".
//
// It draws straight into the Pictures effect's image, which is where this app already stores a
// picture — so what's drawn here renders on the model immediately, with no file to save or
// reload. That is the whole point of it over a paint program: the grid *is* the model.
//
// Left button draws with the selected colour, right button erases, as the manual describes. Eight
// colour wells, its number.

const props = defineProps<{ image: PictureImage | undefined; width: number; height: number }>();
const emit = defineEmits<{ update: [image: PictureImage] }>();

const PALETTE_SIZE = 8;
const palette = ref(["#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ff8000"]);
const selected = ref(0);
const cell = ref(12);

// The grid being edited. Sized to the model unless a picture is already there, in which case that
// picture's own size wins - resampling someone's drawing to fit would quietly destroy it.
const gridW = computed(() => props.image?.width ?? Math.max(1, props.width));
const gridH = computed(() => props.image?.height ?? Math.max(1, props.height));

function blankData(w: number, h: number): number[] {
  return new Array(w * h * 4).fill(0);
}

// `PictureImage.data` is ArrayLike rather than an array - an imported picture arrives as a typed
// array - so it is copied through Array.from rather than spread.
const data = ref<number[]>(Array.from(props.image?.data ?? blankData(gridW.value, gridH.value)));

watch(
  () => props.image,
  (image) => {
    data.value = Array.from(image?.data ?? blankData(gridW.value, gridH.value));
  },
);

function hexToBytes(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorAt(x: number, y: number): string {
  const i = (y * gridW.value + x) * 4;
  const a = data.value[i + 3] ?? 0;
  if (a === 0) return "transparent";
  return `rgb(${data.value[i]},${data.value[i + 1]},${data.value[i + 2]})`;
}

function paint(x: number, y: number, erase: boolean): void {
  if (x < 0 || y < 0 || x >= gridW.value || y >= gridH.value) return;
  const i = (y * gridW.value + x) * 4;
  const next = [...data.value];
  if (erase) {
    next[i] = 0;
    next[i + 1] = 0;
    next[i + 2] = 0;
    next[i + 3] = 0;
  } else {
    const [r, g, b] = hexToBytes(palette.value[selected.value] ?? "#ffffff");
    next[i] = r;
    next[i + 1] = g;
    next[i + 2] = b;
    next[i + 3] = 255;
  }
  data.value = next;
  emit("update", { width: gridW.value, height: gridH.value, data: next });
}

// Held during a drag, so a stroke paints rather than needing a click per cell - which is what
// makes this usable on a 32-wide matrix at all.
let painting: "draw" | "erase" | null = null;

function onDown(e: PointerEvent, x: number, y: number): void {
  painting = e.button === 2 ? "erase" : "draw";
  paint(x, y, painting === "erase");
}
function onEnter(x: number, y: number): void {
  if (painting) paint(x, y, painting === "erase");
}
function stop(): void {
  painting = null;
}

function clearAll(): void {
  const next = blankData(gridW.value, gridH.value);
  data.value = next;
  emit("update", { width: gridW.value, height: gridH.value, data: next });
}

function fillAll(): void {
  const [r, g, b] = hexToBytes(palette.value[selected.value] ?? "#ffffff");
  const next = blankData(gridW.value, gridH.value);
  for (let i = 0; i < next.length; i += 4) {
    next[i] = r;
    next[i + 1] = g;
    next[i + 2] = b;
    next[i + 3] = 255;
  }
  data.value = next;
  emit("update", { width: gridW.value, height: gridH.value, data: next });
}

const rows = computed(() => Array.from({ length: gridH.value }, (_, i) => i));
const cols = computed(() => Array.from({ length: gridW.value }, (_, i) => i));
</script>

<template>
  <div class="pixel-editor" @pointerup="stop" @pointerleave="stop">
    <div class="wells">
      <button
        v-for="i in PALETTE_SIZE"
        :key="i"
        class="well"
        :class="{ on: selected === i - 1 }"
        :style="{ background: palette[i - 1] }"
        :title="`Colour ${i}`"
        @click="selected = i - 1"
      />
      <input
        type="color"
        class="well-picker"
        :value="palette[selected]"
        title="Change the selected colour"
        @input="palette[selected] = ($event.target as HTMLInputElement).value"
      />
    </div>

    <!-- Rows are drawn top-down but the buffer is y-up, so row 0 of the display is the last row
         of the data - otherwise everything drawn here would render upside down on the model. -->
    <div class="grid" @contextmenu.prevent>
      <div v-for="row in rows" :key="row" class="grid-row">
        <div
          v-for="col in cols"
          :key="col"
          class="grid-cell"
          :style="{ width: `${cell}px`, height: `${cell}px`, background: colorAt(col, gridH - 1 - row) }"
          @pointerdown="onDown($event, col, gridH - 1 - row)"
          @pointerenter="onEnter(col, gridH - 1 - row)"
        />
      </div>
    </div>

    <div class="actions">
      <button @click="fillAll">Fill</button>
      <button @click="clearAll">Clear</button>
      <label class="zoom">
        Size
        <input v-model.number="cell" type="range" min="4" max="24" />
      </label>
      <span class="dims">{{ gridW }}×{{ gridH }}</span>
    </div>
    <p class="hint">Left button draws, right button erases. Drag to paint a stroke.</p>
  </div>
</template>

<style scoped>
.pixel-editor {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.wells {
  display: flex;
  gap: 0.2rem;
  align-items: center;
}
.well {
  width: 18px;
  height: 18px;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
}
.well.on {
  outline: 2px solid #ffc878;
  outline-offset: 1px;
}
.well-picker {
  width: 24px;
  height: 20px;
  padding: 0;
  border: 1px solid #555;
}
.grid {
  display: inline-block;
  border: 1px solid #444;
  background: #14141a;
  /* A big matrix has to be reachable without the panel growing to fit it. */
  max-height: 40vh;
  max-width: 100%;
  overflow: auto;
  touch-action: none;
}
.grid-row {
  display: flex;
}
.grid-cell {
  border-right: 1px solid #23232c;
  border-bottom: 1px solid #23232c;
  flex: none;
}
.actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.7rem;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  color: #666;
}
.zoom input {
  width: 4rem;
}
.dims {
  color: #888;
  margin-left: auto;
}
.hint {
  margin: 0;
  color: #666;
  font-size: 0.65rem;
}
</style>
