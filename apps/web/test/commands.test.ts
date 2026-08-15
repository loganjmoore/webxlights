import { describe, expect, it, vi } from "vitest";
import {
  EFFECT_SHORTCUTS,
  buildCommands,
  commandForEvent,
  isTypingTarget,
  searchCommands,
  type CommandContext,
} from "../src/lib/commands";

function context(): CommandContext & Record<string, ReturnType<typeof vi.fn>> {
  const keys = [
    "togglePlay",
    "seekStart",
    "seekEnd",
    "nudgePlayhead",
    "addTimingMark",
    "splitTimingMark",
    "deleteSelected",
    "copySelected",
    "pasteAtPlayhead",
    "duplicateSelected",
    "undo",
    "redo",
    "zoomIn",
    "zoomOut",
    "placeEffect",
    "placeRandomEffect",
    "openPalette",
    "exportFseq",
    "snapshot",
  ] as const;
  return Object.fromEntries(keys.map((k) => [k, vi.fn()])) as never;
}

function run(e: Parameters<typeof commandForEvent>[1], ctx = context()) {
  const command = commandForEvent(buildCommands(ctx), e);
  command?.run();
  return { command, ctx };
}

describe("dispatching a key to a command", () => {
  it("plays on space", () => {
    const { ctx } = run({ key: " ", code: "Space" });
    expect(ctx.togglePlay).toHaveBeenCalled();
  });

  it("undoes and redoes on the same key, told apart by shift", () => {
    expect(run({ key: "z", ctrlKey: true }).ctx.undo).toHaveBeenCalled();
    expect(run({ key: "z", ctrlKey: true, shiftKey: true }).ctx.redo).toHaveBeenCalled();
  });

  it("takes the platform's modifier either way round", () => {
    expect(run({ key: "z", metaKey: true }).ctx.undo).toHaveBeenCalled();
  });

  it("copies on Ctrl+C rather than placing Curtain", () => {
    // The bare letter `c` is xLights' Curtain shortcut, so the modifier commands have to be
    // matched first or every copy would drop an effect on the grid.
    const { ctx } = run({ key: "c", ctrlKey: true });
    expect(ctx.copySelected).toHaveBeenCalled();
    expect(ctx.placeEffect).not.toHaveBeenCalled();
  });

  it("places Curtain on a bare c", () => {
    const { ctx } = run({ key: "c" });
    expect(ctx.placeEffect).toHaveBeenCalledWith("Curtain");
  });

  it("tells an upper-case shortcut from its lower-case one", () => {
    // `o` is On and `O` is Off in xLights. Lower-casing the key would collapse them into one, and
    // the effect you got would depend on which came first in the list.
    expect(run({ key: "o" }).ctx.placeEffect).toHaveBeenCalledWith("On");
    expect(run({ key: "O", shiftKey: true }).ctx.placeEffect).toHaveBeenCalledWith("Off");
    expect(run({ key: "f" }).ctx.placeEffect).toHaveBeenCalledWith("Fire");
    expect(run({ key: "F", shiftKey: true }).ctx.placeEffect).toHaveBeenCalledWith("Fan");
  });

  it("takes either key the + sign arrives as", () => {
    // On most layouts the zoom-in key is typed as `=` without shift, so accepting only `+` makes
    // the documented shortcut do nothing on a US keyboard.
    expect(run({ key: "+" }).ctx.zoomIn).toHaveBeenCalled();
    expect(run({ key: "=" }).ctx.zoomIn).toHaveBeenCalled();
  });

  it("opens the palette on the key the manual documents", () => {
    expect(run({ key: "k", ctrlKey: true, shiftKey: true }).ctx.openPalette).toHaveBeenCalled();
  });

  it("nudges the playhead both ways", () => {
    const back = context();
    commandForEvent(buildCommands(back), { key: "ArrowLeft" })?.run();
    expect(back.nudgePlayhead).toHaveBeenCalledWith(-100);

    const forward = context();
    commandForEvent(buildCommands(forward), { key: "ArrowRight" })?.run();
    expect(forward.nudgePlayhead).toHaveBeenCalledWith(100);
  });

  it("has no command for a key it doesn't know", () => {
    expect(commandForEvent(buildCommands(context()), { key: "Q" })).toBeUndefined();
  });

  it("ignores a bare letter that arrived with a modifier it doesn't ask for", () => {
    expect(commandForEvent(buildCommands(context()), { key: "b", altKey: true })).toBeUndefined();
  });
});

describe("the registry itself", () => {
  it("gives every command a unique id", () => {
    const ids = buildCommands(context()).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never gives two commands the same key", () => {
    // Two commands matching one event means the second is unreachable, and which one loses
    // depends on list order rather than on anything anyone decided.
    const commands = buildCommands(context());
    const events = [
      { key: " ", code: "Space" },
      { key: "z", ctrlKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
      { key: "c", ctrlKey: true },
      { key: "d", ctrlKey: true },
      ...EFFECT_SHORTCUTS.map((s) => ({ key: s.key })),
    ];
    for (const e of events) {
      const hits = commands.filter((c) => c.matches?.(e));
      expect(hits.length, `${JSON.stringify(e)} matched ${hits.map((h) => h.id).join(", ")}`).toBe(1);
    }
  });

  it("labels every keyed command, so the help list can't have a blank row", () => {
    for (const command of buildCommands(context())) {
      if (command.matches) expect(command.keyLabel, command.id).toBeTruthy();
    }
  });

  it("includes commands with no key at all, which is what the palette is for", () => {
    const commands = buildCommands(context());
    expect(commands.some((c) => !c.matches && c.id === "file.export")).toBe(true);
  });
});

describe("not stealing keys from whatever is being typed into", () => {
  it("recognises the fields a key belongs to", () => {
    // Without this every effect shortcut fires while naming a view: "Bars" would place four
    // effects and never reach the text field.
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("searching the palette", () => {
  it("returns everything for an empty query", () => {
    const commands = buildCommands(context());
    expect(searchCommands(commands, "  ")).toHaveLength(commands.length);
  });

  it("matches on the label and on the group", () => {
    const commands = buildCommands(context());
    expect(searchCommands(commands, "undo").map((c) => c.id)).toContain("edit.undo");
    expect(searchCommands(commands, "transport").length).toBeGreaterThan(1);
  });

  it("ranks a prefix match above one buried in the middle", () => {
    const commands = buildCommands(context());
    const results = searchCommands(commands, "zoom");
    expect(results[0]!.label.toLowerCase().startsWith("zoom")).toBe(true);
  });

  it("finds nothing for a query nothing matches", () => {
    expect(searchCommands(buildCommands(context()), "xyzzy")).toEqual([]);
  });
});

// Found by re-reading the manual's shortcuts page against this table: it lists eighteen effect
// keys and this had fifteen. The two that were missing carry *parameters*, which is a shape the
// registry didn't have.
describe("shortcuts the manual lists that were missing", () => {
  it("u and d place On with its intensities swapped", () => {
    // "The On and Ramp Up/Down effects also enables the intensity to be defined as a shortcut
    // key... a start intensity set to zero and and end intensity set to 100%."
    const placed: Array<[string, Record<string, unknown> | undefined]> = [];
    const commands = buildCommands({ ...context(), placeEffect: (name, params) => placed.push([name, params]) });

    commandForEvent(commands, { key: "u" })?.run();
    commandForEvent(commands, { key: "d" })?.run();

    expect(placed[0]).toEqual(["On", { startIntensity: 0, endIntensity: 100 }]);
    expect(placed[1]).toEqual(["On", { startIntensity: 100, endIntensity: 0 }]);
  });

  it("a plain o still places On with no parameters of its own", () => {
    const placed: Array<[string, Record<string, unknown> | undefined]> = [];
    const commands = buildCommands({ ...context(), placeEffect: (name, params) => placed.push([name, params]) });
    commandForEvent(commands, { key: "o" })?.run();
    expect(placed[0]).toEqual(["On", undefined]);
  });

  it("Shift+R generates a random effect", () => {
    let called = 0;
    const commands = buildCommands({ ...context(), placeRandomEffect: () => called++ });
    commandForEvent(commands, { key: "R" })?.run();
    expect(called).toBe(1);
  });

  it("gives two shortcuts for one effect distinct ids", () => {
    // o, u and d all place On. A shared id would make the command palette show one of them and
    // silently drop the other two.
    const ids = buildCommands(context())
      .filter((c) => c.id.startsWith("effect.On"))
      .map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });
});
