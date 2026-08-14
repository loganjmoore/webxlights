<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, type ModelGroupRecord, type ModelRecord, type SequenceRecord } from "../lib/api";
import { openPreviewChannel, postPreviewMessage, type PreviewMessage } from "../lib/previewChannel";
import ModelVideoExport from "../components/ModelVideoExport.vue";

// A panel torn off into its own window. xLights lets its docked panels move to a second monitor;
// the popped-out preview already showed the pattern here, and this is that pattern made general.
//
// A real route rather than a detached component, for the same reason the preview is: it survives
// a reload, and it can be bookmarked onto the screen it belongs on.
//
// The sequencer stays the source of truth. This window asks for a snapshot when it opens and
// re-renders from whatever it is sent, which is why it needs no save path of its own - a panel
// that could write would be a second writer racing the tab that owns the autosave.

const route = useRoute();
const sequenceId = computed(() => Number(route.params.sequenceId));
const panel = computed(() => String(route.params.panel));

const sequence = ref<SequenceRecord | null>(null);
const models = ref<ModelRecord[]>([]);
const groups = ref<ModelGroupRecord[]>([]);
const body = ref<SequenceRecord["body"]>({ rows: [], timingTracks: [] });
const connected = ref(false);

let channel: BroadcastChannel | null = null;

function onMessage(e: MessageEvent<PreviewMessage>): void {
  const message = e.data;
  if (message.type !== "snapshot") return;
  connected.value = true;
  models.value = message.models;
  groups.value = message.groups;
  body.value = message.body;
  if (sequence.value) sequence.value = { ...sequence.value, frame_ms: message.frameMs, duration_ms: message.durationMs, name: message.name };
}

onMounted(async () => {
  sequence.value = await api.getSequence(sequenceId.value);
  body.value = sequence.value.body;
  channel = openPreviewChannel(sequenceId.value);
  channel?.addEventListener("message", onMessage);
  // The tab that owns the sequence can't know this window exists until it says so - a window
  // opened from a bookmark was never told to broadcast.
  postPreviewMessage(channel, { type: "hello" });
});

onBeforeUnmount(() => {
  channel?.removeEventListener("message", onMessage);
  channel?.close();
});
</script>

<template>
  <div class="panel-window">
    <header>
      <h1>{{ sequence?.name ?? "Sequence" }}</h1>
      <span class="link" :class="{ live: connected }">{{ connected ? "Live" : "Waiting for the sequencer…" }}</span>
    </header>

    <ModelVideoExport v-if="panel === 'video'" :models="models" :body="body" :sequence="sequence" />
    <p v-else class="unknown">There's no panel called "{{ panel }}".</p>
  </div>
</template>

<style scoped>
.panel-window {
  padding: 0.6rem;
  font-family: system-ui, sans-serif;
}
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
h1 {
  font-size: 0.95rem;
  margin: 0;
}
.link {
  font-size: 0.7rem;
  color: #999;
}
.link.live {
  color: #3a8a4a;
}
.unknown {
  color: #888;
  font-size: 0.8rem;
}
</style>
