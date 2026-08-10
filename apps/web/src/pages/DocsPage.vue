<script setup lang="ts">
import { AUDIO_REACTIVE_EFFECTS, EFFECT_SCHEMAS, TRANSITION_TYPES, VALUE_CURVE_TYPES } from "@webxlights/engine";

const effectNames = Object.keys(EFFECT_SCHEMAS);
const valueCurveTypes = VALUE_CURVE_TYPES.join(", ");
const transitionTypes = TRANSITION_TYPES.join(", ");

function paramTypeLabel(type: string): string {
  if (type === "intSlider") return "integer";
  if (type === "floatSlider") return "decimal";
  if (type === "checkbox") return "on/off";
  if (type === "choice") return "choice";
  if (type === "text") return "text";
  if (type === "image") return "image";
  return type;
}

function isAudioReactive(name: string): boolean {
  return AUDIO_REACTIVE_EFFECTS.has(name);
}
</script>

<template>
  <main class="docs">
    <header>
      <router-link to="/projects">&larr; Projects</router-link>
      <h1>Docs</h1>
    </header>

    <section id="import">
      <h2>Import guide</h2>
      <p>Get an existing xLights show into webXLights:</p>
      <ol>
        <li>
          <strong>Layout.</strong> In your project's Layout page, click "Import xlights_rgbeffects.xml" and pick that file from your xLights show
          folder. Supported model types render at their real positions; anything else still imports and shows as a labeled placeholder box so
          nothing is silently lost — check the import summary for what needs attention.
        </li>
        <li>
          <strong>Sequence.</strong> From the Sequences page, click "Import .xsq" and pick a rendered <code>.xsq</code> file. Model rows are matched
          to your layout by exact name; unmatched names and effects webXLights doesn't fully translate yet are both listed in the import summary
          rather than dropped without a trace.
        </li>
        <li>
          <strong>Audio.</strong> webXLights doesn't store audio server-side yet, so re-select the original audio file the first time you open an
          imported (or any) sequence — the waveform and playback pick up from there.
        </li>
      </ol>
      <p>No xLights show handy? Click "Load sample project" from the Projects page for a working example with a layout, audio, and effects already placed.</p>
    </section>

    <section id="curves">
      <h2>Value curves</h2>
      <p>
        Any parameter with a <strong>VC</strong> button next to it can animate across the effect instead of holding one
        value. Click VC, pick a shape, and set the range the parameter sweeps between. Curve types:
        {{ valueCurveTypes }}. Periodic shapes (sine, square, saw tooth, triangle) add a cycle count and a phase offset;
        <em>Custom</em> gives you a point editor — click to add a point, drag to move it, shift-click to remove.
      </p>
    </section>

    <section id="transitions">
      <h2>Transitions</h2>
      <p>
        Each effect can fade or wipe itself in and out independently of what it draws. Open the
        <strong>Transitions</strong> section in the props panel and set an in/out duration, then pick a type:
        {{ transitionTypes }}. Blinds, Slide Bars and Checkerboard also take a pattern-density knob, and any type can be
        reversed.
      </p>
    </section>

    <section id="audio">
      <h2>Audio-reactive effects</h2>
      <p>
        Load a track and it's analysed once into a per-frame level and spectrum, which the VU Meter effect renders from.
        The same analysis feeds the .fseq export, so what the 3D preview shows is what the exported file plays. Without
        a track loaded, an audio-reactive effect renders nothing rather than a misleading flat colour.
      </p>
    </section>

    <section id="effects">
      <h2>Effect reference</h2>
      <p>Generated from the same parameter registry the sequencer's props panel reads — always matches what's actually placeable today.</p>
      <div v-for="name in effectNames" :key="name" class="effect">
        <h3>{{ name }} <span v-if="isAudioReactive(name)" class="audio-tag">needs audio</span></h3>
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Type</th>
              <th>Range / options</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in EFFECT_SCHEMAS[name]!.params" :key="p.key">
              <td>{{ p.label }}</td>
              <td>{{ paramTypeLabel(p.type) }}</td>
              <td>
                <span v-if="p.type === 'choice'">{{ p.options?.join(", ") }}</span>
                <span v-else-if="p.min !== undefined || p.max !== undefined">{{ p.min }}&ndash;{{ p.max }}</span>
                <span v-else>&mdash;</span>
              </td>
              <td>{{ p.default }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.docs {
  font-family: system-ui, sans-serif;
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem 4rem;
}
header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
h1 {
  margin: 0;
}
section {
  margin-bottom: 2.5rem;
}
h2 {
  border-bottom: 1px solid #ccc;
  padding-bottom: 0.4rem;
}
.effect {
  margin-bottom: 1.5rem;
}
.effect h3 {
  margin-bottom: 0.4rem;
  font-size: 1rem;
}
.audio-tag {
  font-size: 0.7rem;
  font-weight: 400;
  color: #8a6d1f;
  border: 1px solid #d9c07a;
  border-radius: 3px;
  padding: 0 4px;
  vertical-align: middle;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  text-align: left;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid #eee;
}
th {
  color: #666;
  font-weight: 600;
}
</style>
