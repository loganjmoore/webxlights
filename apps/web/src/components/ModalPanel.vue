<script lang="ts">
// Shared by every panel on the page, so whichever one was touched last sits on top.
let zCounter = 100;
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { clampToViewport, loadPlacement, savePlacement } from "../lib/panelPositions";

// A settings pane as a dialog over the page - one you can move, pin and tear off.
//
// It opens centred with a backdrop, the way a dialog should. Drag it by its title bar and it
// goes where you put it. Pin it and the backdrop goes away: the panel floats where it is while
// the grid underneath stays live, which is how xLights' docked windows behave and what "I want
// the Models list open while I sequence" actually needs. Where it was left is remembered per
// panel (lib/panelPositions.ts). Panels with a window route offer to open in their own browser
// window as well, for the second monitor.
//
// Teleported to <body> so a panel can't be clipped by whatever it happens to be declared inside -
// the sequencer's panels sit inside a flex column with `overflow: hidden`.

const props = defineProps<{
  title: string;
  wide?: boolean;
  /** Remember where this panel was left. Without one, it opens centred every time. */
  id?: string;
  /** Opens this panel in its own browser window (lib/previewChannel.ts' openPanelWindow). */
  popout?: () => void;
}>();
const emit = defineEmits<{ close: [] }>();

const storage = typeof localStorage === "undefined" ? null : localStorage;

const panelRef = ref<HTMLDivElement | null>(null);
// Floating: positioned by the user (dragged or pinned) rather than centred by the backdrop.
const floating = ref(false);
const pinned = ref(false);
const position = ref({ x: 0, y: 0 });
const zIndex = ref(nextZ());

// Whichever panel was touched last sits on top - several pinned panels overlapping is normal,
// and the one you clicked is the one you want to see.
function nextZ(): number {
  zCounter += 1;
  return zCounter;
}
function raise(): void {
  zIndex.value = nextZ();
}

const style = computed(() =>
  floating.value ? { left: `${position.value.x}px`, top: `${position.value.y}px`, zIndex: zIndex.value } : { zIndex: zIndex.value },
);

function remember(): void {
  if (!props.id) return;
  savePlacement(storage, props.id, floating.value ? { ...position.value, pinned: pinned.value } : null);
}

/** Starts floating exactly where the panel is drawn now, so nothing jumps. */
function detach(): void {
  if (floating.value) return;
  const rect = panelRef.value?.getBoundingClientRect();
  if (rect) position.value = { x: Math.round(rect.left), y: Math.round(rect.top) };
  floating.value = true;
}

function togglePin(): void {
  detach();
  pinned.value = !pinned.value;
  remember();
}

/** Double-click the title: back to the middle, forgotten. The way out of a corner. */
function recenter(): void {
  floating.value = false;
  pinned.value = false;
  remember();
}

// ---- dragging the title bar ----------------------------------------------------------------

let drag: { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null;

function onHeadPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
  raise();
  const rect = panelRef.value?.getBoundingClientRect();
  if (!rect) return;
  drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top, moved: false };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onHeadPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  // A click is not a drag: three pixels of slop before the panel detaches from the centre.
  if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
  drag.moved = true;
  detach();
  const rect = panelRef.value?.getBoundingClientRect();
  position.value = clampToViewport(
    { x: drag.originX + dx, y: drag.originY + dy },
    { width: rect?.width ?? 0, height: rect?.height ?? 0 },
    { width: window.innerWidth, height: window.innerHeight },
  );
}

function onHeadPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.moved) remember();
  drag = null;
}

// ---- keyboard -----------------------------------------------------------------------------

function onKeydown(e: KeyboardEvent): void {
  // Escape closes, and stops there: the sequencer binds most of the keyboard, and a dialog that
  // let those keys through would place effects behind itself while you were typing in it. A
  // pinned panel is a tool window, not a dialog - it stays until you close it.
  if (e.key !== "Escape" || pinned.value) return;
  e.stopPropagation();
  emit("close");
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown, true);
  const saved = props.id ? loadPlacement(storage, props.id) : null;
  if (!saved) return;
  floating.value = true;
  pinned.value = saved.pinned;
  position.value = saved;
  await nextTick();
  const rect = panelRef.value?.getBoundingClientRect();
  position.value = clampToViewport(
    saved,
    { width: rect?.width ?? 0, height: rect?.height ?? 0 },
    { width: window.innerWidth, height: window.innerHeight },
  );
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <Teleport to="body">
    <!-- Pinned: no backdrop, the page underneath is live. Otherwise clicking the backdrop closes;
         clicking inside must not, or every click in the panel would shut it - `.self` is what
         distinguishes the two. -->
    <div class="modal-backdrop" :class="{ pinned }" :style="{ zIndex }" @click.self="pinned || emit('close')">
      <div
        ref="panelRef"
        class="modal-panel"
        :class="{ wide, floating, pinned }"
        :style="style"
        role="dialog"
        :aria-modal="!pinned"
        :aria-label="title"
        @pointerdown="raise"
      >
        <header
          class="modal-head"
          title="Drag to move. Double-click to put it back in the middle."
          @pointerdown="onHeadPointerDown"
          @pointermove="onHeadPointerMove"
          @pointerup="onHeadPointerUp"
          @pointercancel="onHeadPointerUp"
          @dblclick="recenter"
        >
          <h2>{{ title }}</h2>
          <div class="modal-tools">
            <button
              v-if="popout"
              type="button"
              class="tool"
              title="Open in its own window"
              aria-label="Open in its own window"
              @click="popout()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
            </button>
            <button
              type="button"
              class="tool"
              :class="{ on: pinned }"
              :title="pinned ? 'Unpin: back to a dialog' : 'Pin: keep it open while you work underneath'"
              :aria-pressed="pinned"
              aria-label="Pin panel"
              @click="togglePin"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6" /></svg>
            </button>
            <button type="button" class="tool close" title="Close (Esc)" aria-label="Close" @click="emit('close')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
            </button>
          </div>
        </header>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: rgba(0, 0, 0, 0.55);
  animation: backdrop-in 150ms ease-out;
}
@keyframes backdrop-in {
  from {
    opacity: 0;
  }
}
/* Pinned: the backdrop stops being a thing. Only the panel itself takes the pointer. */
.modal-backdrop.pinned {
  background: none;
  pointer-events: none;
  animation: none;
}
.modal-panel {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  /* Never taller than the window: the body scrolls instead, so a long list can't put the close
     button somewhere unreachable. */
  max-height: 100%;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  pointer-events: auto;
  overflow: hidden;
  text-align: left;
}
.modal-panel.wide {
  width: min(900px, 100%);
}
.modal-panel.floating {
  position: fixed;
  max-height: calc(100vh - 16px);
  /* A floating panel can be sized like a window. Native, and it costs nothing. */
  resize: both;
  min-width: 320px;
  min-height: 120px;
}
.modal-panel.pinned {
  border-color: var(--accent);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 0.5rem 0.45rem 0.9rem;
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.modal-head:active {
  cursor: grabbing;
}
.modal-head h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text);
}
.modal-tools {
  display: flex;
  gap: 0.15rem;
}
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.tool svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tool:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.tool.on {
  color: var(--accent);
}
.tool.close:hover {
  color: var(--danger);
}
.modal-body {
  overflow-y: auto;
  padding: 0.9rem;
}
</style>
