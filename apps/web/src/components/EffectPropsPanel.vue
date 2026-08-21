<script setup lang="ts">
import { computed, ref } from "vue";
import CollapsibleSection from "./CollapsibleSection.vue";
import {
  DEFAULT_PALETTE_HEX,
  EFFECT_SCHEMAS,
  BLEND_MODES,
  CANVAS_ONLY_EFFECTS,
  TIMING_TRACK_EFFECTS,
  TIMING_DRIVEN_VU_METER_TYPES,
  LAYER_TRANSFORMS,
  RENDER_STYLES,
  PATTERNED_TRANSITION_TYPES,
  TRANSITION_TYPES,
  isColorCurve,
  isValueCurve,
  midiKeyName,
  type BlendMode,
  type ColorAdjust,
  type ColorCurve,
  type PictureImage,
  type StoredSwatch,
  type EffectParamSpec,
  type LayerSettings,
  type LayerTransform,
  type RenderStyle,
  type RotoZoom,
  type SubBuffer,
  type TransitionSpec,
  type TransitionType,
} from "@webxlights/engine";
import type { EffectParamValue, SequenceEffect } from "../lib/api";
import ColorCurveEditor from "./ColorCurveEditor.vue";
import PixelEditor from "./PixelEditor.vue";
import { decodeImageForEffect } from "../lib/pictureImport";
import ShaderPicker from "./ShaderPicker.vue";
import SketchEditor from "./SketchEditor.vue";
import ValueCurveEditor from "./ValueCurveEditor.vue";

// "Some support just one, some support up to 8." Six was wrong, and low enough to have been
// hit by anyone building a rainbow.
const MAX_COLORS = 8;


const props = defineProps<{
  effect: SequenceEffect | null;
  // Choices the schema can't know: the timing tracks this sequence has, and the state definitions
  // the model under this row carries. Both are named by the label-driven effects.
  timingTrackNames?: string[];
  stateDefinitionNames?: string[];
  faceDefinitionNames?: string[];
  /** How many effects are selected, so the palette's "Update" button knows whether to offer itself. */
  selectionSize?: number;
  /** The mouth positions the selected face definition actually has. */
  phonemeNames?: string[];
}>();
const emit = defineEmits<{
  update: [params: Record<string, EffectParamValue>];
  updatePalette: [palette: StoredSwatch[]];
  // The Colour panel's other three controls, which apply to any effect.
  updateColorAdjust: [adjust: ColorAdjust];
  // "The 'Update' button will apply the current colors palettes to all the selected effects."
  applyPaletteToSelection: [];
  updateBlend: [patch: { blendMode?: BlendMode; mix?: number }];
  updateTransition: [transition: TransitionSpec];
  updateLayer: [layer: LayerSettings];
}>();

const schema = computed(() => (props.effect ? EFFECT_SCHEMAS[props.effect.name] : undefined));
const palette = computed(() => props.effect?.palette ?? DEFAULT_PALETTE_HEX);

// Whether the pixel editor is showing. Off by default: it is a big control, and most visits to a
// Pictures effect are to change how the picture moves rather than to redraw it.
const drawing = ref(false);

function imageParam(key: string): PictureImage | undefined {
  const value = props.effect?.params[key];
  return value && typeof value === "object" && "data" in value ? (value as PictureImage) : undefined;
}

async function pickImage(key: string, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    setParam(key, await decodeImageForEffect(file));
  } catch {
    // A file picker is where the wrong file gets chosen; a throw here reaches the error overlay.
  }
}

// A Shader effect carries its shader's source and input values in its own params, so the
// sequence renders without the library being reachable - see ShaderPicker for why.
const shaderInputs = computed(() => {
  const raw = props.effect?.params.inputs;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as unknown as Record<string, number | boolean | number[]>)
    : {};
});

function onPickShader(payload: {
  source: string;
  inputs: Record<string, number | boolean | number[]>;
  shaderId: number;
}): void {
  if (!props.effect) return;
  // All three in one update: source and inputs have to change together, or a frame renders the
  // new shader with the previous shader's uniforms.
  emit("update", {
    ...props.effect.params,
    source: payload.source,
    inputs: payload.inputs as unknown as EffectParamValue,
    shaderId: payload.shaderId,
  });
}

function setParam(key: string, value: EffectParamValue): void {
  if (!props.effect) return;
  emit("update", { ...props.effect.params, [key]: value });
}

function setSwatch(index: number, value: StoredSwatch): void {
  const next = [...palette.value];
  next[index] = value;
  emit("updatePalette", next);
}
function addColor(): void {
  emit("updatePalette", [...palette.value, "#ffffff"]);
}
function removeColor(index: number): void {
  if (palette.value.length <= 1) return;
  emit("updatePalette", palette.value.filter((_, i) => i !== index));
}

// Turning a swatch into a curve starts it at the colour it already was, so the effect looks the
// same the instant it is converted and the first drag is a change rather than a surprise.
function makeCurve(index: number): void {
  const current = palette.value[index];
  const from = typeof current === "string" ? current : "#ffffff";
  setSwatch(index, {
    kind: "colorCurve",
    mode: "Time",
    blend: "Gradient",
    points: [
      { x: 0, color: from },
      { x: 1, color: from },
    ],
  });
}
function unmakeCurve(index: number): void {
  const current = palette.value[index];
  // Keeps the curve's first marker, which is the colour the swatch reads as at the effect's start.
  setSwatch(index, isColorCurve(current) ? (current.points[0]?.color ?? "#ffffff") : "#ffffff");
}
function swatchHex(entry: StoredSwatch): string {
  return typeof entry === "string" ? entry : (entry.points[0]?.color ?? "#ffffff");
}

const colorAdjust = computed<ColorAdjust>(() => props.effect?.colorAdjust ?? {});

const sparkleHex = computed(() => {
  const c = colorAdjust.value.sparkleColor;
  if (!c) return "#ffffff";
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
});

function setColorAdjust(changes: Partial<ColorAdjust>): void {
  emit("updateColorAdjust", { ...colorAdjust.value, ...changes });
}

function setSparkleColor(hex: string): void {
  const value = hex.replace("#", "");
  setColorAdjust({
    sparkleColor: {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    },
  });
}

function setBlendMode(mode: string): void {
  emit("updateBlend", { blendMode: mode as BlendMode });
}
function setMix(pct: string): void {
  emit("updateBlend", { mix: Number(pct) / 100 });
}
// The whole TransitionSpec is emitted every time: SequencerPage replaces `transition` wholesale
// (like every other effect patch), so sending only the changed key would drop the rest.
function patchTransition(changes: Partial<TransitionSpec>): void {
  if (!props.effect) return;
  emit("updateTransition", { ...props.effect.transition, ...changes });
}
function setTransitionMs(field: "inDurationMs" | "outDurationMs", ms: string): void {
  const value = Number(ms);
  if (Number.isNaN(value)) return;
  patchTransition({ [field]: Math.max(0, value) });
}

/**
 * Fade in and fade out, as their own control.
 *
 * A fade is already expressible here - it is the "Fade" transition type with a duration - but only
 * if you know that a fade is a kind of transition, and the two fields that make one are three rows
 * apart. Fading an effect in is much the commoner thing to want than choosing between twenty wipe
 * patterns, so it gets a control that says what it does and sets both halves at once.
 */
const FADE_STEPS_MS = [0, 250, 500, 1000, 2000];

function setFade(edge: "in" | "out", ms: number): void {
  const clamped = Math.max(0, Math.round(ms));
  patchTransition(
    edge === "in"
      ? { inType: "Fade", inDurationMs: clamped }
      : { outType: "Fade", outDurationMs: clamped },
  );
}

/** A fade is showing only when the edge is actually a Fade - a wipe of 500ms is not one. */
function fadeMs(edge: "in" | "out"): number {
  const spec = props.effect?.transition ?? {};
  const type = edge === "in" ? spec.inType ?? "Fade" : spec.outType ?? "Fade";
  if (type !== "Fade") return 0;
  return (edge === "in" ? spec.inDurationMs : spec.outDurationMs) ?? 0;
}

// Kaleidoscope, Warp and Adjust have nothing to work on unless the layer is in Canvas mode -
// they would render an empty layer with no error, which is exactly the kind of silence worth
// spending a line of UI on.
const needsCanvas = computed(
  () => !!props.effect && CANVAS_ONLY_EFFECTS.has(props.effect.name) && props.effect.blendMode !== "Canvas",
);

// A choice whose options come from the sequence rather than the schema (schema.ts's optionsFrom).
function optionsFor(p: EffectParamSpec): string[] {
  if (p.optionsFrom === "timingTracks") return props.timingTrackNames ?? [];
  if (p.optionsFrom === "stateDefinitions") return props.stateDefinitionNames ?? [];
  if (p.optionsFrom === "faceDefinitions") return props.faceDefinitionNames ?? [];
  if (p.optionsFrom === "phonemes") return props.phonemeNames ?? [];
  return p.options ?? [];
}

// State and Piano render nothing at all until they are pointed at a track that exists - the same
// silence the canvas warning covers, and worth the same line of UI.
const missingTimingTrack = computed(() => {
  const effect = props.effect;
  if (!effect) return false;
  // VU Meter is only sometimes timing-driven: fourteen of its types read the marks and the rest
  // read the audio, so the warning follows the Type rather than the effect.
  const drivenByTiming = effect.name === "VU Meter" && TIMING_DRIVEN_VU_METER_TYPES.has(String(effect.params.type ?? ""));
  if (!TIMING_TRACK_EFFECTS.has(effect.name) && !drivenByTiming) return false;
  // An effect told not to use a track is driven by its own State or Phoneme field instead.
  if ((effect.name === "State" || effect.name === "Faces") && effect.params.useTimingTrack === false) return false;
  if (effect.name === "Piano" && effect.params.notesSource === "Audio") return false;
  const chosen = effect.params.timingTrack;
  return typeof chosen !== "string" || !chosen || !(props.timingTrackNames ?? []).includes(chosen);
});

const transition = computed<TransitionSpec>(() => props.effect?.transition ?? {});
// Blinds/Slide Bars/Checkerboard are the types whose "adjust" knob means anything (it sets the
// pattern's density); showing the slider for a Fade would be a control that does nothing.
const inPatterned = computed(() => PATTERNED_TRANSITION_TYPES.has(transition.value.inType ?? "Fade"));
const outPatterned = computed(() => PATTERNED_TRANSITION_TYPES.has(transition.value.outType ?? "Fade"));

const layer = computed<LayerSettings>(() => props.effect?.layer ?? {});
const subBuffer = computed<SubBuffer>(() => layer.value.subBuffer ?? { x1: 0, y1: 0, x2: 100, y2: 100 });

// Same wholesale-replace contract as the transition patch: SequencerPage swaps `layer` out
// entirely, so a partial emit would drop the settings it didn't mention.
function patchLayer(changes: Partial<LayerSettings>): void {
  emit("updateLayer", { ...layer.value, ...changes });
}
function patchSubBuffer(changes: Partial<SubBuffer>): void {
  patchLayer({ subBuffer: { ...subBuffer.value, ...changes } });
}
function resetSubBuffer(): void {
  patchLayer({ subBuffer: { x1: 0, y1: 0, x2: 100, y2: 100 } });
}

// -1 in the box means "no freeze". A frame number can't be negative, so the sentinel can't
// collide with a real one, and it keeps the control a plain number input rather than a checkbox
// plus a number that have to agree with each other.
function freezeFrom(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const rotoZoom = computed<RotoZoom>(() => layer.value.rotoZoom ?? {});
function patchRotoZoom(changes: Partial<RotoZoom>): void {
  patchLayer({ rotoZoom: { ...rotoZoom.value, ...changes } });
}
function resetRotoZoom(): void {
  patchLayer({ rotoZoom: undefined });
}
// Zoom is held as a multiplier but edited as a percentage, because a slider stepping in
// hundredths of a multiplier is unreadable and xLights' own control is a percentage too.
const zoomPct = computed(() => Math.round((rotoZoom.value.zoom ?? 1) * 100));
const rotoZoomTouched = computed(() => (rotoZoom.value.rotation ?? 0) !== 0 || (rotoZoom.value.zoom ?? 1) !== 1);
const subBufferTrimmed = computed(() => {
  const s = subBuffer.value;
  return s.x1 > 0 || s.y1 > 0 || s.x2 < 100 || s.y2 < 100;
});

// A value curve replaces the param's flat value, so the slider is hidden while one is on -
// leaving both visible would show a number that isn't what the effect is rendering.
function hasCurve(key: string): boolean {
  return isValueCurve(props.effect?.params[key]);
}
// Only the numeric sliders have a range for a curve to sweep between. A checkbox or a choice
// has nothing to interpolate, and the schema never marks those as curve-able anyway.
function curveable(p: EffectParamSpec): boolean {
  return Boolean(p.valueCurve) && (p.type === "intSlider" || p.type === "floatSlider");
}
</script>

<template>
  <div class="props-panel">
    <template v-if="!effect">
      <p class="empty">Select an effect to edit its parameters.</p>
    </template>
    <template v-else-if="!schema">
      <p class="empty">"{{ effect.name }}" has no parameter schema yet (render lands in a later milestone).</p>
    </template>
    <template v-else>
      <h3>{{ effect.name }}</h3>

      <CollapsibleSection title="Colors">
        <div class="swatches">
          <div v-for="(entry, i) in palette" :key="i" class="swatch">
            <input
              type="color"
              :value="swatchHex(entry)"
              :disabled="isColorCurve(entry)"
              :title="isColorCurve(entry) ? 'This swatch is a colour curve' : 'Color'"
              @input="setSwatch(i, ($event.target as HTMLInputElement).value)"
            />
            <button
              class="curve-swatch"
              :class="{ on: isColorCurve(entry) }"
              title="Make this colour change over the effect, or across the model"
              @click="isColorCurve(entry) ? unmakeCurve(i) : makeCurve(i)"
            >~</button>
            <button v-if="palette.length > 1" class="remove-swatch" title="Remove color" @click="removeColor(i)">×</button>
          </div>
          <button v-if="palette.length < MAX_COLORS" class="add-swatch" title="Add color" @click="addColor">+</button>
        </div>
        <template v-for="(entry, i) in palette" :key="`curve-${i}`">
          <ColorCurveEditor
            v-if="isColorCurve(entry)"
            :curve="entry as ColorCurve"
            @update="setSwatch(i, $event)"
            @remove="unmakeCurve(i)"
          />
        </template>
      </CollapsibleSection>

      <!-- "From the Color window, you can change the Colors that apply to the effect, as well as
           the Sparkles, Brightness and Contrast values." -->
      <CollapsibleSection title="Colour adjust" :default-open="false">
        <label class="blend-row">
          Sparkles
          <input
            type="range"
            min="0"
            max="100"
            :value="colorAdjust.sparkles ?? 0"
            @input="setColorAdjust({ sparkles: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="blend-row">
          Sparkle colour
          <input type="color" :value="sparkleHex" @input="setSparkleColor(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="blend-row">
          Brightness
          <input
            type="range"
            min="-100"
            max="100"
            :value="colorAdjust.brightness ?? 0"
            @input="setColorAdjust({ brightness: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="blend-row">
          Contrast
          <input
            type="range"
            min="0"
            max="100"
            :value="colorAdjust.contrast ?? 0"
            @input="setColorAdjust({ contrast: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <button v-if="(selectionSize ?? 0) > 1" class="add-swatch" @click="emit('applyPaletteToSelection')">
          Update — apply this palette to all {{ selectionSize }} selected
        </button>
      </CollapsibleSection>

      <CollapsibleSection title="Layer blending" :default-open="false">
        <label class="blend-row">
          Blend Mode
          <select :value="effect.blendMode ?? 'Normal'" @change="setBlendMode(($event.target as HTMLSelectElement).value)">
            <option v-for="m in BLEND_MODES" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>
        <label class="blend-row">
          Mix
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="(effect.mix ?? 0) * 100"
              @input="setMix(($event.target as HTMLInputElement).value)"
            />
            <span class="value">{{ Math.round((effect.mix ?? 0) * 100) }}</span>
          </span>
        </label>
        <label class="blend-row">
          Suppress until frame
          <input
            type="number"
            min="0"
            :value="layer.suppressUntilFrame ?? 0"
            @input="patchLayer({ suppressUntilFrame: Math.max(0, Number(($event.target as HTMLInputElement).value)) })"
          />
        </label>
        <label class="blend-row">
          Freeze at frame
          <input
            type="number"
            min="-1"
            :value="layer.freezeAtFrame ?? -1"
            @input="patchLayer({ freezeAtFrame: freezeFrom(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <p class="hint">
          Suppress hides an effect's first frames while it keeps running underneath, which is how
          an effect with unwanted opening frames is warmed up. Freeze holds one frame for the rest
          of the effect; -1 is off.
        </p>
        <p v-if="missingTimingTrack" class="hint warn">
          {{ effect.name === "VU Meter" ? `The ${effect.params.type} type is` : `${effect.name} is` }} driven by a
          timing track, and this effect isn't pointed at one this sequence has. Until it is, it
          renders nothing.
        </p>
        <p v-if="needsCanvas" class="hint warn">
          {{ effect.name }} modifies the layer below it rather than drawing its own, so it needs
          the Canvas blend mode and a layer underneath. On any other mode it is handed a blank
          buffer and renders nothing.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Transitions & fades">
        <div class="fade-row">
          <label>
            Fade in (ms)
            <input type="number" min="0" step="50" :value="fadeMs('in')" @change="setFade('in', Number(($event.target as HTMLInputElement).value))" />
          </label>
          <span class="fade-steps">
            <button v-for="ms in FADE_STEPS_MS" :key="`in${ms}`" type="button" :class="{ on: fadeMs('in') === ms }" @click="setFade('in', ms)">
              {{ ms === 0 ? "off" : `${ms / 1000}s` }}
            </button>
          </span>
        </div>
        <div class="fade-row">
          <label>
            Fade out (ms)
            <input type="number" min="0" step="50" :value="fadeMs('out')" @change="setFade('out', Number(($event.target as HTMLInputElement).value))" />
          </label>
          <span class="fade-steps">
            <button v-for="ms in FADE_STEPS_MS" :key="`out${ms}`" type="button" :class="{ on: fadeMs('out') === ms }" @click="setFade('out', ms)">
              {{ ms === 0 ? "off" : `${ms / 1000}s` }}
            </button>
          </span>
        </div>
        <p class="fade-note">A fade is a transition of type Fade — the controls below set the same two values, and any other pattern as well.</p>

        <label class="blend-row">
          In
          <select
            :value="transition.inType ?? 'Fade'"
            @change="patchTransition({ inType: ($event.target as HTMLSelectElement).value as TransitionType })"
          >
            <option v-for="t in TRANSITION_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="blend-row">
          In Duration (ms)
          <input
            type="number"
            min="0"
            :value="transition.inDurationMs ?? 0"
            @change="setTransitionMs('inDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="inPatterned" class="blend-row">
          In Adjust
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="transition.inAdjust ?? 50"
              @input="patchTransition({ inAdjust: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ transition.inAdjust ?? 50 }}</span>
          </span>
        </label>
        <label class="blend-row">
          In Reverse
          <input
            type="checkbox"
            :checked="transition.inReverse ?? false"
            @change="patchTransition({ inReverse: ($event.target as HTMLInputElement).checked })"
          />
        </label>

        <label class="blend-row">
          Out
          <select
            :value="transition.outType ?? 'Fade'"
            @change="patchTransition({ outType: ($event.target as HTMLSelectElement).value as TransitionType })"
          >
            <option v-for="t in TRANSITION_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="blend-row">
          Out Duration (ms)
          <input
            type="number"
            min="0"
            :value="transition.outDurationMs ?? 0"
            @change="setTransitionMs('outDurationMs', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="outPatterned" class="blend-row">
          Out Adjust
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="transition.outAdjust ?? 50"
              @input="patchTransition({ outAdjust: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ transition.outAdjust ?? 50 }}</span>
          </span>
        </label>
        <label class="blend-row">
          Out Reverse
          <input
            type="checkbox"
            :checked="transition.outReverse ?? false"
            @change="patchTransition({ outReverse: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <p class="hint">A transition only shows with a duration above 0.</p>
      </CollapsibleSection>

      <CollapsibleSection title="Layer settings" :default-open="false">
        <label class="blend-row">
          Render Style
          <select
            :value="layer.renderStyle ?? 'Default'"
            @change="patchLayer({ renderStyle: ($event.target as HTMLSelectElement).value as RenderStyle })"
          >
            <option v-for="r in RENDER_STYLES" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label class="blend-row">
          Transformation
          <select
            :value="layer.transform ?? 'None'"
            @change="patchLayer({ transform: ($event.target as HTMLSelectElement).value as LayerTransform })"
          >
            <option v-for="t in LAYER_TRANSFORMS" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label class="blend-row">
          Blur
          <span class="blend-inline">
            <input
              type="range"
              min="1"
              max="15"
              :value="layer.blur ?? 1"
              @input="patchLayer({ blur: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ layer.blur ?? 1 }}</span>
          </span>
        </label>
        <label class="blend-row">
          <input
            type="checkbox"
            :checked="layer.persistent === true"
            @change="patchLayer({ persistent: ($event.target as HTMLInputElement).checked })"
          />
          Persistent — each frame layers on top of the last instead of clearing
        </label>

        <p class="hint">
          Roto-zoom — turns and scales what the effect drew, about the pivot. Anything the turn
          uncovers stays transparent, so the layers under it still show through.
        </p>
        <label class="blend-row">
          Rotation
          <span class="blend-inline">
            <input
              type="range"
              min="-180"
              max="180"
              :value="rotoZoom.rotation ?? 0"
              @input="patchRotoZoom({ rotation: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ rotoZoom.rotation ?? 0 }}°</span>
          </span>
        </label>
        <label class="blend-row">
          Zoom
          <span class="blend-inline">
            <input
              type="range"
              min="10"
              max="400"
              :value="zoomPct"
              @input="patchRotoZoom({ zoom: Number(($event.target as HTMLInputElement).value) / 100 })"
            />
            <span class="value">{{ zoomPct }}%</span>
          </span>
        </label>
        <template v-if="rotoZoomTouched">
          <label v-for="axis in (['pivotX', 'pivotY'] as const)" :key="axis" class="blend-row">
            {{ axis === 'pivotX' ? 'Pivot X' : 'Pivot Y' }}
            <span class="blend-inline">
              <input
                type="range"
                min="0"
                max="100"
                :value="rotoZoom[axis] ?? 50"
                @input="patchRotoZoom({ [axis]: Number(($event.target as HTMLInputElement).value) })"
              />
              <span class="value">{{ rotoZoom[axis] ?? 50 }}</span>
            </span>
          </label>
          <button class="reset-sub" @click="resetRotoZoom">No roto-zoom</button>
        </template>

        <p class="hint">
          Sub-buffer — the part of the model this effect draws on, as percentages. The effect
          composes itself into that area rather than being cropped to it.
        </p>
        <label v-for="edge in (['x1', 'y1', 'x2', 'y2'] as const)" :key="edge" class="blend-row">
          {{ { x1: 'Left', y1: 'Bottom', x2: 'Right', y2: 'Top' }[edge] }}
          <span class="blend-inline">
            <input
              type="range"
              min="0"
              max="100"
              :value="subBuffer[edge]"
              @input="patchSubBuffer({ [edge]: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="value">{{ subBuffer[edge] }}</span>
          </span>
        </label>
        <button v-if="subBufferTrimmed" class="reset-sub" @click="resetSubBuffer">Full buffer</button>
      </CollapsibleSection>

      <!-- A Shader effect's real controls come from the shader, not from the schema: its
           parameters are whatever its author declared in the ISF header. The two schema params
           below (speed, transparency) are ours and apply to every shader. -->
      <CollapsibleSection v-if="effect.name === 'Shader'" title="Shader">
        <ShaderPicker
          :source="typeof effect.params.source === 'string' ? effect.params.source : undefined"
          :inputs="shaderInputs"
          :shader-id="typeof effect.params.shaderId === 'number' ? effect.params.shaderId : null"
          @pick="onPickShader"
          @set-inputs="(inputs) => setParam('inputs', inputs as unknown as EffectParamValue)"
        />
      </CollapsibleSection>

      <div v-for="p in schema.params" :key="p.key" class="param">
        <label>{{ p.label }}</label>
        <template v-if="hasCurve(p.key)">
          <!-- the curve is the value now, so the flat slider would be showing a stale number -->
        </template>
        <input
          v-else-if="p.type === 'intSlider'"
          type="range"
          :min="p.min"
          :max="p.max"
          :value="effect.params[p.key] ?? p.default"
          @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="p.type === 'floatSlider'"
          type="range"
          :min="p.min"
          :max="p.max"
          :step="p.step ?? 0.1"
          :value="effect.params[p.key] ?? p.default"
          @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="p.type === 'checkbox'"
          type="checkbox"
          :checked="Boolean(effect.params[p.key] ?? p.default)"
          @change="setParam(p.key, ($event.target as HTMLInputElement).checked)"
        />
        <select
          v-else-if="p.type === 'choice'"
          :value="effect.params[p.key] ?? p.default"
          @change="setParam(p.key, ($event.target as HTMLSelectElement).value)"
        >
          <!-- A dynamic list can legitimately be empty (no timing tracks yet), and the current
               value can name something that has since been renamed away - both need to be
               visible rather than silently reset to the first option. -->
          <option v-if="p.optionsFrom" value="">—</option>
          <option v-for="opt in optionsFor(p)" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <!--
          Sketch's path is text in the schema, but it is a *drawing* - so it gets a canvas to
          trace on instead of a box to type coordinates into, which is what xLights' Effect
          Assist panel is for.
        -->
        <!--
          The Pictures effect's image. Two ways at it: load a file, or draw one straight onto the
          model's own grid with the pixel editor. `decodeImageForEffect` existed but had no
          control anywhere, so until now a Pictures effect could hold an image only if one had
          been imported with the sequence.
        -->
        <template v-else-if="p.type === 'image'">
          <input type="file" accept="image/*" @change="pickImage(p.key, $event)" />
          <button class="draw-toggle" @click="drawing = !drawing">{{ drawing ? "Hide" : "Draw" }}</button>
          <PixelEditor
            v-if="drawing"
            :image="imageParam(p.key)"
            :width="imageParam(p.key)?.width ?? 32"
            :height="imageParam(p.key)?.height ?? 16"
            @update="setParam(p.key, $event)"
          />
        </template>
        <SketchEditor
          v-else-if="p.key === 'sketch'"
          :sketch="String(effect.params[p.key] ?? p.default)"
          @update="setParam(p.key, $event)"
        />
        <input
          v-else-if="p.type === 'text'"
          type="text"
          :value="effect.params[p.key] ?? p.default"
          @input="setParam(p.key, ($event.target as HTMLInputElement).value)"
        />
        <!-- A note param's number is the one value in this panel nobody reads at a glance: 48 is
             C3, and knowing that is the difference between setting a range and guessing at one. -->
        <span v-if="!hasCurve(p.key) && p.key !== 'sketch' && p.type !== 'text'" class="value">
          {{ effect.params[p.key] ?? p.default
          }}<template v-if="p.key === 'startNote' || p.key === 'endNote'">
            ({{ midiKeyName(Number(effect.params[p.key] ?? p.default)) }})</template>
        </span>
        <ValueCurveEditor
          v-if="curveable(p)"
          :model-value="effect.params[p.key] ?? p.default"
          :label="p.label"
          :min="p.min ?? 0"
          :max="p.max ?? 100"
          @update:model-value="setParam(p.key, $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.fade-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}
.fade-row label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: #cfcfd8;
}
.fade-row input {
  width: 68px;
}
.fade-steps {
  display: inline-flex;
  gap: 0.15rem;
}
.fade-steps button {
  padding: 0.1rem 0.3rem;
  font-size: 0.68rem;
  border: 1px solid #3a3a44;
  border-radius: 3px;
  background: #1e1e26;
  color: #9a9aa6;
  cursor: pointer;
}
.fade-steps button.on {
  background: #e8c468;
  border-color: #e8c468;
  color: #111;
}
.fade-note {
  margin: 0.1rem 0 0.5rem;
  font-size: 0.68rem;
  color: #7a7a86;
}
.props-panel {
  padding: 0.75rem;
  font-size: 0.85rem;
}
.props-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.empty {
  color: #666;
}
.param {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.param label {
  grid-column: 1 / -1;
  color: #aaa;
  font-size: 0.75rem;
}
.reset-sub {
  margin-top: 0.3rem;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
}
.draw-toggle {
  font-size: 0.65rem;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  margin-left: 0.3rem;
}
.hint {
  margin: 0.2rem 0 0;
  color: #666;
  font-size: 0.65rem;
}
/* A layer that will render nothing as configured - louder than an ordinary hint, because the
   symptom is silence rather than an error. */
.hint.warn {
  color: #a8631a;
}
.value {
  text-align: right;
  color: #888;
  font-size: 0.75rem;
  min-width: 2.5rem;
}
.color-panel {
  margin-bottom: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid #333;
}
.color-panel h4 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: normal;
  color: #888;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.swatch {
  position: relative;
  width: 1.75rem;
  height: 1.75rem;
}
.swatch input[type="color"] {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  background: none;
}
.curve-swatch {
  position: absolute;
  bottom: -0.4rem;
  right: -0.4rem;
  width: 1rem;
  height: 1rem;
  line-height: 1;
  font-size: 0.7rem;
  color: #ddd;
  background: #1e1e26;
  border: 1px solid #444;
  border-radius: 50%;
  cursor: pointer;
}
/* Lit when the swatch is a curve, because the colour well above it then shows only the curve's
   first marker - without this the swatch would look like an ordinary colour that ignores edits. */
.curve-swatch.on {
  color: #1e1e26;
  background: #ffc878;
  border-color: #ffc878;
}
.remove-swatch {
  position: absolute;
  top: -0.4rem;
  right: -0.4rem;
  width: 1rem;
  height: 1rem;
  line-height: 1;
  font-size: 0.65rem;
  color: #ddd;
  background: #1e1e26;
  border: 1px solid #444;
  border-radius: 50%;
  cursor: pointer;
}
.add-swatch {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 1rem;
  color: #888;
  background: #1e1e26;
  border: 1px dashed #444;
  border-radius: 4px;
  cursor: pointer;
}
.add-swatch:hover {
  color: #ddd;
  border-color: #666;
}
.blend-panel {
  margin-bottom: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid #333;
}
.blend-panel h4 {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: normal;
  color: #888;
}
.blend-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.4rem;
  gap: 0.5rem;
}
.blend-row select,
.blend-row input[type="number"] {
  width: 7rem;
  font-size: 0.75rem;
}
.blend-inline {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.blend-inline input[type="range"] {
  width: 5rem;
}
.blend-inline .value {
  min-width: 1.5rem;
  text-align: right;
  color: #888;
}
</style>
