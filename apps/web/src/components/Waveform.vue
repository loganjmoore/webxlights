<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { PeakBucket } from "../lib/audio";

const props = defineProps<{
  peaks: PeakBucket[];
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
}>();

const emit = defineEmits<{ seek: [ms: number] }>();

const ROW_LABEL_WIDTH = 140; // stays aligned with SequencerGrid's row-label gutter
const canvasRef = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const mid = rect.height / 2;
  const widthPx = props.durationMs * props.pxPerMs;
  ctx.strokeStyle = "#7aa2c9";
  ctx.beginPath();
  props.peaks.forEach((p, i) => {
    const x = ROW_LABEL_WIDTH + (i / props.peaks.length) * widthPx;
    ctx.moveTo(x, mid + p.min * mid * 0.9);
    ctx.lineTo(x, mid + p.max * mid * 0.9);
  });
  ctx.stroke();

  const px = ROW_LABEL_WIDTH + props.playheadMs * props.pxPerMs;
  ctx.strokeStyle = "#e74c3c";
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, rect.height);
  ctx.stroke();
}

function onClick(e: MouseEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
  if (x < 0) return;
  emit("seek", Math.round(x / props.pxPerMs));
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => [props.peaks, props.playheadMs, props.pxPerMs], draw);
</script>

<template>
  <canvas ref="canvasRef" class="waveform" @click="onClick"></canvas>
</template>

<style scoped>
.waveform {
  width: 100%;
  height: 64px;
  display: block;
  cursor: pointer;
}
</style>
