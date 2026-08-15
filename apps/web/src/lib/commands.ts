// One registry for everything the sequencer can be told to do.
//
// The keyboard shortcuts, the command palette and the shortcut help list are all generated from
// this. That is the point of having it: xLights documents around sixty shortcuts, and keeping a
// switch statement, a help page and a palette in agreement by hand is exactly the kind of thing
// that drifts until a documented key does nothing.
//
// A command carries its own key, so a shortcut can't exist without a command and a command can't
// be given a key that nothing dispatches.

import { SUBDIVISIONS } from "./timingSubdivide";

export interface CommandContext {
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  nudgePlayhead: (deltaMs: number) => void;
  addTimingMark: () => void;
  splitTimingMark: () => void;
  /** Divides the marked region - or the interval under the playhead - into `parts`. */
  subdivideTiming: (parts: number) => void;
  deleteSelected: () => void;
  copySelected: () => void;
  pasteAtPlayhead: () => void;
  duplicateSelected: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  placeEffect: (name: string, params?: Record<string, number | boolean | string>) => void;
  /** xLights' `R`: "Generate Random effects". */
  placeRandomEffect: () => void;
  /** Up and Down move the selected effect between rows; nothing selected, nothing happens. */
  moveSelectedEffectVertically: (direction: -1 | 1) => void;
  openPalette: () => void;
  exportFseq: () => void;
  snapshot: () => void;
  /**
   * The effect shortcuts in force. Absent means xLights' own, which is what they were before they
   * could be changed (keybindings.ts).
   */
  effectShortcuts?: Array<{ key: string; effect: string; params?: Record<string, number | boolean | string> }>;
}

export interface Command {
  id: string;
  label: string;
  group: string;
  /** How the key is written in help and the palette, e.g. "Ctrl+Z" or "Shift+O". */
  keyLabel?: string;
  run: () => void;
  /** Whether a key event is this command. */
  matches?: (e: KeyEvent) => boolean;
}

/** The parts of a KeyboardEvent this cares about - so the matching can be tested without a DOM. */
export interface KeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

// xLights' effect shortcuts: a single letter drops that effect at the selection. Case matters -
// `o` is On and `O` is Off - which is why these match on `key` rather than on a lowercased code.
//
// A shortcut can carry parameters, which is what the manual means by "The On and Ramp Up/Down
// effects also enables the intensity to be defined as a shortcut key. Look at examples in the
// existing file which has a start intensity set to zero and and end intensity set to 100%" - `u`
// and `d` are the On effect with its two intensities swapped round.
//
// One key in the manual's table is deliberately not here: it gives `s` to both Timing Split and
// Spirals. A structural action beats an effect - splitting a timing mark can't be done any other
// way from the keyboard - so `s` stays with the split, and Spirals is bindable to any free key
// now that the bindings are editable (keybindings.ts).
export const EFFECT_SHORTCUTS: Array<{ key: string; effect: string; params?: Record<string, number | boolean | string> }> = [
  { key: "o", effect: "On" },
  { key: "O", effect: "Off" },
  { key: "u", effect: "On", params: { startIntensity: 0, endIntensity: 100 } },
  { key: "d", effect: "On", params: { startIntensity: 100, endIntensity: 0 } },
  { key: "b", effect: "Bars" },
  { key: "y", effect: "Butterfly" },
  { key: "c", effect: "Curtain" },
  { key: "i", effect: "Circles" },
  { key: "f", effect: "Fire" },
  { key: "F", effect: "Fan" },
  { key: "g", effect: "Garlands" },
  { key: "m", effect: "Morph" },
  { key: "p", effect: "Pinwheel" },
  { key: "r", effect: "Ripple" },
  { key: "n", effect: "Snowflakes" },
  { key: "w", effect: "Color Wash" },
  { key: "x", effect: "Text" },
];

const mod = (e: KeyEvent): boolean => Boolean(e.ctrlKey || e.metaKey);
const plain = (e: KeyEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey;

export function buildCommands(ctx: CommandContext): Command[] {
  const commands: Command[] = [
    {
      id: "transport.play",
      label: "Play / pause",
      group: "Transport",
      keyLabel: "Space",
      run: ctx.togglePlay,
      matches: (e) => e.code === "Space" && plain(e),
    },
    { id: "transport.start", label: "Go to start", group: "Transport", keyLabel: "Home", run: ctx.seekStart, matches: (e) => e.key === "Home" },
    { id: "transport.end", label: "Go to end", group: "Transport", keyLabel: "End", run: ctx.seekEnd, matches: (e) => e.key === "End" },
    {
      id: "transport.back",
      label: "Nudge back",
      group: "Transport",
      keyLabel: "←",
      run: () => ctx.nudgePlayhead(-100),
      matches: (e) => e.key === "ArrowLeft" && plain(e),
    },
    {
      id: "transport.forward",
      label: "Nudge forward",
      group: "Transport",
      keyLabel: "→",
      run: () => ctx.nudgePlayhead(100),
      matches: (e) => e.key === "ArrowRight" && plain(e),
    },

    {
      id: "edit.moveUp",
      label: "Move effect up a row",
      group: "Edit",
      keyLabel: "↑",
      run: () => ctx.moveSelectedEffectVertically(-1),
      matches: (e) => e.key === "ArrowUp" && plain(e),
    },
    {
      id: "edit.moveDown",
      label: "Move effect down a row",
      group: "Edit",
      keyLabel: "↓",
      run: () => ctx.moveSelectedEffectVertically(1),
      matches: (e) => e.key === "ArrowDown" && plain(e),
    },

    { id: "timing.mark", label: "Add timing mark", group: "Timing", keyLabel: "T", run: ctx.addTimingMark, matches: (e) => e.key === "t" && plain(e) },
    {
      id: "timing.split",
      label: "Split timing mark",
      group: "Timing",
      keyLabel: "S",
      run: ctx.splitTimingMark,
      matches: (e) => e.key === "s" && plain(e),
    },
    // Dividing timings. The manual says only that "keyboard shortcuts are available to divide the
    // selected timing marks by predefined intervals" - it names neither the keys nor the
    // intervals, so both are ours (timingSubdivide.ts explains the choice).
    ...SUBDIVISIONS.map((parts) => ({
      id: `timing.divide.${parts}`,
      label: `Divide timing into ${parts}`,
      group: "Timing",
      keyLabel: String(parts),
      run: () => ctx.subdivideTiming(parts),
      matches: (e: KeyEvent) => e.key === String(parts) && plain(e),
    })),

    {
      id: "edit.delete",
      label: "Delete effect",
      group: "Edit",
      keyLabel: "Del",
      run: ctx.deleteSelected,
      matches: (e) => (e.key === "Delete" || e.key === "Backspace") && plain(e),
    },
    { id: "edit.copy", label: "Copy effect", group: "Edit", keyLabel: "Ctrl+C", run: ctx.copySelected, matches: (e) => mod(e) && e.key.toLowerCase() === "c" },
    { id: "edit.paste", label: "Paste effect", group: "Edit", keyLabel: "Ctrl+V", run: ctx.pasteAtPlayhead, matches: (e) => mod(e) && e.key.toLowerCase() === "v" },
    {
      id: "edit.duplicate",
      label: "Duplicate effect",
      group: "Edit",
      keyLabel: "Ctrl+D",
      run: ctx.duplicateSelected,
      matches: (e) => mod(e) && e.key.toLowerCase() === "d",
    },
    {
      id: "edit.undo",
      label: "Undo",
      group: "Edit",
      keyLabel: "Ctrl+Z",
      run: ctx.undo,
      matches: (e) => mod(e) && e.key.toLowerCase() === "z" && !e.shiftKey,
    },
    {
      id: "edit.redo",
      label: "Redo",
      group: "Edit",
      keyLabel: "Ctrl+Shift+Z",
      run: ctx.redo,
      matches: (e) => mod(e) && e.key.toLowerCase() === "z" && Boolean(e.shiftKey),
    },

    // The manual lists both the bare keys and Ctrl+wheel; the keys are what a registry can own.
    { id: "view.zoomIn", label: "Zoom in", group: "View", keyLabel: "+", run: ctx.zoomIn, matches: (e) => (e.key === "+" || e.key === "=") && plain(e) },
    { id: "view.zoomOut", label: "Zoom out", group: "View", keyLabel: "−", run: ctx.zoomOut, matches: (e) => e.key === "-" && plain(e) },

    {
      id: "view.palette",
      label: "Command palette",
      group: "View",
      keyLabel: "Ctrl+Shift+K",
      run: ctx.openPalette,
      matches: (e) => mod(e) && Boolean(e.shiftKey) && e.key.toLowerCase() === "k",
    },

    // In the palette but with no key of their own: the palette is meant to reach everything, and
    // a command that can only be got at through a menu is exactly what it exists to replace.
    { id: "file.export", label: "Export .fseq", group: "File", run: ctx.exportFseq },
    { id: "file.snapshot", label: "Save a snapshot", group: "File", run: ctx.snapshot },
  ];

  commands.push({
    id: "effect.random",
    label: "Place a random effect",
    group: "Effects",
    keyLabel: "Shift+R",
    run: ctx.placeRandomEffect,
    matches: (e) => e.key === "R" && plain(e),
  });

  for (const { key, effect, params } of ctx.effectShortcuts ?? EFFECT_SHORTCUTS) {
    commands.push({
      // Two shortcuts can place the same effect with different parameters - `o`, `u` and `d` are
      // all On - so the id has to carry the key rather than only the effect name.
      id: `effect.${effect}.${key}`,
      label: params ? `Place ${effect} (${key === "u" ? "fade up" : "fade down"})` : `Place ${effect}`,
      group: "Effects",
      // Upper-case letters are a distinct shortcut in xLights, not a variant - `o` is On and `O`
      // is Off - so the label has to say which.
      keyLabel: key === key.toUpperCase() && key !== key.toLowerCase() ? `Shift+${key}` : key.toUpperCase(),
      // Only passed when there are any: a shortcut without parameters should call this the way
      // it always has, rather than with an explicit undefined.
      run: () => (params ? ctx.placeEffect(effect, params) : ctx.placeEffect(effect)),
      matches: (e) => e.key === key && plain(e),
    });
  }

  return commands;
}

/**
 * The command a key event should run, if any.
 *
 * First match wins, and the order above is deliberate: the modifier commands come before the
 * bare-letter effect shortcuts, so Ctrl+C copies rather than placing Curtain.
 */
export function commandForEvent(commands: Command[], e: KeyEvent): Command | undefined {
  return commands.find((c) => c.matches?.(e));
}

/**
 * Whether a key event should be ignored because the user is typing into something.
 *
 * Without this every effect shortcut fires while naming a view - "Bars" would place four effects
 * and never reach the text field.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** Commands matching a palette query, ranked so a prefix match beats one buried in the middle. */
export function searchCommands(commands: Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands
    .map((c) => ({ c, at: `${c.group} ${c.label}`.toLowerCase().indexOf(needle) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at || a.c.label.localeCompare(b.c.label))
    .map(({ c }) => c);
}
