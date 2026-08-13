<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRoute } from "vue-router";
import type { AudioSeries } from "@webxlights/engine";
import { api, type ModelRecord, type SequenceBody } from "../lib/api";
import { openPreviewChannel, postPreviewMessage, type PreviewMessage } from "../lib/previewChannel";
import HousePreview from "../components/HousePreview.vue";

// The popped-out house preview. It renders the same sequence the sequencer tab is editing and
// follows its playhead; its own Play/Stop send commands back rather than driving audio here,
// so there's exactly one audio element in play across both windows.

const route = useRoute();
const projectId = computed(() => Number(route.params.projectId));
const sequenceId = computed(() => Number(route.params.sequenceId));

const models = ref<ModelRecord[]>([]);
const body = ref<SequenceBody>({ timingTracks: [], rows: [] });
const frameMs = ref(50);
const durationMs = ref(0);
const name = ref("");
const playheadMs = ref(0);
const playing = ref(false);
const audioLoaded = ref(false);
// Mirrored from the sequencer tab, which does the analysis. This window can't compute it
// itself - it never holds the audio file - and audio-reactive effects would otherwise render
// here as "no audio" while the same frame lights up in the other window.
// shallowRef for the same reason the sequencer uses one: the series is thousands of frames and
// nothing here reads into it reactively (see SequencerPage).
const audio = shallowRef<AudioSeries | null>(null);
const connected = ref(false);

let channel: BroadcastChannel | null = null;
let helloTimer: ReturnType<typeof setInterval> | null = null;

function send(message: PreviewMessage): void {
  postPreviewMessage(channel, message);
}

function play(): void {
  send({ type: "command", action: playing.value ? "pause" : "play" });
}
function stop(): void {
  send({ type: "command", action: "stop" });
}
function seek(ms: number): void {
  send({ type: "command", action: "seek", ms });
}

function onScrub(e: Event): void {
  seek(Number((e.target as HTMLInputElement).value));
}

// Loading straight from the API means the preview still shows the show if the sequencer tab
// isn't open yet - it just won't move until one is.
async function loadOwnData(): Promise<void> {
  const [layouts, sequence] = await Promise.all([api.listLayouts(projectId.value), api.getSequence(sequenceId.value)]);
  const layout = layouts[0];
  if (layout) models.value = await api.listModels(layout.id);
  body.value = sequence.body && sequence.body.rows ? sequence.body : { timingTracks: [], rows: [] };
  frameMs.value = sequence.frame_ms;
  durationMs.value = sequence.duration_ms;
  name.value = sequence.name;
}

function onMessage(e: MessageEvent<PreviewMessage>): void {
  const message = e.data;
  if (message.type === "snapshot") {
    connected.value = true;
    models.value = message.models;
    body.value = message.body;
    frameMs.value = message.frameMs;
    durationMs.value = message.durationMs;
    name.value = message.name;
    audioLoaded.value = message.audioLoaded;
    if (helloTimer) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
  } else if (message.type === "transport") {
    connected.value = true;
    playheadMs.value = message.playheadMs;
    playing.value = message.playing;
  } else if (message.type === "audio") {
    audio.value = message.audio;
  }
}

onMounted(async () => {
  await loadOwnData();
  channel = openPreviewChannel(sequenceId.value);
  channel?.addEventListener("message", onMessage);
  send({ type: "hello" });
  // The sequencer tab may be opened after this one - keep asking until it answers.
  helloTimer = setInterval(() => send({ type: "hello" }), 2000);
});

onBeforeUnmount(() => {
  if (helloTimer) clearInterval(helloTimer);
  channel?.removeEventListener("message", onMessage);
  channel?.close();
});
</script>

<template>
  <main class="preview-page">
    <header>
      <h1>{{ name || "Preview" }}</h1>
      <div class="transport">
        <button :disabled="!connected || !audioLoaded" @click="play">{{ playing ? "Pause" : "Play" }}</button>
        <button :disabled="!connected || !audioLoaded" @click="stop">Stop</button>
        <span class="time">{{ (playheadMs / 1000).toFixed(2) }}s</span>
      </div>
      <input
        class="scrub"
        type="range"
        min="0"
        :max="durationMs || 1"
        step="10"
        :value="playheadMs"
        :disabled="!connected"
        @input="onScrub"
      />
      <span class="status" :class="{ live: connected }">{{ connected ? "Following sequencer" : "Waiting for the sequencer tab" }}</span>
    </header>

    <div class="stage">
      <HousePreview :models="models" :body="body" :playhead-ms="playheadMs" :frame-ms="frameMs" :audio="audio ?? undefined" />
    </div>

    <p v-if="!connected" class="hint">
      Open this sequence in the sequencer and use <strong>Pop out preview</strong> there — this window follows its
      playhead, and its Play/Stop control that tab's audio.
    </p>
  </main>
</template>

<style scoped>
.preview-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #08080b;
  color: #ddd;
  font-family: system-ui, sans-serif;
  text-align: left;
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid #26262e;
}
h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
.transport {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.time {
  color: #888;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.scrub {
  flex: 1;
  min-width: 120px;
}
.status {
  font-size: 0.75rem;
  color: #777;
}
.status.live {
  color: #6fcf97;
}
.stage {
  flex: 1;
  min-height: 0;
}
.hint {
  margin: 0;
  padding: 0.6rem 1rem;
  font-size: 0.8rem;
  color: #999;
  border-top: 1px solid #26262e;
}
</style>
