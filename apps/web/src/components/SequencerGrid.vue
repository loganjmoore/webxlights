<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { RowElementType, SequenceBody, SequenceEffect } from "../lib/api";
import { DEFAULT_UI_COLORS, type UiColors } from "../lib/uiColors";
import { fadeDurationAt } from "../lib/effectFade";
import { boxFromDrag, idsInBox, isDrag, selectionAfterClick } from "../lib/blockSelect";
import { acceptedMoves, previewMoves, type DraggedEffect, type GhostPlacement } from "../lib/dragPreview";
import { gestureFor } from "../lib/gridGesture";
import { dragOutSpan, freeGapAt, type Placement } from "../lib/effectPlacement";
import { isPlaceholder, type PickerAnchor } from "../lib/effectPicker";

export interface GridRow {
  elementType: RowElementType;
  elementId: number;
  name: string;
  /** Set only for sub-model rows; names which sub-model of `elementId` this is. */
  subName?: string;
  /**
   * Set only when a row is showing its effect layers: which layer this row is.
   *
   * Unset means "all of them on one row", which is how every row looked before layers had an
   * interface and is what Collapse Layers goes back to.
   */
  layerIndex?: number;
  /**
   * The row this one is nested under - a group for its member models, a model for its strands and
   * sub-models - or unset for a top-level row.
   *
   * Every model, strand and sub-model used to be listed at once, which on a real show is hundreds
   * of rows before you have placed a single effect, and the group you actually wanted to sequence
   * is somewhere in the middle of them.
   */
  parentKey?: string;
  /** How deep to indent the label, so the nesting is visible rather than implied. */
  depth?: number;
  /** Set on a row that has children: true when they are showing. */
  expanded?: boolean;
}

export type ContextMenuTarget =
  | { kind: "effect"; row: GridRow; effect: SequenceEffect; ms: number; x: number; y: number }
  // "Right click the model in the sequencer tab and choose Add Layer above or below."
  | { kind: "row-label"; row: GridRow; x: number; y: number }
  | { kind: "mark"; trackIndex: number; ms: number; x: number; y: number }
  | { kind: "ruler-empty"; trackIndex: number; ms: number; x: number; y: number };

const props = defineProps<{
  rows: GridRow[];
  body: SequenceBody;
  durationMs: number;
  pxPerMs: number;
  playheadMs: number;
  selectedEffectId: string | null; // the reference effect, drawn distinctly from the rest
  // The block selection (lib/blockSelect.ts). Optional so the grid still draws anywhere it is
  // mounted without one; a selection of one behaves exactly as a single selection always did.
  selectedEffectIds?: string[];
  // The narrowest a dragged-out effect may come out, which the page knows in pixels (see its
  // minimumEffectMs). Optional so the grid still places something sensible without it.
  minEffectMs?: number;
  // xLights' "snap to timing marks" preference. Off, an edge lands exactly where it was dropped,
  // which is what you want when placing against the music by ear rather than against the marks.
  snapToTiming?: boolean;
  // The user's chosen chrome colours (lib/uiColors.ts). Optional so the grid still draws with
  // sensible defaults anywhere it is mounted without them.
  colors?: UiColors;
  // xLights' Effects Grid > Spacing, as the pixel height it resolves to. Optional so the grid
  // still draws at a sensible size anywhere it is mounted without a preference to hand.
  rowHeight?: number;
  // xLights' Effects Grid > Display Transition Marks.
  showTransitionMarks?: boolean;
  // Which timing track is selected: an index, or -1 for "all tracks" (lib/effectPlacement.ts).
  // Its marks are what snapping and placement act on, and what a new mark is added to. Every
  // track's marks are still *drawn*, with the ones in force emphasised, so which set is acting is
  // visible rather than something to infer.
  activeTrackIndex?: number;
}>();

const ui = (): UiColors => props.colors ?? DEFAULT_UI_COLORS;

const emit = defineEmits<{
  // Selection is always a block and its reference, even when the block is one effect - two events
  // would mean two ways to be selected, and the panel reading a different one from the grid.
  selectMany: [ids: string[], reference: string | null];
  // A span dragged out on an empty row, and where on screen it is - the effect picker opens
  // beside it, because that is where the eyes already are.
  place: [row: GridRow, startMs: number, endMs: number, at: PickerAnchor];
  // A press on an effect's body that was released without moving. What a click means depends on
  // the effect (a placeholder opens the picker), so the grid reports it and the page decides.
  effectClick: [effect: SequenceEffect, at: PickerAnchor];
  // Where the dragged effects landed, on release. One event for the whole drag, so the move is one
  // undo entry rather than one per pointermove.
  moveMany: [moves: { id: string; startMs: number; endMs: number; rowIndex: number }[]];
  // Shift+drag on an effect edge: the fade length dragged in from that edge.
  fade: [effectId: string, edge: "left" | "right", durationMs: number];
  seek: [ms: number];
  dragStart: [];
  addMark: [trackIndex: number, ms: number];
  contextmenu: [target: ContextMenuTarget];
  // xLights' radial effect wheel: "double-click empty sequencer grid area displays a radial
  // effect wheel for quick effect placement". Only on empty grid - double-clicking an effect is
  // how you would open it, not how you would place another on top of it.
  wheel: [row: GridRow, ms: number, x: number, y: number];
  // Double-click on a timing mark. What it means is a preference (Play Timing / Edit Text), so
  // the grid reports the gesture and the page decides.
  markDoubleClick: [trackIndex: number, ms: number];
  /** A group or model row was double-clicked: show or hide what is nested under it. */
  rowExpand: [row: GridRow];
}>();

const DEFAULT_ROW_HEIGHT = 28;
// A computed rather than a constant, because the Spacing preference changes it: every place that
// turns a y coordinate into a row - drawing, hit testing, and the scroll spacer - has to use the
// same number or clicking a row selects the one above it.
const rowHeight = computed(() => Math.max(8, Math.round(props.rowHeight ?? DEFAULT_ROW_HEIGHT)));
const ROW_LABEL_WIDTH = 140;
const HEADER_HEIGHT = 24; // pinned timing-track ruler, drawn every frame regardless of scrollTop
// The canvas is as tall as the space the page gives this component, and only the rows inside it
// are drawn (M9 perf budget: 100 rows / 5k effects). 420 is what it was fixed at, and what it
// stays at anywhere that mounts the grid without a height.
const viewportHeight = ref(420);
let vScrollResize: ResizeObserver | null = null;
const EDGE_PX = 6;
const SNAP_PX = 6;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);

// Horizontal virtualisation, the same trick the rows already get vertically. The canvas used to
// be as wide as the whole timeline - at deep zoom that is tens of thousands of pixels, which
// costs a full-timeline repaint on every scroll step, drag move and playhead tick, allocates a
// bitmap in the hundreds of megabytes, and silently blanks entirely past the browser's canvas
// size cap (32,767px). Instead the canvas is viewport-sized, pinned to the visible slice of the
// page's shared horizontal scroller by a translateX, and everything time-positioned is drawn
// shifted by scrollLeft. The spacer keeps the full width, so scrolling itself is unchanged.
// A welcome side effect: the row-label gutter is now genuinely pinned - it used to scroll away.
const scrollLeft = ref(0);
const viewportWidth = ref(0);
let hScrollEl: HTMLElement | null = null;
let hScrollResize: ResizeObserver | null = null;

function onHScroll(): void {
  if (!hScrollEl || !canvasRef.value) return;
  scrollLeft.value = hScrollEl.scrollLeft;
  // Manual sticky: CSS position:sticky can't pin against the *page's* horizontal scroller from
  // inside this component's own vertical one, so the canvas rides the scroll by transform.
  canvasRef.value.style.transform = `translateX(${hScrollEl.scrollLeft}px)`;
  draw();
}

function attachHScroll(): void {
  let el: HTMLElement | null = canvasRef.value?.parentElement ?? null;
  while (el) {
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") break;
    el = el.parentElement;
  }
  hScrollEl = el;
  if (!hScrollEl) return; // mounted outside a horizontal scroller: full-width canvas, as before
  hScrollEl.addEventListener("scroll", onHScroll, { passive: true });
  hScrollResize = new ResizeObserver(() => {
    viewportWidth.value = hScrollEl?.clientWidth ?? 0;
    draw();
  });
  hScrollResize.observe(hScrollEl);
  viewportWidth.value = hScrollEl.clientWidth;
  onHScroll();
}
const hoverCursor = ref("crosshair");
let dragState:
  // A span being drawn out on an empty row. `gap` is the free space the press landed in, which the
  // span never leaves; the ghost is null until the pointer has moved far enough to be a drag
  // rather than a click that wobbled, because a click on empty grid still seeks.
  | { kind: "place"; row: GridRow; rowIndex: number; pressMs: number; gap: Placement; fromX: number; fromY: number; ghost: GhostPlacement | null }
  // A move is a *proposal* until release: the ghosts show where the block will land, and only the
  // unblocked ones drop. `dragged` is the whole selected block, since the manual's ghost is
  // explicitly "the effect (or effects)". `moved` has the same job as the place ghost being null:
  // a press released where it started is a click on the effect, not a drag of nought pixels.
  | { kind: "move"; effect: SequenceEffect; dragged: DraggedEffect[]; grabOffsetMs: number; fromRow: number; fromX: number; fromY: number; moved: boolean; ghosts: GhostPlacement[] }
  | { kind: "resize"; effect: SequenceEffect; rowIndex: number; edge: "left" | "right"; ghost: GhostPlacement | null }
  // Shift+resize authors a fade instead of moving the edge (manual: "hold the Shift key and drag
  // the left edge of an effect inwards to create a fade in").
  | { kind: "fade"; effect: SequenceEffect; edge: "left" | "right" }
  // A rubber band over empty grid: "drag a box around all the effects you want to align".
  | { kind: "band"; fromX: number; fromY: number; toX: number; toY: number; dragging: boolean }
  | null = null;

// Full content width, not container width - at zoom > baseline this is wider than the
// viewport on purpose; the parent page wraps this component in an overflow-x:auto element
// so the extra width becomes reachable by scroll instead of clipped and unreachable. The
// *spacer* carries this width; the canvas itself is only as wide as what can be seen.
const totalWidth = computed(() => ROW_LABEL_WIDTH + props.durationMs * props.pxPerMs);
const canvasWidth = computed(() =>
  viewportWidth.value > 0 ? Math.min(totalWidth.value, viewportWidth.value) : totalWidth.value,
);

function effectsForRow(row: GridRow): SequenceEffect[] {
  // The sub-name matters: a model's strands and sub-models are separate rows in the body, and
  // matching on type and id alone drew every strand's effects on every strand.
  const found = props.body.rows.find(
    (r) => r.elementType === row.elementType && r.elementId === row.elementId && (r.subName ?? undefined) === (row.subName ?? undefined),
  );
  const effects = found?.effects ?? [];
  // A collapsed row shows every layer at once, which is what it always did. An expanded one shows
  // only its own, so the layers can be told apart and dragged separately.
  if (row.layerIndex === undefined) return effects;
  return effects.filter((e) => (e.layerIndex ?? 0) === row.layerIndex);
}

function allMarks(): number[] {
  return props.body.timingTracks.flatMap((t) => t.marks);
}

/**
 * A plain, non-reactive copy of just what draw() paints, rebuilt when the body changes.
 *
 * draw() reads every visible effect's fields once per frame, and `props.body` is a deep
 * reactive object, so each of those reads went through a Proxy trap. Measured on the
 * 100-row/5k-effect budget, reading the effects reactively costs ~12x what reading plain
 * objects does, and that difference - not the canvas calls, which measure under 3ms a
 * frame - was the bulk of the frame. The canvas never needs reactivity: it is repainted
 * by an explicit watcher, not by tracking.
 *
 * Only the draw path uses this. Hit-testing and the drag handlers still resolve the real
 * effects, because they emit ids that the store has to be able to find.
 */
interface DrawEffect {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  layerIndex?: number;
  inMs: number;
  outMs: number;
  placeholder: boolean;
}
let drawIndex = new Map<string, DrawEffect[]>();
let drawMarks: number[] = [];

function rebuildDrawIndex(): void {
  drawIndex = new Map();
  for (const r of props.body.rows) {
    // Keyed and first-wins to match effectsForRow's Array.find() exactly, so the painted
    // rows stay identical to the ones hit-testing resolves.
    const key = `${r.elementType}|${r.elementId}`;
    if (drawIndex.has(key)) continue;
    drawIndex.set(
      key,
      r.effects.map((e) => ({
        id: e.id,
        name: e.name,
        startMs: e.startMs,
        endMs: e.endMs,
        layerIndex: e.layerIndex,
        inMs: e.transition?.inDurationMs ?? 0,
        outMs: e.transition?.outDurationMs ?? 0,
        placeholder: isPlaceholder(e),
      })),
    );
  }
  drawMarks = props.body.timingTracks.flatMap((t) => [...t.marks]);
}

function drawEffectsForRow(row: GridRow): DrawEffect[] {
  const all = drawIndex.get(`${row.elementType}|${row.elementId}`) ?? [];
  if (row.layerIndex === undefined) return all;
  return all.filter((e) => (e.layerIndex ?? 0) === row.layerIndex);
}

/**
 * The marks that snapping acts on.
 *
 * Falls back to every track's when no track is selected, which is what this component did before
 * there was a selection - so mounting it without the prop still behaves.
 */
function activeMarks(): number[] {
  const index = props.activeTrackIndex ?? -1;
  return index >= 0 ? (props.body.timingTracks[index]?.marks ?? []) : allMarks();
}

/** The track a mark belongs to, so deleting the one under the pointer deletes *that* one. */
function trackOfMark(ms: number): number {
  const index = props.body.timingTracks.findIndex((t) => t.marks.includes(ms));
  return index >= 0 ? index : 0;
}

/** The track a new mark goes on: the selected one, or the first when none is selected. */
function trackForNewMark(): number {
  const index = props.activeTrackIndex ?? -1;
  return index >= 0 ? index : 0;
}

function snapMs(ms: number): number {
  if (props.snapToTiming === false) return ms;
  const toleranceMs = SNAP_PX / props.pxPerMs;
  let closest = ms;
  let closestDist = toleranceMs;
  for (const mark of activeMarks()) {
    const dist = Math.abs(mark - ms);
    if (dist <= closestDist) {
      closest = mark;
      closestDist = dist;
    }
  }
  return closest;
}

function msToX(ms: number): number {
  return ROW_LABEL_WIDTH + ms * props.pxPerMs;
}
function xToMs(x: number): number {
  return Math.max(0, Math.round((x - ROW_LABEL_WIDTH) / props.pxPerMs));
}

let ctxCache: CanvasRenderingContext2D | null = null;
let lastBackingW = 0;
let lastBackingH = 0;

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = ctxCache ?? (ctxCache = canvas.getContext("2d"));
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  // Assigning canvas.width/height reallocates and clears the backing store. Doing it
  // unconditionally meant a full buffer realloc on every playhead tick, sixty times a
  // second, for a canvas whose size almost never changes.
  const bw = Math.round(rect.width * dpr);
  const bh = Math.round(rect.height * dpr);
  if (bw !== lastBackingW || bh !== lastBackingH) {
    canvas.width = bw;
    canvas.height = bh;
    lastBackingW = bw;
    lastBackingH = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#16161b";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const height = rowHeight.value;
  const rowsAreaHeight = rect.height - HEADER_HEIGHT;
  const firstRow = Math.max(0, Math.floor(scrollTop.value / height));
  const lastRow = Math.min(props.rows.length, Math.ceil((scrollTop.value + rowsAreaHeight) / height));

  // Everything time-positioned is drawn shifted left by the horizontal scroll; anything that
  // lands fully outside the viewport is skipped. The label gutter is painted after the effects,
  // so blocks scrolled under it disappear beneath it rather than over it.
  const view = scrollLeft.value;

  for (let i = firstRow; i < lastRow; i++) {
    const row = props.rows[i]!;
    const y = HEADER_HEIGHT + i * height - scrollTop.value;
    ctx.fillStyle = i % 2 === 0 ? ui().rowHeading : ui().rowHeadingSelected;
    ctx.fillRect(0, y, rect.width, height);

    for (const effect of drawEffectsForRow(row)) {
      const x1 = msToX(effect.startMs) - view;
      const x2 = msToX(effect.endMs) - view;
      if (x2 < 0 || x1 > rect.width) continue;
      const isReference = effect.id === props.selectedEffectId;
      const inBlock = isReference || (props.selectedEffectIds?.includes(effect.id) ?? false);
      // A placeholder is hollow and dashed: it renders nothing, and a solid block the colour of an
      // effect would say otherwise. Selection still reads the same way on it as on anything else.
      ctx.fillStyle = effect.placeholder ? (inBlock ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.05)") : inBlock ? ui().effectSelected : ui().effect;
      ctx.fillRect(x1, y + 2, Math.max(2, x2 - x1), height - 4);
      // The reference gets the white outline and the rest of the block a dimmer one: an alignment
      // moves everything onto the reference, so which one that is has to be visible before you
      // pick the command, not after it has moved eleven effects.
      ctx.strokeStyle = isReference ? "#fff" : inBlock ? "#8fb8e8" : effect.placeholder ? "#8a8a96" : "#2c3e5c";
      ctx.lineWidth = isReference ? 2 : 1;
      if (effect.placeholder) ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, y + 2, Math.max(2, x2 - x1), height - 4);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      if (props.showTransitionMarks !== false) drawTransitionMarks(ctx, effect.inMs, effect.outMs, x1, x2, y, height);
      // The label is drawn last so a transition mark can't sit on top of it. Only when the block
      // is wide enough for the name to be legible at all, which was already the rule.
      if (x2 - x1 > 24) {
        ctx.fillStyle = effect.placeholder ? "#b4b4c0" : "#0c0c0f";
        ctx.font = "10px system-ui";
        // fillText squeezes a label into its width rather than clipping it, which a short effect
        // name survives and a sentence doesn't: a narrow placeholder gets the plus instead.
        const label = effect.placeholder ? (x2 - x1 > 84 ? "Choose effect…" : "+") : effect.name;
        ctx.fillText(label, x1 + 3, y + height / 2 + 3, x2 - x1 - 6);
      }
    }
  }

  // The label gutter, painted over whatever scrolled under it - pinned, the way the ruler is.
  for (let i = firstRow; i < lastRow; i++) {
    const row = props.rows[i]!;
    const y = HEADER_HEIGHT + i * height - scrollTop.value;
    ctx.fillStyle = i % 2 === 0 ? ui().rowHeading : ui().rowHeadingSelected;
    ctx.fillRect(0, y, ROW_LABEL_WIDTH, height);

    ctx.fillStyle = ui().rowHeadingText;
    ctx.font = "11px system-ui";
    // A twisty for anything with rows nested under it, and an indent for the nested rows, so the
    // shape of the list is visible rather than something you have to remember.
    const indent = 8 + (row.depth ?? 0) * 12;
    if (row.expanded !== undefined) {
      ctx.fillText(row.expanded ? "▾" : "▸", indent, y + height / 2 + 4);
    }
    const labelX = indent + (row.expanded !== undefined ? 12 : 0);
    ctx.fillText(row.name, labelX, y + height / 2 + 4, ROW_LABEL_WIDTH - labelX - 4);
  }

  // pinned timing-track ruler - always drawn at y=0..HEADER_HEIGHT regardless of scrollTop
  ctx.fillStyle = ui().timingTrackHeader;
  ctx.fillRect(0, 0, rect.width, HEADER_HEIGHT);
  ctx.fillStyle = "#777";
  ctx.font = "10px system-ui";
  ctx.fillText("Marks", 8, HEADER_HEIGHT / 2 + 3);
  // Every track's marks are drawn, but the ones in force get the full-strength line and the
  // flag: an effect snapping to a mark that looks the same as one it ignores is the kind of
  // thing you would blame on the snapping being broken.
  const inForce = new Set(activeMarks());
  for (const ms of drawMarks) {
    const x = msToX(ms) - view;
    if (x < ROW_LABEL_WIDTH - 4 || x > rect.width + 4) continue;
    const active = inForce.has(ms);
    ctx.globalAlpha = active ? 1 : 0.35;
    ctx.strokeStyle = ui().timingMark;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEADER_HEIGHT);
    ctx.stroke();
    if (active) {
      ctx.fillStyle = ui().timingMark;
      ctx.beginPath();
      ctx.moveTo(x - 4, 0);
      ctx.lineTo(x + 4, 0);
      ctx.lineTo(x, 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ui().gridlines;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT);
  ctx.lineTo(rect.width, HEADER_HEIGHT);
  ctx.stroke();

  // row label divider
  ctx.strokeStyle = ui().gridlines;
  ctx.beginPath();
  ctx.moveTo(ROW_LABEL_WIDTH, 0);
  ctx.lineTo(ROW_LABEL_WIDTH, rect.height);
  ctx.stroke();

  // playhead
  const px = msToX(props.playheadMs) - view;
  ctx.strokeStyle = "#e74c3c";
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, rect.height);
  ctx.stroke();

  // The ghosts, over the effects but under the band: an outline hidden behind a block would look
  // like it had stopped following the pointer.
  const ghosts =
    dragState?.kind === "move"
      ? dragState.ghosts
      : (dragState?.kind === "resize" || dragState?.kind === "place") && dragState.ghost
        ? [dragState.ghost]
        : dropGhost
          ? [dropGhost]
          : [];
  for (const ghost of ghosts) {
    const gy = HEADER_HEIGHT + ghost.rowIndex * height - scrollTop.value;
    if (gy + height < HEADER_HEIGHT || gy > rect.height) continue;
    const gx1 = msToX(ghost.startMs) - view;
    const gx2 = msToX(ghost.endMs) - view;
    // "Only the ghost outlines that would collide with an existing effect turn red" - so the
    // colour is the answer to "will this one drop", not decoration.
    ctx.strokeStyle = ghost.blocked ? "#e5534b" : "#8fe0a0";
    ctx.fillStyle = ghost.blocked ? "rgba(229, 83, 75, 0.18)" : "rgba(143, 224, 160, 0.15)";
    ctx.lineWidth = 2;
    ctx.fillRect(gx1, gy + 2, Math.max(2, gx2 - gx1), height - 4);
    ctx.strokeRect(gx1, gy + 2, Math.max(2, gx2 - gx1), height - 4);
    ctx.lineWidth = 1;
  }

  // The rubber band, over everything - it is a transient thing you are drawing right now, and
  // having it hide behind an effect would make it look like it had stopped following the pointer.
  if (dragState?.kind === "band" && dragState.dragging) {
    // Band coordinates are absolute timeline x (like every hit test); the paint is shifted.
    const bx = Math.min(dragState.fromX, dragState.toX) - view;
    const by = Math.min(dragState.fromY, dragState.toY);
    const bw = Math.abs(dragState.toX - dragState.fromX);
    const bh = Math.abs(dragState.toY - dragState.fromY);
    ctx.fillStyle = "rgba(120, 175, 255, 0.15)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(140, 190, 255, 0.9)";
    ctx.strokeRect(bx, by, bw, bh);
  }
}

/**
 * Where a row is on screen, under the pointer's x. The row rather than the pointer's y: a drag
 * that drifted into the row above would otherwise open the picker over the span it is about.
 */
function anchorFor(clientX: number, rowIndex: number): PickerAnchor {
  const top = (canvasRef.value?.getBoundingClientRect().top ?? 0) + HEADER_HEIGHT + rowIndex * rowHeight.value - scrollTop.value;
  return { x: clientX, top, bottom: top + rowHeight.value };
}

/** The row index a y coordinate falls on, whether or not a row is actually there. */
function rowIndexAt(y: number): number {
  return Math.floor((y - HEADER_HEIGHT + scrollTop.value) / rowHeight.value);
}

const MINIMUM_EFFECT_MS = 50;

/** The effect the pointer actually grabbed - the delta is measured from it, then applied to the block. */
let grabbedEffectId: string | null = null;

/**
 * The effects a move drag carries: the whole selected block when the grabbed effect is part of it,
 * otherwise just the one grabbed.
 *
 * "Where the effect (or effects) will land" - dragging one effect out of a selection of twelve
 * more likely means moving the twelve than abandoning the selection.
 */
function draggedBlock(grabbed: SequenceEffect, grabbedRow: number, selectedIds: readonly string[]): DraggedEffect[] {
  grabbedEffectId = grabbed.id;
  const ids = new Set(selectedIds.includes(grabbed.id) ? selectedIds : [grabbed.id]);
  const out: DraggedEffect[] = [];
  props.rows.forEach((row, rowIndex) => {
    for (const effect of effectsForRow(row)) {
      if (ids.has(effect.id)) out.push({ id: effect.id, startMs: effect.startMs, endMs: effect.endMs, rowIndex });
    }
  });
  // The grabbed effect is always in, even if the row lookup missed it (a sub-model row shares its
  // parent's effect list, so the same effect can appear on more than one row).
  return out.length > 0 ? out : [{ id: grabbed.id, startMs: grabbed.startMs, endMs: grabbed.endMs, rowIndex: grabbedRow }];
}

/** The effects of every visible row, indexed by row, for the band to be tested against. */
function effectsByRow(): SequenceEffect[][] {
  return props.rows.map((row) => effectsForRow(row));
}

// xLights' "Display Transition Marks": the part of an effect that is a reveal rather than the
// effect itself, drawn as a wedge at each end. Without it an effect with a two-second fade in
// looks exactly like one without, and "why does this start dark" can only be answered by clicking
// it and reading the panel.
//
// A wedge rather than a line, because the shape says which way it runs: the thin end is where
// nothing is showing yet.
function drawTransitionMarks(
  ctx: CanvasRenderingContext2D,
  // Durations rather than the effect: the draw path works from the plain snapshot.
  // Zero is the engine's own default for a missing duration, so an effect carrying only a
  // transition *type* has no reveal to draw and shouldn't be marked as if it had.
  inMs: number,
  outMs: number,
  x1: number,
  x2: number,
  y: number,
  height: number,
): void {
  if (inMs <= 0 && outMs <= 0) return;

  const top = y + 2;
  const bottom = y + height - 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";

  if (inMs > 0) {
    // Clamped to the block: a reveal longer than the effect is a real thing to author by
    // accident, and a wedge drawn past the end would land on the next effect along.
    const w = Math.min(inMs * props.pxPerMs, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, bottom);
    ctx.lineTo(x1 + w, bottom);
    ctx.lineTo(x1, top);
    ctx.closePath();
    ctx.fill();
  }
  if (outMs > 0) {
    const w = Math.min(outMs * props.pxPerMs, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, bottom);
    ctx.lineTo(x2 - w, bottom);
    ctx.lineTo(x2, top);
    ctx.closePath();
    ctx.fill();
  }
}

type HitResult =
  | { kind: "effect"; row: GridRow; effect: SequenceEffect; edge: "left" | "right" | null }
  | { kind: "mark"; trackIndex: number; ms: number }
  | { kind: "ruler-empty"; trackIndex: number; ms: number }
  | { kind: "row-empty"; row: GridRow }
  | { kind: "row-label"; row: GridRow }
  | { kind: "none" };

function hitTest(x: number, y: number): HitResult {
  // x is absolute timeline space; the gutter is pinned to the viewport, so its test is local.
  if (x - scrollLeft.value < ROW_LABEL_WIDTH) {
    if (y < HEADER_HEIGHT) return { kind: "none" };
    const row = props.rows[rowIndexAt(y)];
    return row ? { kind: "row-label", row } : { kind: "none" };
  }

  if (y < HEADER_HEIGHT) {
    const ms = xToMs(x);
    for (const mark of allMarks()) {
      // The mark's own track, not track 0: with more than one track, deleting a mark that lives on
      // the second one used to filter track 0 for a millisecond it doesn't have and quietly do
      // nothing at all.
      if (Math.abs(msToX(mark) - x) < EDGE_PX) return { kind: "mark", trackIndex: trackOfMark(mark), ms: mark };
    }
    return { kind: "ruler-empty", trackIndex: trackForNewMark(), ms };
  }

  const rowIndex = rowIndexAt(y);
  const row = props.rows[rowIndex];
  if (!row) return { kind: "none" };

  const ms = xToMs(x);
  for (const effect of effectsForRow(row)) {
    if (ms >= effect.startMs && ms <= effect.endMs) {
      const nearLeft = Math.abs(msToX(effect.startMs) - x) < EDGE_PX;
      const nearRight = Math.abs(msToX(effect.endMs) - x) < EDGE_PX;
      return { kind: "effect", row, effect, edge: nearRight ? "right" : nearLeft ? "left" : null };
    }
  }
  return { kind: "row-empty", row };
}

function onScroll(): void {
  if (!scrollRef.value) return;
  scrollTop.value = scrollRef.value.scrollTop;
  draw();
}

function onDoubleClick(e: MouseEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollLeft.value;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);
  // xLights' Effects Grid > Double Click Mode: a double-click on a timing mark either plays that
  // mark's interval or opens its label for editing. Which of the two is the page's business - the
  // grid only says that it happened, and on which mark.
  if (hit.kind === "mark") {
    emit("markDoubleClick", hit.trackIndex, hit.ms);
    return;
  }
  // Double-clicking a group or model's name opens it, the way the "+" does in xLights. On the
  // label rather than on the grid, so it can't be confused with the effect wheel.
  if (hit.kind === "row-label") {
    if (hit.row.expanded !== undefined) emit("rowExpand", hit.row);
    return;
  }
  if (hit.kind !== "row-empty") return;
  emit("wheel", hit.row, snapMs(xToMs(x)), e.clientX, e.clientY);
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollLeft.value;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);

  if (hit.kind === "effect") {
    emit("contextmenu", { kind: "effect", row: hit.row, effect: hit.effect, ms: xToMs(x), x: e.clientX, y: e.clientY });
  } else if (hit.kind === "mark") {
    emit("contextmenu", { kind: "mark", trackIndex: hit.trackIndex, ms: hit.ms, x: e.clientX, y: e.clientY });
  } else if (hit.kind === "ruler-empty") {
    emit("contextmenu", { kind: "ruler-empty", trackIndex: hit.trackIndex, ms: hit.ms, x: e.clientX, y: e.clientY });
  } else if (hit.kind === "row-label") {
    emit("contextmenu", { kind: "row-label", row: hit.row, x: e.clientX, y: e.clientY });
  }
  // row-empty / none: no menu (placement already has its own gesture - armed palette + drag)
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollLeft.value;
  const y = e.clientY - rect.top;
  const hit = hitTest(x, y);

  // What the press means is decided in lib/gridGesture.ts rather than by the shape of the
  // branching here: two gestures that both use shift once collided in this function, and the one
  // that lost simply stopped existing.
  const gesture = gestureFor(hit, { shiftKey: e.shiftKey });

  if (gesture === "add-mark" && hit.kind === "ruler-empty") {
    emit("addMark", hit.trackIndex, hit.ms);
    return;
  }
  if (gesture === "none") return; // a mark: right-click deletes, nothing happens on press

  // Every gesture from here on is a drag, and a drag that wanders off the canvas has to keep
  // hearing the pointer - above all the release, or a span drawn out past the edge of the grid
  // would never land.
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // No such pointer (a synthetic event): the drag still works, it just can't leave the canvas.
  }

  if (hit.kind === "effect") {
    // Shift picks the reference out of a block that already exists ("hold down shift and click the
    // effect you want to be the reference"); an ordinary click selects just this one.
    const next = selectionAfterClick(props.selectedEffectIds ?? [], hit.effect.id, e.shiftKey);
    emit("selectMany", next.selected, next.reference);
    if (gesture === "pick-reference") return;

    const rowIndex = rowIndexAt(y);
    if (gesture === "fade" && hit.edge) {
      emit("dragStart"); // the fade previews by redrawing its own wedge, so it commits live
      dragState = { kind: "fade", effect: hit.effect, edge: hit.edge };
    } else if (gesture === "resize" && hit.edge) {
      dragState = { kind: "resize", effect: hit.effect, rowIndex, edge: hit.edge, ghost: null };
    } else {
      dragState = {
        kind: "move",
        effect: hit.effect,
        dragged: draggedBlock(hit.effect, rowIndex, next.selected),
        grabOffsetMs: xToMs(x) - hit.effect.startMs,
        fromRow: rowIndex,
        fromX: x,
        fromY: y,
        moved: false,
        ghosts: [],
      };
    }
    return;
  }

  // An empty row: a *drag* draws out an effect, a click seeks. Decided on pointerup rather than
  // here, because which one it was isn't known until the pointer either moves or doesn't - and
  // seeking on the way into a drag would drag the playhead along with it. The band below works
  // the same way.
  if (gesture === "place" && hit.kind === "row-empty") {
    const pressMs = xToMs(x);
    const gap = freeGapAt(pressMs, effectsForRow(hit.row), props.durationMs);
    dragState = { kind: "place", row: hit.row, rowIndex: rowIndexAt(y), pressMs, gap, fromX: x, fromY: y, ghost: null };
    return;
  }

  dragState = { kind: "band", fromX: x, fromY: y, toX: x, toY: y, dragging: false };
}

function updateHoverCursor(x: number, y: number): void {
  const hit = hitTest(x, y);
  if (hit.kind === "effect") hoverCursor.value = hit.edge ? "col-resize" : "grab";
  else if (hit.kind === "mark") hoverCursor.value = "pointer";
  else hoverCursor.value = "crosshair";
}

function onPointerMove(e: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + scrollLeft.value;
  const y = e.clientY - rect.top;

  if (!dragState) {
    updateHoverCursor(x, y);
    return;
  }

  if (dragState.kind === "band") {
    dragState.toX = x;
    dragState.toY = y;
    if (!dragState.dragging && isDrag(dragState.fromX, dragState.fromY, x, y)) dragState.dragging = true;
    if (dragState.dragging) {
      hoverCursor.value = "crosshair";
      draw();
    }
    return;
  }

  const ms = xToMs(x);

  if (dragState.kind === "place") {
    if (!dragState.ghost && !isDrag(dragState.fromX, dragState.fromY, x, y)) return;
    // Both ends snap, like every other edge on the grid, and the span stays in the gap it was
    // started in. Never blocked, for that reason: there is nothing in a gap to collide with.
    const span = dragOutSpan(dragState.gap, snapMs(dragState.pressMs), snapMs(ms), props.minEffectMs ?? MINIMUM_EFFECT_MS);
    dragState.ghost = { id: "place", rowIndex: dragState.rowIndex, ...span, blocked: false };
    draw();
    return;
  }
  if (dragState.kind === "resize") {
    hoverCursor.value = "col-resize";
    const snapped = snapMs(ms);
    const effect = dragState.effect;
    const bounds =
      dragState.edge === "right"
        ? { startMs: effect.startMs, endMs: Math.max(effect.startMs + MINIMUM_EFFECT_MS, snapped) }
        : { startMs: Math.max(0, Math.min(effect.endMs - MINIMUM_EFFECT_MS, snapped)), endMs: effect.endMs };
    const [ghost] = previewMoves(
      [{ id: effect.id, ...bounds, rowIndex: dragState.rowIndex }],
      0,
      0,
      effectsByRow(),
      props.durationMs,
    );
    dragState.ghost = ghost ?? null;
    draw();
    return;
  }
  if (dragState.kind === "fade") {
    hoverCursor.value = "col-resize";
    // Unsnapped deliberately: a fade is a length by ear, not a boundary, and snapping it to the
    // nearest timing mark would quantise exactly the thing you are dragging to taste.
    emit("fade", dragState.effect.id, dragState.edge, fadeDurationAt(dragState.effect, dragState.edge, ms));
    return;
  }
  if (dragState.kind === "move") {
    if (!dragState.moved && !isDrag(dragState.fromX, dragState.fromY, x, y)) return;
    dragState.moved = true;
    hoverCursor.value = "grabbing";
    // The delta is taken from the effect actually grabbed, then applied to the whole block, so the
    // block keeps its shape however far it is dragged.
    const grabbed = dragState.dragged.find((d) => d.id === grabbedEffectId) ?? dragState.dragged[0];
    if (!grabbed) return;
    const deltaMs = Math.max(0, snapMs(ms - dragState.grabOffsetMs)) - grabbed.startMs;
    const deltaRows = rowIndexAt(y) - dragState.fromRow;
    dragState.ghosts = previewMoves(dragState.dragged, deltaMs, deltaRows, effectsByRow(), props.durationMs);
    draw();
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragState?.kind === "band") {
    const band = dragState;
    dragState = null;
    if (band.dragging) {
      const box = boxFromDrag(xToMs(band.fromX), rowIndexAt(band.fromY), xToMs(band.toX), rowIndexAt(band.toY));
      const ids = idsInBox(effectsByRow(), box);
      // A band that caught nothing still clears the selection - it is the gesture for "none of
      // these", and leaving the old block selected would make the next alignment act on it.
      emit("selectMany", ids, ids[0] ?? null);
    } else {
      emit("selectMany", [], null);
      emit("seek", xToMs(band.fromX));
    }
    draw();
    return;
  }

  if (dragState?.kind === "move") {
    const { moved, effect, fromRow } = dragState;
    const moves = acceptedMoves(dragState.ghosts, dragState.dragged);
    dragState = null;
    grabbedEffectId = null;
    if (moves.length > 0) emit("moveMany", moves);
    if (!moved) emit("effectClick", effect, anchorFor(e.clientX, fromRow));
    draw();
    return;
  }

  if (dragState?.kind === "resize") {
    const ghost = dragState.ghost;
    dragState = null;
    // A blocked resize releases as no change at all, the same rule the ghosts were showing.
    if (ghost && !ghost.blocked) emit("moveMany", [{ id: ghost.id, startMs: ghost.startMs, endMs: ghost.endMs, rowIndex: ghost.rowIndex }]);
    draw();
    return;
  }

  if (dragState?.kind === "place") {
    const { row, rowIndex, ghost, fromX } = dragState;
    dragState = null;
    if (ghost) {
      // What lands is exactly what the ghost showed, not a second calculation that could differ.
      emit("place", row, ghost.startMs, ghost.endMs, anchorFor(e.clientX, rowIndex));
    } else {
      emit("selectMany", [], null);
      emit("seek", xToMs(fromX));
    }
    draw();
    return;
  }
  dragState = null;
}

/** The drag was taken away (a touch scroll, the OS): nothing lands, and no ghost is left behind. */
function onPointerCancel(): void {
  dragState = null;
  grabbedEffectId = null;
  draw();
}

// A drag from the effect palette (SequencerPage.vue owns the gesture; this draws where it lands).
//
// The page asks where a pointer position falls, tells the grid the effect's would-be span, and
// the grid answers "blocked or not" and draws the outline - the same green/red ghost the manual
// describes for moving effects, because dropping a new one is the same question.
let dropGhost: GhostPlacement | null = null;

/** The row and snapped moment under a viewport point, or null when the point is off the rows. */
function dropTargetAt(clientX: number, clientY: number): { row: GridRow; rowIndex: number; ms: number; effect: SequenceEffect | null } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const x = clientX - rect.left + scrollLeft.value;
  const y = clientY - rect.top;
  const hit = hitTest(x, y);
  // Over an existing effect still reports the row: the ghost turns red there, which says "not
  // here" better than the outline vanishing would. The effect is reported too, because one kind
  // is a fine place to drop: a placeholder is a span waiting for exactly this.
  if (hit.kind !== "row-empty" && hit.kind !== "effect") return null;
  return { row: hit.row, rowIndex: rowIndexAt(y), ms: snapMs(xToMs(x)), effect: hit.kind === "effect" ? hit.effect : null };
}

/**
 * Draws the outline for a would-be drop, and says whether something is already there.
 *
 * `replacingId` is the placeholder a drop would fill, which can't be in its own way.
 */
function showDropGhost(rowIndex: number, startMs: number, endMs: number, replacingId?: string): boolean {
  const row = props.rows[rowIndex];
  const blocked = !row || effectsForRow(row).some((e) => e.id !== replacingId && startMs < e.endMs && endMs > e.startMs);
  dropGhost = { id: "drop", rowIndex, startMs, endMs, blocked };
  draw();
  return blocked;
}

function clearDropGhost(): void {
  if (!dropGhost) return;
  dropGhost = null;
  draw();
}

defineExpose({ dropTargetAt, showDropGhost, clearDropGhost });

onMounted(() => {
  rebuildDrawIndex();
  attachHScroll();
  if (scrollRef.value) {
    vScrollResize = new ResizeObserver(() => {
      viewportHeight.value = scrollRef.value?.clientHeight || viewportHeight.value;
    });
    vScrollResize.observe(scrollRef.value);
  }
  draw();
  window.addEventListener("resize", draw);
});
onUnmounted(() => {
  window.removeEventListener("resize", draw);
  hScrollEl?.removeEventListener("scroll", onHScroll);
  hScrollResize?.disconnect();
  vScrollResize?.disconnect();
});
// flush: "post" - draw() reads getBoundingClientRect(), which must run after Vue applies
// any template-derived inline sizing, not before (pre-flush default risks a stale 0px read
// on the same tick rows go from empty to populated - see DECISIONS.md M2 bug note).
//
// Split from the body watcher below. These all change without the sequence changing, and
// the playhead changes every frame; sharing one `deep: true` watcher meant Vue re-traversed
// all 5k effects on every playhead tick just to decide nothing in the body had moved.
watch(
  () => [
    props.rows,
    props.playheadMs,
    props.selectedEffectId,
    props.selectedEffectIds,
    props.pxPerMs,
    props.durationMs,
    props.rowHeight,
    props.showTransitionMarks,
    props.activeTrackIndex,
    props.colors,
    props.snapToTiming,
    // The canvas's own size: the resize observers draw before Vue has applied it (see Waveform).
    viewportWidth.value,
    viewportHeight.value,
  ],
  draw,
  { flush: "post" },
);
// The one deep watcher left, and the only thing that invalidates the draw snapshot.
watch(
  () => props.body,
  () => {
    rebuildDrawIndex();
    draw();
  },
  { deep: true, flush: "post" },
);
</script>

<template>
  <div ref="scrollRef" class="grid-scroll-viewport" @scroll="onScroll">
    <!-- + HEADER_HEIGHT: the pinned ruler covers the top of the canvas, so without it the scroll
         range ends 24px early and the last row never comes fully into view. -->
    <div class="grid-spacer" :style="{ height: `${rows.length * rowHeight + HEADER_HEIGHT}px`, width: `${totalWidth}px` }">
      <canvas
        ref="canvasRef"
        class="grid-canvas"
        :style="{ width: `${canvasWidth}px`, height: `${viewportHeight}px`, cursor: hoverCursor }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @dblclick="onDoubleClick"
        @contextmenu="onContextMenu"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll-viewport {
  /* In a flex column the grid takes what is left; anywhere else it is the height it always was. */
  flex: 1 1 0;
  height: 420px;
  min-height: 0;
  overflow-y: auto;
  /* explicit, not the default - if overflow-x is left unset, the CSS spec computes it to
     "auto" too whenever overflow-y isn't visible, silently turning this into a second,
     narrower horizontal scroll container that clips the wide canvas to its own box before
     the page's shared .h-scroll wrapper ever gets a chance to scroll it. */
  overflow-x: visible;
  position: relative;
}
.grid-spacer {
  position: relative;
}
.grid-canvas {
  display: block;
  position: sticky;
  top: 0;
}
</style>
