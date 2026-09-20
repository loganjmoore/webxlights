<script setup lang="ts">
import { computed } from "vue";
import type { StoredSwatch } from "@webxlights/engine";
import { swatchHex } from "../lib/effectPicker";

// A whole palette as one button: its colours side by side, in order. Shared by the effect picker
// and the Colors panel, so a palette looks the same wherever it can be chosen.

const props = withDefaults(
  defineProps<{
    palette: readonly StoredSwatch[];
    /** Set where the chip is a choice among several; left off where it is only an action. */
    selected?: boolean;
    /** Goes after the colours in the tooltip: a shortcut, or what a click does. */
    hint?: string;
  }>(),
  // Vue would otherwise cast a missing boolean to false, and an action would announce "not pressed".
  { selected: undefined },
);

const colors = computed(() => props.palette.map(swatchHex));
const label = computed(() => `Palette ${colors.value.join(", ")}`);
</script>

<template>
  <button type="button" class="palette-chip" :class="{ selected }" :aria-pressed="selected" :aria-label="label" :title="hint ? `${label} (${hint})` : label">
    <span v-for="(color, i) in colors" :key="i" :style="{ background: color }"></span>
  </button>
</template>

<style scoped>
.palette-chip {
  display: inline-flex;
  flex: none;
  height: 20px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: none;
  cursor: pointer;
}
.palette-chip span {
  width: 11px;
}
.palette-chip:hover {
  border-color: var(--text-muted);
}
/* The accent marks the palette in force, which is what the accent is for. */
.palette-chip.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
</style>
