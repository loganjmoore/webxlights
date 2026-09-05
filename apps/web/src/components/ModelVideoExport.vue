<script setup lang="ts">
import { computed, ref } from "vue";
import {
  DEFAULT_PALETTE,
  computeGeometryFromAttrs,
  createRowSequencer,
  type AudioSeries,
} from "@webxlights/engine";
import type { ModelRecord, SequenceBody, SequenceRecord } from "../lib/api";
import { canExportVideo, downloadVideo, pickMimeType, recordCanvas } from "../lib/videoExport";
import { toRenderableEffects } from "../lib/renderableEffects";

// xLights' Export Model as Video. It answers the question the house preview can't: "what will
// this prop actually look like?", as something you can send to someone who isn't at the app.
//
// One model at a time, drawn into its own canvas at its buffer's shape. A whole-house video would
// need the 3D scene captured instead, which is a different job; per-model is what the manual's
// own command does and what people share.

const props = defineProps<{
  models: ModelRecord[];
  body: SequenceBody;
  sequence: SequenceRecord | null;
  audio?: AudioSeries;
}>();

const SEED = 12345;
const CELL = 12; // px per node, so a 16-wide matrix comes out a reasonable size

const selectedId = ref<number | null>(null);
const progress = ref(0);
const busy = ref(false);
const error = ref("");
const canvasRef = ref<HTMLCanvasElement | null>(null);

const supported = computed(() => props.models.filter((m) => m.supported));
const selected = computed(() => supported.value.find((m) => m.id === selectedId.value) ?? null);
const encodable = canExportVideo();

async function exportVideo(): Promise<void> {
  const model = selected.value;
  const canvas = canvasRef.value;
  const sequence = props.sequence;
  if (!model || !canvas || !sequence) return;

  error.value = "";
  const geometry = (() => {
    try {
      return computeGeometryFromAttrs(model.type, model.raw_attrs);
    } catch {
      return null;
    }
  })();
  if (!geometry || geometry.nodes.length === 0) {
    error.value = `"${model.name}" has no geometry to render.`;
    return;
  }

  canvas.width = Math.max(1, geometry.width) * CELL;
  canvas.height = Math.max(1, geometry.height) * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const effects = toRenderableEffects(
    props.body.rows.filter((r) => r.elementType === "model" && r.elementId === model.id).flatMap((r) => r.effects),
    { timingTracks: props.body.timingTracks, model },
  );

  // One sequencer for the whole export, called in order - the same reason the .fseq export uses
  // one: a fresh renderRowAtMs per frame replays every stateful effect from its start each time,
  // which turns a minute of video into minutes of waiting.
  const sequencer = createRowSequencer({ geometry, effects }, sequence.frame_ms, SEED, DEFAULT_PALETTE, props.audio);
  const frameCount = Math.max(1, Math.ceil(sequence.duration_ms / sequence.frame_ms));

  busy.value = true;
  progress.value = 0;
  try {
    const blob = await recordCanvas(canvas, {
      frameMs: sequence.frame_ms,
      frameCount,
      onProgress: (f) => {
        progress.value = f;
      },
      drawFrame: (index) => {
        const colors = sequencer.renderFrameAt(index * sequence.frame_ms);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        geometry.nodes.forEach((node, i) => {
          const c = colors[i];
          if (!c || c.a === 0) return;
          const brightness = c.a / 255;
          ctx.fillStyle = `rgb(${Math.round(c.r * brightness)},${Math.round(c.g * brightness)},${Math.round(c.b * brightness)})`;
          // The buffer is y-up and the canvas y-down, so the row is flipped - otherwise the video
          // would be a mirror of what the preview shows.
          ctx.fillRect(node.bufX * CELL, (geometry.height - 1 - node.bufY) * CELL, CELL, CELL);
        });
      },
    });
    const mimeType = pickMimeType() ?? "video/webm";
    downloadVideo(blob, `${sequence.name} - ${model.name}`, mimeType);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Couldn't record the video.";
  } finally {
    busy.value = false;
    progress.value = 0;
  }
}
</script>

<template>
  <div class="video-export">
    <div class="models-panel-head"><h2>Export a model as video</h2></div>
    <p class="timing-note">
      Renders one model's own frames to a video file — what the prop will actually look like, as
      something you can send to someone who isn't sitting at the app. It records in real time, so
      a three-minute sequence takes three minutes.
    </p>
    <p v-if="!encodable" class="export-error">This browser can't encode video.</p>
    <div class="models-panel-actions">
      <select v-model.number="selectedId" :disabled="busy">
        <option :value="null">Choose a model…</option>
        <option v-for="m in supported" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button :disabled="!encodable || !selected || !sequence || busy" @click="exportVideo">
        {{ busy ? `Recording ${Math.round(progress * 100)}%` : "Record" }}
      </button>
    </div>
    <p v-if="error" class="export-error">{{ error }}</p>
    <!-- Kept in the page rather than off-screen: captureStream on a display:none canvas produces
         nothing in some browsers, and a visible one doubles as the progress you can watch. -->
    <canvas ref="canvasRef" class="preview-canvas" />
  </div>
</template>

<style scoped>
/* This lives inside the Preferences panel and in its own window; both need the same quiet
   section heading and note, so they are styled here rather than borrowed from the page. */
.models-panel-head h2 {
  font-size: 0.85rem;
  margin: 0.25rem 0 0.4rem;
  color: var(--text-muted);
  font-weight: normal;
}
.timing-note {
  margin: 0 0 0.6rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.5;
}
.video-export {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.preview-canvas {
  max-width: 100%;
  border: 1px solid #444;
  background: #000;
  align-self: flex-start;
}
</style>
