<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { DEFAULT_PALETTE_HEX, type StoredSwatch } from "@webxlights/engine";
import PaletteChip from "./PaletteChip.vue";
import { effectIcon } from "../lib/effectIcons";
import { pickerItems, samePalette, type PickerAnchor } from "../lib/effectPicker";

// The effect picker: what opens where a span was just dragged out on the grid (lib/effectPicker.ts).
//
// It is built for the hand that is already on the keyboard after the drag: the search field has
// focus, the most used effects are the first rows, arrows move, Enter places. The mouse works for
// all of it too, but nothing here needs it.
//
// Colours ride along with the choice rather than being a second trip to the Colors panel: pick a
// palette chip and the effect arrives already wearing it.

const props = defineProps<{
  /** The row the span is on (or the button that asked). The panel opens beside it. */
  anchor: PickerAnchor;
  effectNames: string[];
  usage: { name: string; count: number }[];
  /** The palettes on offer: saved ones first, then the sequence's most used. */
  palettes: StoredSwatch[][];
  /** The palette the effect will be given, or null for the effect's own default. */
  palette: StoredSwatch[] | null;
}>();
const emit = defineEmits<{ pick: [name: string]; "update:palette": [palette: StoredSwatch[] | null]; close: [] }>();

const query = ref("");
const highlighted = ref(0);
const panelRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const items = computed(() => pickerItems(props.effectNames, props.usage, query.value));

// Headings only while browsing. Once there is a query the list is one ranking, and a heading
// between the best match and the second best would be in the way.
function headingAt(index: number): string | null {
  if (query.value.trim() !== "" || !items.value[0]?.mostUsed) return null;
  if (index === 0) return "Most used in this sequence";
  return items.value[index - 1]?.mostUsed && !items.value[index]?.mostUsed ? "All effects" : null;
}

watch(items, () => {
  highlighted.value = 0;
});
watch(highlighted, async () => {
  await nextTick();
  listRef.value?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
});

function move(delta: number): void {
  const count = items.value.length;
  if (count === 0) return;
  // Wraps, so holding the down arrow at the end of a short list doesn't feel stuck.
  highlighted.value = (highlighted.value + delta + count) % count;
}

function pickHighlighted(): void {
  const item = items.value[highlighted.value];
  if (item) emit("pick", item.name);
}

// The list scrolls under a pointer that isn't moving when the arrow keys are driving, and the
// browser reports that as the mouse entering a new row. Only a pointer that actually moved gets
// to take the highlight away from the keyboard.
let lastPointer = "";
function onRowPointerMove(e: PointerEvent, index: number): void {
  const at = `${e.clientX},${e.clientY}`;
  if (at === lastPointer) return;
  lastPointer = at;
  highlighted.value = index;
}

// Chip 0 is the effect's own default, so there is always a way back to "no palette".
const chips = computed<(StoredSwatch[] | null)[]>(() => [null, ...props.palettes]);
function isChosen(chip: StoredSwatch[] | null): boolean {
  return chip === null || props.palette === null ? chip === props.palette : samePalette(chip, props.palette);
}
function chipHint(chip: StoredSwatch[] | null, index: number): string {
  return [chip === null ? "the effect's default" : "", index < 9 ? `Alt+${index + 1}` : ""].filter(Boolean).join(", ");
}
function choosePalette(chip: StoredSwatch[] | null): void {
  emit("update:palette", chip);
  // Back to the search field: a palette is a detour, and Enter should still place the effect.
  inputRef.value?.focus();
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    pickHighlighted();
  }
}

function onPanelKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
    return;
  }
  // Alt and a digit picks a palette without leaving the search field. `code` first: on a Mac
  // Option turns the digits into symbols, so `key` is only right where `code` is missing.
  const digit = e.altKey ? (/^Digit([1-9])$/.exec(e.code) ?? /^([1-9])$/.exec(e.key)) : null;
  if (digit) {
    const chip = chips.value[Number(digit[1]) - 1];
    if (chip !== undefined) {
      e.preventDefault();
      choosePalette(chip);
    }
    return;
  }
  // The page behind is covered, so Tab stays in here instead of wandering into it.
  if (e.key === "Tab" && panelRef.value) {
    const focusable = [...panelRef.value.querySelectorAll<HTMLElement>("input, button")];
    const edge = e.shiftKey ? focusable[0] : focusable[focusable.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? focusable[focusable.length - 1] : focusable[0])?.focus();
    }
  }
}

// Below the row when there is room, above it when there isn't - never over the row itself, which
// is the thing being decided about. Measured once: the panel is a fixed size so that it doesn't
// jump about as the list narrows.
const GAP_PX = 6;
const position = ref({ left: props.anchor.x, top: props.anchor.bottom + GAP_PX });
onMounted(() => {
  const panel = panelRef.value;
  if (panel) {
    const { width, height } = panel.getBoundingClientRect();
    const below = props.anchor.bottom + GAP_PX;
    const top = below + height <= window.innerHeight - 8 ? below : props.anchor.top - GAP_PX - height;
    position.value = {
      left: Math.max(8, Math.min(props.anchor.x, window.innerWidth - width - 8)),
      top: Math.max(8, top),
    };
  }
  inputRef.value?.focus();
});

// The second click of a double-click lands here rather than on the placeholder that the first one
// opened this from, and would close it again before it had been seen.
function onCatcherClick(e: MouseEvent): void {
  if (e.detail < 2) emit("close");
}
</script>

<template>
  <!-- A full-screen catcher, as the effect wheel has: a click off the picker dismisses it rather
       than landing on the grid underneath. -->
  <div class="picker-catcher" @click.self="onCatcherClick" @contextmenu.prevent="emit('close')">
    <div
      ref="panelRef"
      class="picker"
      role="dialog"
      aria-label="Choose an effect"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @keydown="onPanelKeydown"
    >
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="effect-picker-list"
        aria-autocomplete="list"
        :aria-activedescendant="items.length ? `effect-picker-option-${highlighted}` : undefined"
        aria-label="Search effects"
        placeholder="Search effects…"
        autocomplete="off"
        spellcheck="false"
        @keydown="onInputKeydown"
      />
      <div class="colors" role="group" aria-label="Colors">
        <span class="colors-label">Colors</span>
        <div class="chips">
          <template v-for="(chip, i) in chips" :key="i">
            <PaletteChip
              :palette="chip ?? DEFAULT_PALETTE_HEX"
              :selected="isChosen(chip)"
              :hint="chipHint(chip, i)"
              @click="choosePalette(chip)"
            />
          </template>
        </div>
      </div>
      <ul id="effect-picker-list" ref="listRef" role="listbox" aria-label="Effects">
        <template v-for="(item, i) in items" :key="item.name">
          <li v-if="headingAt(i)" class="heading" role="presentation">{{ headingAt(i) }}</li>
          <li
            :id="`effect-picker-option-${i}`"
            role="option"
            :aria-selected="i === highlighted"
            :class="{ on: i === highlighted }"
            @pointermove="onRowPointerMove($event, i)"
            @click="emit('pick', item.name)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" v-html="effectIcon(item.name)"></svg>
            <span class="name">{{ item.name }}</span>
            <span v-if="item.count" class="count" :title="`Used ${item.count} times in this sequence`">{{ item.count }}</span>
          </li>
        </template>
        <li v-if="items.length === 0" class="empty" role="presentation">No effect matches "{{ query }}".</li>
      </ul>
      <p class="keys">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> place</span>
        <span><kbd>Esc</kbd> decide later</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.picker-catcher {
  position: fixed;
  inset: 0;
  z-index: 95;
}
.picker {
  position: fixed;
  display: flex;
  flex-direction: column;
  width: 320px;
  background: var(--bg-control);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  /* The page centres its text; a list of names reads from the left. */
  text-align: left;
}
.picker input {
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: inherit;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.85rem;
  outline: none;
}
.colors {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.7rem;
  border-bottom: 1px solid var(--border);
}
.colors-label,
.heading {
  color: var(--text-muted);
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.chips {
  display: flex;
  /* Wrapped rather than scrolled: a palette scrolled out of sight is one that can't be chosen. */
  flex-wrap: wrap;
  gap: 0.35rem;
}
.picker ul {
  list-style: none;
  margin: 0;
  padding: 0.2rem 0;
  /* A fixed height, so the panel stays put while the list narrows. Shorter on a short window, so
     there is still room for the whole panel either above or below the row it opened from. */
  height: min(264px, 28vh);
  overflow-y: auto;
}
.picker li {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.picker li.heading,
.picker li.empty {
  cursor: default;
}
.picker li.heading {
  padding-top: 0.45rem;
}
.picker li.empty {
  color: var(--text-muted);
}
.picker li.on {
  background: var(--bg-hover);
}
.picker li svg {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}
.picker li.on svg {
  color: var(--accent);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  color: var(--text-muted);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}
.keys {
  display: flex;
  gap: 0.9rem;
  margin: 0;
  padding: 0.35rem 0.7rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.65rem;
  white-space: nowrap;
}
.keys kbd {
  margin-right: 0.2rem;
  padding: 0 0.25rem;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 0.6rem;
}
</style>
