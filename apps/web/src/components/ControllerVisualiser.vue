<script setup lang="ts">
import { computed, ref } from "vue";
import type { ControllerRecord, ModelRecord } from "../lib/api";
import { chainOn, placeInChain, removeFromChain, type ChainPatch } from "../lib/controllerChain";
import { unassignedModels } from "../lib/controllerLayout";

// xLights' controller visualiser: every controller as a row, the models chained along it in
// channel order, and a tray of models that are not on any controller yet.
//
// Drag a model onto a controller and it joins the end of the chain; drop it between two others
// and they shuffle along; drag it back to the tray and it comes off. Same pointer-captured drag as
// the palettes, so it feels like the desktop app and not like a browser. The arithmetic is
// lib/controllerChain.ts; this component only decides where the pointer is pointing.

const props = defineProps<{
  controllers: ControllerRecord[];
  models: ModelRecord[];
  channelCountFor: (model: ModelRecord) => number;
  saving?: boolean;
}>();
const emit = defineEmits<{ patches: [patches: ChainPatch[]] }>();

const tray = computed(() => unassignedModels(props.models));
const chains = computed(() =>
  props.controllers.map((controller) => {
    const chain = chainOn(props.models, controller.id);
    const used = chain.reduce((sum, m) => sum + Math.max(1, m.channel_count ?? props.channelCountFor(m)), 0);
    return { controller, chain, used, over: Math.max(0, used - controller.channel_count) };
  }),
);

function countOf(m: ModelRecord): number {
  return Math.max(1, m.channel_count ?? props.channelCountFor(m));
}
function rangeOf(m: ModelRecord, controller: ControllerRecord): string {
  const start = controller.start_channel + (m.controller_offset ?? 0);
  return `${start}–${start + countOf(m) - 1}`;
}

// ---- the drag ------------------------------------------------------------------------------

type Target = { kind: "controller"; controllerId: number; index: number; blocked: string | null } | { kind: "tray" } | null;
const drag = ref<{ model: ModelRecord; x: number; y: number; target: Target } | null>(null);
let pointer: { id: number; model: ModelRecord; startX: number; startY: number; el: HTMLElement; started: boolean } | null = null;

function onPointerDown(e: PointerEvent, model: ModelRecord): void {
  if (e.button !== 0 || props.saving) return;
  if (e.pointerType === "mouse") e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  pointer = { id: e.pointerId, model, startX: e.clientX, startY: e.clientY, el, started: false };
  el.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!pointer || e.pointerId !== pointer.id) return;
  if (!pointer.started) {
    if (Math.abs(e.clientX - pointer.startX) < 4 && Math.abs(e.clientY - pointer.startY) < 4) return;
    pointer.started = true;
    document.body.classList.add("dragging-tile");
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("blur", finish);
  }
  drag.value = { model: pointer.model, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY) };
}

/** What the pointer is over: a chain (and where in it), the tray, or nothing. */
function targetAt(x: number, y: number): Target {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  const strip = hit?.closest<HTMLElement>("[data-controller]");
  if (strip) {
    const controllerId = Number(strip.dataset.controller);
    // The insertion point is before the first chip whose middle the pointer has not passed.
    const chips = [...strip.querySelectorAll<HTMLElement>("[data-chip]")].filter((c) => Number(c.dataset.chip) !== pointer?.model.id);
    let index = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i]!.getBoundingClientRect();
      if (y < r.top - 4) { index = i; break; }
      if (y <= r.bottom + 4 && x < r.left + r.width / 2) { index = i; break; }
    }
    // Whether it will fit: the controller's span minus what is already on it, not counting the
    // model itself if it is moving within the same chain.
    const row = chains.value.find((r) => r.controller.id === controllerId);
    const model = pointer!.model;
    const already = model.controller_id === controllerId ? countOf(model) : 0;
    const free = row ? row.controller.channel_count - row.used + already : 0;
    const blocked = row && countOf(model) > free ? `${model.name} needs ${countOf(model)} channels; ${row.controller.name} has ${Math.max(0, free)} free` : null;
    return { kind: "controller", controllerId, index, blocked };
  }
  if (hit?.closest("[data-tray]")) return { kind: "tray" };
  return null;
}

function onPointerUp(e: PointerEvent): void {
  if (!pointer || e.pointerId !== pointer.id) return;
  try {
    if (pointer.started) {
      const target = targetAt(e.clientX, e.clientY) ?? drag.value?.target ?? null;
      const model = pointer.model;
      if (target?.kind === "controller" && !target.blocked) emit("patches", placeInChain(props.models, model.id, target.controllerId, target.index, props.channelCountFor));
      else if (target?.kind === "tray" && model.controller_id != null) emit("patches", removeFromChain(props.models, model.id, props.channelCountFor));
    }
  } finally {
    finish();
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  finish();
}

function finish(): void {
  const p = pointer;
  if (p) {
    try {
      if (p.el.hasPointerCapture?.(p.id)) p.el.releasePointerCapture(p.id);
    } catch {
      // Already released.
    }
  }
  pointer = null;
  drag.value = null;
  document.body.classList.remove("dragging-tile");
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("blur", finish);
}

function insertionAt(controllerId: number, index: number): boolean {
  const t = drag.value?.target;
  return t?.kind === "controller" && t.controllerId === controllerId && t.index === index;
}
</script>

<template>
  <section class="visualiser" aria-label="Controller visualiser">
    <div class="tray" data-tray :class="{ over: drag?.target?.kind === 'tray' }">
      <div class="tray-head">
        <h2>Not on a controller</h2>
        <span class="hint">Drag a model onto a controller. Drag it back here to take it off.</span>
      </div>
      <div class="chips">
        <button
          v-for="m in tray"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ lifted: drag?.model.id === m.id }"
          :title="`${m.name} · ${countOf(m)} channels`"
          @dragstart.prevent
          @pointerdown="onPointerDown($event, m)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="finish"
        >
          <span class="chip-name">{{ m.name }}</span>
          <span class="chip-meta">{{ countOf(m) }} ch</span>
        </button>
        <span v-if="tray.length === 0" class="empty">Every model is on a controller.</span>
      </div>
    </div>

    <div
      v-for="row in chains"
      :key="row.controller.id"
      class="strip"
      :data-controller="row.controller.id"
      :class="{
        over: drag?.target?.kind === 'controller' && drag.target.controllerId === row.controller.id && !drag.target.blocked,
        blocked: drag?.target?.kind === 'controller' && drag.target.controllerId === row.controller.id && !!drag.target.blocked,
        inactive: !row.controller.active,
      }"
    >
      <div class="strip-head">
        <h2>{{ row.controller.name }}</h2>
        <span class="meta">
          {{ row.controller.protocol.toUpperCase() }}<template v-if="row.controller.ip_address"> · {{ row.controller.ip_address }}</template>
          · {{ row.used }} of {{ row.controller.channel_count }} channels
          <span v-if="row.over" class="bad">· {{ row.over }} past the end</span>
          <span v-if="drag?.target?.kind === 'controller' && drag.target.controllerId === row.controller.id && drag.target.blocked" class="bad">· {{ drag.target.blocked }}</span>
        </span>
      </div>
      <div class="chips">
        <template v-for="(m, i) in row.chain" :key="m.id">
          <span class="slot" :class="{ on: insertionAt(row.controller.id, i) }" aria-hidden="true"></span>
          <button
            type="button"
            class="chip on-controller"
            :data-chip="m.id"
            :class="{ lifted: drag?.model.id === m.id }"
            :title="`${m.name} · channels ${rangeOf(m, row.controller)}`"
            @dragstart.prevent
            @pointerdown="onPointerDown($event, m)"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="finish"
          >
            <span class="chip-name">{{ m.name }}</span>
            <span class="chip-meta">{{ rangeOf(m, row.controller) }}</span>
          </button>
        </template>
        <span class="slot end" :class="{ on: insertionAt(row.controller.id, row.chain.length) }" aria-hidden="true"></span>
        <span v-if="row.chain.length === 0" class="empty">Nothing on this controller yet — drop a model here.</span>
      </div>
    </div>
    <p v-if="controllers.length === 0" class="empty">Add a controller to start chaining models onto it.</p>
  </section>

  <Teleport to="body">
    <div v-if="drag" class="drag-proxy" :class="{ over: drag.target !== null, blocked: drag.target?.kind === 'controller' && !!drag.target.blocked }" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }" aria-hidden="true">
      <span>{{ drag.model.name }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.visualiser {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem 2rem;
  text-align: left;
  font-family: var(--sans);
}
.tray,
.strip {
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  background: var(--bg-panel);
  padding: 0.6rem 0.75rem;
  transition: border-color 120ms ease-out;
}
.tray.over,
.strip.over {
  border-color: var(--ok);
}
.strip.blocked {
  border-color: var(--danger);
}
.strip.inactive {
  opacity: 0.6;
}
.tray-head,
.strip-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}
.meta,
.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.bad {
  color: var(--danger);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.35rem;
  min-height: 2.4rem;
}
.chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0.3rem 0.6rem;
  font: inherit;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-drag: none;
}
.chip.on-controller {
  border-color: rgba(106, 159, 216, 0.5);
}
.chip:hover {
  border-color: var(--accent);
}
.chip.lifted {
  opacity: 0.35;
}
.chip-name {
  font-size: 0.8rem;
  font-weight: 500;
}
.chip-meta {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
/* The insertion point: a hairline that lights up green where the dragged model will land. */
.slot {
  width: 3px;
  border-radius: 2px;
  background: transparent;
  align-self: stretch;
}
.slot.on {
  background: var(--ok);
}
.empty {
  font-size: 0.8rem;
  color: var(--text-dim);
  align-self: center;
}
</style>
