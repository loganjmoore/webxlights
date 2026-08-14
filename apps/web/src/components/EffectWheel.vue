<script setup lang="ts">
import { computed } from "vue";
import { EFFECT_SHORTCUTS } from "../lib/commands";

// xLights' radial effect wheel: "double-click empty sequencer grid area displays a radial effect
// wheel for quick effect placement".
//
// It exists because the alternative is a trip to the palette on the far side of the screen and
// back. The wheel opens where the pointer already is, so the whole gesture is double-click, flick,
// release - which is what makes it worth having over a menu.
//
// It offers the same effects as the single-letter shortcuts, and in the same order. That isn't a
// shortcut: the wheel and the keyboard are two ways at one set, and a wheel with its own list
// would be a third place for that set to drift.

// The shortcuts in force rather than the defaults: they can be changed now (keybindings.ts), and
// a wheel showing the letter that used to place an effect would be worse than showing none.
const props = defineProps<{ x: number; y: number; shortcuts?: Array<{ key: string; effect: string }> }>();
const emit = defineEmits<{ pick: [effect: string]; close: [] }>();

const RADIUS = 78;
const BUTTON = 26;

const spokes = computed(() => {
  const list = props.shortcuts ?? EFFECT_SHORTCUTS;
  return list.map(({ key, effect }, i) => {
    const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
    return {
      effect,
      key,
      // Positioned from the centre of the button, so the ring is even rather than shifted down
      // and right by half a button.
      left: props.x + Math.cos(angle) * RADIUS - BUTTON / 2,
      top: props.y + Math.sin(angle) * RADIUS - BUTTON / 2,
    };
  });
});
</script>

<template>
  <!-- A full-screen catcher, so a click anywhere off the wheel dismisses it. Without one the wheel
       would stay up while you clicked past it, and the click would land on the grid underneath. -->
  <div class="wheel-catcher" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div class="wheel-hub" :style="{ left: `${x}px`, top: `${y}px` }">＋</div>
    <button
      v-for="spoke in spokes"
      :key="spoke.effect"
      class="wheel-spoke"
      :style="{ left: `${spoke.left}px`, top: `${spoke.top}px` }"
      :title="`${spoke.effect} (${spoke.key})`"
      @click.stop="emit('pick', spoke.effect)"
    >
      {{ spoke.key }}
    </button>
  </div>
</template>

<style scoped>
.wheel-catcher {
  position: fixed;
  inset: 0;
  z-index: 90;
}
.wheel-hub {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #1e1e26;
  color: #888;
  border: 1px solid #444;
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  pointer-events: none;
}
.wheel-spoke {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid #555;
  background: #2c2c38;
  color: #eee;
  font-size: 0.75rem;
  font-family: ui-monospace, monospace;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}
.wheel-spoke:hover {
  background: #ffc878;
  color: #1e1e26;
  border-color: #ffc878;
}
</style>
