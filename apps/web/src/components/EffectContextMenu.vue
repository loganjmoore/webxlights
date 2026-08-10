<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{
  x: number;
  y: number;
  items: { label: string; action: string }[];
}>();

const emit = defineEmits<{ action: [action: string]; close: [] }>();

// Clamp on-screen - a menu opened near the right/bottom edge (e.g. right-clicking late in a
// long sequence) would otherwise render partly off the viewport and be unclickable there.
const MENU_WIDTH = 150;
const MENU_HEIGHT_ESTIMATE = 36; // per item, rough - enough margin to keep the last item reachable
const clampedX = computed(() => Math.min(props.x, window.innerWidth - MENU_WIDTH - 8));
const clampedY = computed(() => Math.min(props.y, window.innerHeight - props.items.length * MENU_HEIGHT_ESTIMATE - 8));

function onDocClick(): void {
  emit("close");
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  // capture, and next tick - the pointerdown/contextmenu that opened this menu shouldn't
  // also count as the "click elsewhere" that immediately closes it.
  setTimeout(() => {
    document.addEventListener("click", onDocClick);
    document.addEventListener("contextmenu", onDocClick);
  }, 0);
  document.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("contextmenu", onDocClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="context-menu" :style="{ left: `${clampedX}px`, top: `${clampedY}px` }" @click.stop @contextmenu.stop.prevent>
    <button v-for="item in items" :key="item.action" @click="emit('action', item.action)">{{ item.label }}</button>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 100;
  background: #1e1e24;
  border: 1px solid #333;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  padding: 0.25rem;
  min-width: 140px;
  font-size: 0.8rem;
}
.context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.6rem;
  background: none;
  border: none;
  color: #ddd;
  cursor: pointer;
  border-radius: 3px;
}
.context-menu button:hover {
  background: #2c2c34;
}
</style>
