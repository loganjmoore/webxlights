import { describe, expect, it } from "vitest";
import {
  PANEL_IDS,
  loadPerspectives,
  panelsFrom,
  removePerspective,
  savePerspectives,
  upsertPerspective,
  type PanelId,
  type Perspective,
} from "../src/lib/perspectives";

function storage(initial?: string) {
  let value = initial;
  return { getItem: () => value ?? null, setItem: (_k: string, v: string) => { value = v; } };
}

const sequencing: Perspective = { name: "Sequencing", panels: ["views", "presets"] };

describe("storing perspectives", () => {
  it("round-trips", () => {
    const store = storage();
    savePerspectives(store, [sequencing]);
    expect(loadPerspectives(store)).toEqual([sequencing]);
  });

  it("has none when nothing is stored", () => {
    expect(loadPerspectives(storage())).toEqual([]);
    expect(loadPerspectives(null)).toEqual([]);
  });

  it("falls back to none for a corrupt bag rather than failing to open the page", () => {
    expect(loadPerspectives(storage("{not json"))).toEqual([]);
    expect(loadPerspectives(storage('"a string"'))).toEqual([]);
  });

  it("drops a panel name it doesn't know", () => {
    // A panel renamed or removed since the perspective was saved would otherwise be restored as
    // a panel that no longer exists.
    const store = storage(JSON.stringify([{ name: "Old", panels: ["views", "a-panel-that-went-away"] }]));
    expect(loadPerspectives(store)[0]!.panels).toEqual(["views"]);
  });

  it("drops an entry with no name, which the picker couldn't show", () => {
    expect(loadPerspectives(storage(JSON.stringify([{ panels: ["views"] }])))).toEqual([]);
  });

  it("copes with no storage at all", () => {
    expect(() => savePerspectives(null, [sequencing])).not.toThrow();
  });
});

describe("editing the list", () => {
  it("replaces rather than duplicating when a name is reused", () => {
    // Two perspectives called "Sequencing" are indistinguishable in the picker, and picking the
    // wrong one is the failure the picker exists to avoid.
    const list = upsertPerspective([sequencing], { name: "Sequencing", panels: ["prefs"] });
    expect(list).toHaveLength(1);
    expect(list[0]!.panels).toEqual(["prefs"]);
  });

  it("keeps the list sorted, so the picker's order doesn't depend on save order", () => {
    const list = upsertPerspective(upsertPerspective([], { name: "Zoom", panels: [] }), { name: "Assembling", panels: [] });
    expect(list.map((p) => p.name)).toEqual(["Assembling", "Zoom"]);
  });

  it("removes by name", () => {
    expect(removePerspective([sequencing], "Sequencing")).toEqual([]);
    expect(removePerspective([sequencing], "Nothing")).toEqual([sequencing]);
  });
});

describe("capturing what's open", () => {
  it("lists the open panels in a stable order", () => {
    const open = Object.fromEntries(PANEL_IDS.map((id) => [id, false])) as Record<PanelId, boolean>;
    open.presets = true;
    open.models = true;
    // Ordered by the canonical list rather than by which was opened first, so the same
    // arrangement always saves as the same perspective.
    expect(panelsFrom(open)).toEqual(["models", "presets"]);
  });

  it("gives an empty list when nothing is open", () => {
    const open = Object.fromEntries(PANEL_IDS.map((id) => [id, false])) as Record<PanelId, boolean>;
    expect(panelsFrom(open)).toEqual([]);
  });
});
