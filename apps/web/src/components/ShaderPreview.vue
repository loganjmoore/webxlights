<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { compileCached, paletteColorValues, rgba, type RGBA } from "@webxlights/engine";
import { parseIsf } from "@webxlights/formats";
import { defaultInputs } from "../lib/shaderDraft";

// A shader, running.
//
// Renders at the buffer size a real prop would use rather than at the size of the box on screen,
// then scales that up with nearest-neighbour. That is the whole point: a shader that looks superb
// at 400x300 and turns to noise at 40x30 is a shader that will not work in a yard, and a preview
// that hides the difference is worse than no preview. What you see here is what the lights do.
const props = withDefaults(
  defineProps<{
    source: string;
    width?: number;
    height?: number;
    inputs?: Record<string, number | boolean | number[]>;
    palette?: RGBA[];
    /** Colour-input names in declaration order, so the palette drives them the way xLights does. */
    colorInputs?: string[];
    /** Paused cards cost nothing - a gallery of thirty running shaders would melt a laptop. */
    running?: boolean;
  }>(),
  { width: 48, height: 32, running: true },
);

// The header's own DEFAULTs, for a card that was given no inputs. Without them every float
// uniform is zero - a candy cane with zero stripes is a solid colour - which is not the shader.
const headerDefaults = computed(() => {
  try {
    return defaultInputs(parseIsf(props.source));
  } catch {
    return {};
  }
});

const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref<string | null>(null);
let raf = 0;
let startedAt = 0;
let frame = 0;

const DEFAULT_PALETTE: RGBA[] = [
  rgba(255, 40, 40, 255),
  rgba(40, 120, 255, 255),
  rgba(255, 200, 60, 255),
  rgba(60, 220, 120, 255),
];

function draw(now: number): void {
  const el = canvas.value;
  if (!el) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const compiled = compileCached(props.source);
  if ("error" in compiled) {
    error.value = compiled.error;
    return;
  }
  error.value = null;

  if (startedAt === 0) startedAt = now;
  const pixels = compiled.shader.render({
    width: props.width,
    height: props.height,
    timeSeconds: (now - startedAt) / 1000,
    position01: 0,
    frameIndex: frame++,
    palette: props.palette ?? DEFAULT_PALETTE,
    inputs: props.colorInputs?.length
      ? { ...headerDefaults.value, ...(props.inputs ?? {}), ...paletteColorValues(props.colorInputs, props.palette ?? DEFAULT_PALETTE) }
      : { ...headerDefaults.value, ...(props.inputs ?? {}) },
  });
  if (!pixels) return;

  // The shader's row 0 is the bottom (the engine's convention); a canvas ImageData's row 0 is the
  // top. Flipped here rather than in the host, because the host's output feeds the light
  // renderer - where bottom-up is correct - and only this one consumer is a canvas.
  const image = ctx.createImageData(props.width, props.height);
  for (let y = 0; y < props.height; y++) {
    const src = (props.height - 1 - y) * props.width * 4;
    const dst = y * props.width * 4;
    for (let i = 0; i < props.width * 4; i++) image.data[dst + i] = pixels[src + i]!;
  }
  ctx.putImageData(image, 0, 0);

  if (props.running) raf = requestAnimationFrame(draw);
}

function start(): void {
  cancelAnimationFrame(raf);
  startedAt = 0;
  frame = 0;
  raf = requestAnimationFrame(draw);
}

onMounted(start);
onBeforeUnmount(() => cancelAnimationFrame(raf));
// A new shader restarts the clock; a paused card draws one frame so it isn't blank.
watch(() => [props.source, props.running], start);
watch(() => props.inputs, () => { if (!props.running) requestAnimationFrame(draw); }, { deep: true });
</script>

<template>
  <div class="shader-preview">
    <canvas ref="canvas" :width="width" :height="height" />
    <p v-if="error" class="err" :title="error">Will not compile</p>
  </div>
</template>

<style scoped>
.shader-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}
canvas {
  width: 100%;
  height: 100%;
  /* Nearest-neighbour: smoothing would hide exactly the aliasing this preview exists to show. */
  image-rendering: pixelated;
  display: block;
}
.err {
  position: absolute;
  inset: auto 0 0 0;
  margin: 0;
  padding: 0.2rem 0.4rem;
  background: #5a1d1d;
  color: #ffd9d9;
  font-size: 0.7rem;
  text-align: center;
}
</style>
