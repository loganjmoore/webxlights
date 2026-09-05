<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

// A desktop-style drop-down menu: one labelled button, a list underneath.
//
// The sequencer's header had grown to twenty-two buttons in two wrapping rows - every panel,
// every export, every setting, all at the same weight. A menu bar is how a desktop editor keeps
// that many commands reachable without making you read all of them first, and it is what an
// xLights user already expects.

export type MenuItem =
  | { kind: "separator" }
  | {
      kind?: "item";
      label: string;
      run: () => void;
      /** Shown as a tick: the panel this opens is currently open. */
      checked?: boolean;
      /** The key that also does this, written the way the palette writes it. */
      shortcut?: string;
      disabled?: boolean;
      /** A second action on the same row - "open in its own window". */
      aside?: { label: string; title: string; run: () => void };
    };

const props = defineProps<{
  label: string;
  items: MenuItem[];
  /** The button reads as "something is open" - a tick somewhere in the list. */
  active?: boolean;
}>();

const open = ref(false);
const highlighted = ref(-1);
const buttonRef = ref<HTMLButtonElement | null>(null);
const listRef = ref<HTMLUListElement | null>(null);
const position = ref({ left: 0, top: 0 });

const selectable = computed(() => props.items.map((item, i) => ({ item, i })).filter(({ item }) => item.kind !== "separator" && !item.disabled));

function place(): void {
  const rect = buttonRef.value?.getBoundingClientRect();
  if (!rect) return;
  // Fixed to the viewport, so it is never clipped by a toolbar that scrolls or hides overflow.
  position.value = { left: rect.left, top: rect.bottom + 4 };
}

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (!open.value) return;
  place();
  highlighted.value = -1;
  await nextTick();
  listRef.value?.focus();
}

function close(): void {
  open.value = false;
}

function run(item: MenuItem): void {
  if (item.kind === "separator" || item.disabled) return;
  close();
  item.run();
}

function onDocumentPointer(e: PointerEvent): void {
  const target = e.target as Node;
  if (buttonRef.value?.contains(target) || listRef.value?.contains(target)) return;
  close();
}

function onKeydown(e: KeyboardEvent): void {
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    buttonRef.value?.focus();
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const options = selectable.value;
    if (options.length === 0) return;
    const current = options.findIndex(({ i }) => i === highlighted.value);
    const next = (current + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    highlighted.value = options[next]!.i;
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    const item = props.items[highlighted.value];
    if (!item) return;
    e.preventDefault();
    run(item);
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("pointerdown", onDocumentPointer, true);
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("resize", close);
  } else {
    document.removeEventListener("pointerdown", onDocumentPointer, true);
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("resize", close);
  }
});
onBeforeUnmount(() => {
  open.value = false;
});
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="menu-button"
    :class="{ open, active }"
    aria-haspopup="menu"
    :aria-expanded="open"
    @click="toggle"
  >
    {{ label }}<span class="caret" aria-hidden="true">▾</span>
  </button>
  <Teleport to="body">
    <ul
      v-if="open"
      ref="listRef"
      class="menu"
      role="menu"
      tabindex="-1"
      :aria-label="label"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    >
      <template v-for="(item, i) in items" :key="i">
        <li v-if="item.kind === 'separator'" class="separator" role="separator"></li>
        <li
          v-else
          class="item"
          :class="{ highlighted: highlighted === i, disabled: item.disabled }"
          :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
          :aria-checked="item.checked === undefined ? undefined : item.checked"
          :aria-disabled="item.disabled || undefined"
          @pointerenter="highlighted = i"
          @click="run(item)"
        >
          <span class="tick" aria-hidden="true">{{ item.checked ? "✓" : "" }}</span>
          <span class="label">{{ item.label }}</span>
          <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
          <button
            v-if="item.aside"
            type="button"
            class="aside"
            :title="item.aside.title"
            :aria-label="item.aside.title"
            @click.stop="close(); item.aside.run()"
          >
            {{ item.aside.label }}
          </button>
        </li>
      </template>
    </ul>
  </Teleport>
</template>

<style scoped>
.menu-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  font: inherit;
  font-size: 0.8rem;
  white-space: nowrap;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: pointer;
}
.menu-button:hover,
.menu-button.open {
  border-color: var(--accent);
  color: var(--accent);
}
.menu-button.active {
  border-color: var(--accent);
}
.caret {
  font-size: 0.65em;
  opacity: 0.7;
}
.menu {
  position: fixed;
  z-index: 200;
  min-width: 220px;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-family: var(--sans);
  font-size: 0.8rem;
  text-align: left;
  outline: none;
  animation: menu-in 150ms ease-out;
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem 0.3rem 0.35rem;
  border-radius: var(--radius);
  color: var(--text);
  cursor: pointer;
}
.item.highlighted {
  background: var(--bg-hover);
}
.item.disabled {
  color: var(--text-dim);
  cursor: default;
}
.tick {
  width: 1em;
  color: var(--accent);
  text-align: center;
}
.label {
  flex: 1;
  white-space: nowrap;
}
kbd {
  font-family: var(--sans);
  font-size: 0.7rem;
  color: var(--text-dim);
}
.aside {
  font: inherit;
  font-size: 0.7rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.aside:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.separator {
  height: 1px;
  margin: 0.3rem 0.25rem;
  background: var(--border);
}
</style>
