<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

// A settings pane as a dialog over the page rather than a strip pushed into it.
//
// These panels used to be siblings of the grid, so opening one reflowed everything below it and
// the sequencer you were working in jumped. Several of them are also tall enough to push the grid
// off the bottom of the screen, which is the opposite of what a settings panel is for.
//
// Teleported to <body> so a panel can't be clipped by whatever it happens to be declared inside -
// the sequencer's panels sit inside a flex column with `overflow: hidden`, which would otherwise
// crop a dialog the moment it was taller than its container.

const props = defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent): void {
  // Escape closes, and stops there: the sequencer binds most of the keyboard, and a dialog that
  // let those keys through would place effects behind itself while you were typing in it.
  if (e.key !== "Escape") return;
  e.stopPropagation();
  emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
void props;
</script>

<template>
  <Teleport to="body">
    <!-- Clicking the backdrop closes; clicking inside must not, or every click in the panel would
         shut it. `.self` is what distinguishes the two. -->
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-panel" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
        <header class="modal-head">
          <h2>{{ title }}</h2>
          <button type="button" class="modal-close" title="Close (Esc)" @click="emit('close')">×</button>
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
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: rgba(0, 0, 0, 0.55);
}
.modal-panel {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  /* Never taller than the window: the body scrolls instead, so a long list can't put the close
     button somewhere unreachable. */
  max-height: 100%;
  background: #16161c;
  border: 1px solid #3a3a44;
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
}
.modal-panel.wide {
  width: min(900px, 100%);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid #2c2c34;
}
.modal-head h2 {
  margin: 0;
  font-size: 0.95rem;
  color: #e8e8ef;
}
.modal-close {
  background: none;
  border: none;
  color: #9a9aa6;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.25rem;
}
.modal-close:hover {
  color: #e8e8ef;
}
.modal-body {
  overflow-y: auto;
  padding: 0.9rem;
}
</style>
