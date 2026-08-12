<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { activeConfirm, resolveConfirm } from "../lib/confirm";

const confirmButton = ref<HTMLButtonElement | null>(null);
const dialogRef = ref<HTMLDivElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function cancel(): void {
  resolveConfirm(false);
}
function accept(): void {
  resolveConfirm(true);
}

// Esc cancels and Tab is trapped inside the dialog. Captured on window rather than the dialog
// so it works no matter what had focus when the dialog opened (a canvas, say, which is not a
// focusable ancestor of anything).
function onKeydown(e: KeyboardEvent): void {
  if (!activeConfirm.value) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancel();
    return;
  }
  if (e.key !== "Tab") return;

  const focusable = dialogRef.value?.querySelectorAll<HTMLElement>("button");
  if (!focusable || focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => activeConfirm.value,
  async (current) => {
    if (current) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      confirmButton.value?.focus();
    } else {
      // Return focus where it was, so keyboard users aren't dumped back at the top of the page.
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    }
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="activeConfirm" class="confirm-backdrop" @pointerdown.self="cancel">
      <div
        ref="dialogRef"
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title">{{ activeConfirm.title }}</h2>
        <p id="confirm-message">{{ activeConfirm.message }}</p>
        <div class="actions">
          <button type="button" class="cancel" @click="cancel">{{ activeConfirm.cancelLabel ?? "Cancel" }}</button>
          <button
            ref="confirmButton"
            type="button"
            :class="['confirm', { danger: activeConfirm.danger }]"
            @click="accept"
          >
            {{ activeConfirm.confirmLabel ?? "Confirm" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 6, 9, 0.66);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.confirm-dialog {
  background: #16171d;
  border: 1px solid #2c2f39;
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  padding: 1.25rem 1.35rem 1.1rem;
  width: min(420px, 100%);
  color: #e9eaef;
  font-family: system-ui, sans-serif;
}
.confirm-dialog h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}
.confirm-dialog p {
  margin: 0 0 1.15rem;
  font-size: 0.88rem;
  line-height: 1.5;
  color: #a9adbb;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.actions button {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.4rem 0.9rem;
  border-radius: 5px;
  border: 1px solid #343846;
  background: #1e2029;
  color: #e9eaef;
  cursor: pointer;
}
.actions button:hover {
  background: #262933;
}
.actions button:focus-visible {
  outline: 2px solid #e8c468;
  outline-offset: 2px;
}
.actions .confirm {
  background: #e8c468;
  border-color: #e8c468;
  color: #111;
  font-weight: 600;
}
.actions .confirm:hover {
  background: #f0d488;
}
.actions .confirm.danger {
  background: #b4382f;
  border-color: #b4382f;
  color: #fff;
}
.actions .confirm.danger:hover {
  background: #c9433a;
}
</style>
