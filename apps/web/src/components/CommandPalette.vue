<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { searchCommands, type Command } from "../lib/commands";

// xLights' command palette (Ctrl+Shift+K): "searchable access to menu commands and effects".
//
// Built from the same registry the keyboard shortcuts dispatch from, so a command can't be
// reachable by key but missing from here, and every command shows the key it also answers to -
// which is how anyone learns the sixty-odd shortcuts without reading a list of them.

const props = defineProps<{ open: boolean; commands: Command[] }>();
const emit = defineEmits<{ close: [] }>();

const query = ref("");
const highlighted = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const results = computed(() => searchCommands(props.commands, query.value));

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    // Opened fresh each time rather than remembering the last query: the palette is for reaching
    // the thing you want *now*, and a stale filter hides most of it.
    query.value = "";
    highlighted.value = 0;
    await nextTick();
    inputRef.value?.focus();
  },
);
watch(results, () => {
  highlighted.value = 0;
});

function move(delta: number): void {
  if (results.value.length === 0) return;
  const next = highlighted.value + delta;
  // Wraps, so holding the down arrow at the end of a short list doesn't feel stuck.
  highlighted.value = (next + results.value.length) % results.value.length;
}

function runHighlighted(): void {
  const command = results.value[highlighted.value];
  if (!command) return;
  // Closed before running: a command that opens something else would otherwise be immediately
  // covered by the palette it was launched from.
  emit("close");
  command.run();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    runHighlighted();
  } else if (e.key === "Escape") {
    emit("close");
  }
}
</script>

<template>
  <div v-if="open" class="palette-backdrop" @click.self="emit('close')">
    <div class="palette" role="dialog" aria-label="Command palette">
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Search commands and effects…"
        @keydown="onKeydown"
      />
      <ul>
        <li
          v-for="(command, i) in results"
          :key="command.id"
          :class="{ on: i === highlighted }"
          @mouseenter="highlighted = i"
          @click="runHighlighted"
        >
          <span class="group">{{ command.group }}</span>
          <span class="label">{{ command.label }}</span>
          <span v-if="command.keyLabel" class="key">{{ command.keyLabel }}</span>
        </li>
        <li v-if="results.length === 0" class="empty">Nothing matches "{{ query }}".</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  z-index: 100;
}
.palette {
  width: min(560px, 90vw);
  background: #1e1e26;
  color: #eee;
  border: 1px solid #444;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.palette input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #333;
  background: transparent;
  color: inherit;
  padding: 0.6rem 0.7rem;
  font-size: 0.9rem;
  outline: none;
}
.palette ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 45vh;
  overflow-y: auto;
}
.palette li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.palette li.on {
  background: #2c2c38;
}
.group {
  color: #888;
  font-size: 0.7rem;
  width: 5rem;
  flex: none;
}
.label {
  flex: 1;
}
.key {
  color: #999;
  font-size: 0.7rem;
  font-family: ui-monospace, monospace;
}
.empty {
  color: #888;
  cursor: default;
}
</style>
