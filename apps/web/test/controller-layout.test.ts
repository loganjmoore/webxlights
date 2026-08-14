import { describe, expect, it } from "vitest";
import { allocateStartChannels, controllerLayouts, slotBarStyle, unassignedModels } from "../src/lib/controllerLayout";
import type { ControllerRecord, ModelRecord } from "../src/lib/api";

const controller: ControllerRecord = {
  id: 1,
  project_id: 1,
  name: "Front",
  protocol: "E131",
  ip_address: "192.168.1.50",
  start_channel: 1,
  channel_count: 512,
  vendor: null,
  model: null,
  active: true,
};

function model(over: Partial<ModelRecord> & { name: string }): ModelRecord {
  return {
    id: Math.floor(Math.random() * 1e6),
    name: over.name,
    type: "Matrix",
    supported: true,
    params: {},
    raw_attrs: {},
    screen: {},
    controller_id: 1,
    controller_offset: 0,
    channel_count: 30,
    ...over,
  } as ModelRecord;
}

const countFor = (m: ModelRecord) => m.channel_count ?? 0;

describe("laying a controller's models out by channel", () => {
  it("puts each model at its absolute channel, inclusive at both ends", () => {
    // A one-channel model starts and ends on the same number, which is what a controller's own
    // UI shows and what someone counting on their fingers expects.
    const layout = controllerLayouts([controller], [model({ name: "Relay", controller_offset: 0, channel_count: 1 })], countFor)[0]!;
    expect(layout.slots[0]!.startChannel).toBe(1);
    expect(layout.slots[0]!.endChannel).toBe(1);
  });

  it("honours a controller that doesn't start at channel 1", () => {
    const later = { ...controller, start_channel: 1000 };
    const layout = controllerLayouts([later], [model({ name: "Tree", controller_offset: 20, channel_count: 30 })], countFor)[0]!;
    expect(layout.slots[0]!.startChannel).toBe(1020);
    expect(layout.slots[0]!.endChannel).toBe(1049);
  });

  it("orders models by where they sit, not by how they were added", () => {
    const layout = controllerLayouts(
      [controller],
      [model({ name: "Later", controller_offset: 100 }), model({ name: "Earlier", controller_offset: 0 })],
      countFor,
    )[0]!;
    expect(layout.slots.map((s) => s.model.name)).toEqual(["Earlier", "Later"]);
  });

  it("leaves out models with no controller or no offset", () => {
    const layout = controllerLayouts(
      [controller],
      [model({ name: "Assigned" }), model({ name: "No offset", controller_offset: null }), model({ name: "Other box", controller_id: 99 })],
      countFor,
    )[0]!;
    expect(layout.slots.map((s) => s.model.name)).toEqual(["Assigned"]);
  });
});

describe("collisions, which are the reason this exists", () => {
  it("reports two models sharing channels", () => {
    // Nothing errors on an overlap: the .fseq exports and two props light each other's effects.
    // Each model's assignment was only ever checked against the controller's span, never against
    // the other models on it.
    const layout = controllerLayouts(
      [controller],
      [model({ name: "Tree", controller_offset: 0, channel_count: 60 }), model({ name: "Arch", controller_offset: 30, channel_count: 30 })],
      countFor,
    )[0]!;
    expect(layout.slots[0]!.collidesWith).toEqual(["Arch"]);
    expect(layout.slots[1]!.collidesWith).toEqual(["Tree"]);
  });

  it("reports every model a mis-typed offset buries, not just the next one along", () => {
    const layout = controllerLayouts(
      [controller],
      [
        model({ name: "Wide", controller_offset: 0, channel_count: 300 }),
        model({ name: "A", controller_offset: 10, channel_count: 10 }),
        model({ name: "B", controller_offset: 100, channel_count: 10 }),
      ],
      countFor,
    )[0]!;
    expect(layout.slots.find((s) => s.model.name === "Wide")!.collidesWith.sort()).toEqual(["A", "B"]);
  });

  it("says nothing about models that merely touch", () => {
    // Back to back is the normal, correct arrangement - flagging it would make the warning
    // useless by firing on every well-packed controller.
    const layout = controllerLayouts(
      [controller],
      [model({ name: "First", controller_offset: 0, channel_count: 30 }), model({ name: "Second", controller_offset: 30, channel_count: 30 })],
      countFor,
    )[0]!;
    expect(layout.slots.every((s) => s.collidesWith.length === 0)).toBe(true);
  });
});

describe("what's left, and what doesn't fit", () => {
  it("counts the channels nothing is using", () => {
    const layout = controllerLayouts([controller], [model({ name: "Tree", controller_offset: 0, channel_count: 100 })], countFor)[0]!;
    expect(layout.freeChannels).toBe(412);
  });

  it("counts overlapping channels once, so free space isn't overstated", () => {
    const layout = controllerLayouts(
      [controller],
      [model({ name: "A", controller_offset: 0, channel_count: 100 }), model({ name: "B", controller_offset: 0, channel_count: 100 })],
      countFor,
    )[0]!;
    expect(layout.freeChannels).toBe(412);
  });

  it("reports channels claimed past the end of the controller", () => {
    // The per-model check catches this at assignment time; this catches it for a model whose node
    // count grew afterwards - editing a matrix's size doesn't revisit its offset.
    const layout = controllerLayouts([controller], [model({ name: "Big", controller_offset: 500, channel_count: 100 })], countFor)[0]!;
    expect(layout.overrunChannels).toBe(88);
  });

  it("falls back to the computed channel count when a model has none stored", () => {
    const layout = controllerLayouts(
      [controller],
      [model({ name: "Fresh", controller_offset: 0, channel_count: undefined })],
      () => 45,
    )[0]!;
    expect(layout.slots[0]!.channelCount).toBe(45);
  });
});

describe("unassigned models", () => {
  it("lists supported models with no controller or no offset", () => {
    const list = unassignedModels([
      model({ name: "Assigned" }),
      model({ name: "Loose", controller_id: null }),
      model({ name: "No offset", controller_offset: null }),
      model({ name: "Placeholder", supported: false, controller_id: null }),
    ]);
    expect(list.map((m) => m.name).sort()).toEqual(["Loose", "No offset"]);
  });
});

describe("the bar each model gets", () => {
  it("places and sizes it within the controller's span", () => {
    const layout = controllerLayouts([controller], [model({ name: "Half", controller_offset: 256, channel_count: 256 })], countFor)[0]!;
    const style = slotBarStyle(layout, layout.slots[0]!);
    expect(style.left).toBe("50%");
    expect(style.width).toBe("50%");
  });

  it("keeps a one-channel model visible on a big controller", () => {
    // A bar too thin to see is the same as a model that isn't shown at all.
    const layout = controllerLayouts([controller], [model({ name: "Relay", controller_offset: 0, channel_count: 1 })], countFor)[0]!;
    expect(parseFloat(slotBarStyle(layout, layout.slots[0]!).width)).toBeGreaterThan(0.5);
  });

  it("never runs a bar off the end of its track", () => {
    const layout = controllerLayouts([controller], [model({ name: "Over", controller_offset: 500, channel_count: 200 })], countFor)[0]!;
    const style = slotBarStyle(layout, layout.slots[0]!);
    expect(parseFloat(style.left) + parseFloat(style.width)).toBeLessThanOrEqual(100);
  });
});

describe("auto start-channel allocation", () => {
  const small: ControllerRecord = { ...controller, id: 2, name: "Small", channel_count: 100, start_channel: 1000 };

  it("packs unassigned models into the first controller with room", () => {
    const result = allocateStartChannels(
      [controller],
      [model({ name: "A", controller_id: null, channel_count: 30 }), model({ name: "B", controller_id: null, channel_count: 30 })],
      countFor,
    );
    expect(result.allocations.map((a) => a.controllerOffset)).toEqual([0, 30]);
    expect(result.unplaced).toEqual([]);
  });

  it("never moves a model someone assigned by hand", () => {
    // A hand-placed model is usually where it is because a physical port starts there. Silently
    // repositioning it would break the wiring rather than the spreadsheet.
    const fixed = model({ name: "Hand placed", controller_offset: 200, channel_count: 30 });
    const result = allocateStartChannels([controller], [fixed, model({ name: "New", controller_id: null, channel_count: 30 })], countFor);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]!.modelId).not.toBe(fixed.id);
  });

  it("starts after everything already on the controller, so it can't collide with it", () => {
    const result = allocateStartChannels(
      [controller],
      [model({ name: "Existing", controller_offset: 0, channel_count: 90 }), model({ name: "New", controller_id: null, channel_count: 30 })],
      countFor,
    );
    expect(result.allocations[0]!.controllerOffset).toBe(90);
  });

  it("leaves a hand-made gap alone rather than filling it", () => {
    // A gap is usually there to match a port boundary, so packing into it would undo a deliberate
    // choice - and the model that got tucked in there would be the one that broke.
    const result = allocateStartChannels(
      [controller],
      [model({ name: "High", controller_offset: 300, channel_count: 30 }), model({ name: "New", controller_id: null, channel_count: 30 })],
      countFor,
    );
    expect(result.allocations[0]!.controllerOffset).toBe(330);
  });

  it("moves on to the next controller when the first is full", () => {
    const result = allocateStartChannels(
      [{ ...controller, channel_count: 50 }, small],
      [model({ name: "Big", controller_id: null, channel_count: 80 })],
      countFor,
    );
    expect(result.allocations[0]!.controllerId).toBe(small.id);
  });

  it("skips inactive controllers", () => {
    const result = allocateStartChannels(
      [{ ...controller, active: false }],
      [model({ name: "A", controller_id: null, channel_count: 30 })],
      countFor,
    );
    expect(result.allocations).toEqual([]);
    expect(result.unplaced[0]!.reason).toBe("no active controller");
  });

  it("says which models it couldn't place, and why", () => {
    const result = allocateStartChannels(
      [{ ...controller, channel_count: 50 }],
      [model({ name: "Too big", controller_id: null, channel_count: 500 })],
      countFor,
    );
    expect(result.allocations).toEqual([]);
    expect(result.unplaced[0]!.model.name).toBe("Too big");
    expect(result.unplaced[0]!.reason).toContain("500 channels");
  });

  it("produces an allocation that has no collisions", () => {
    // The whole point: run it, apply it, and the visualiser should have nothing to complain about.
    const models = Array.from({ length: 8 }, (_, i) => model({ name: `M${i}`, controller_id: null, channel_count: 30 + i }));
    const result = allocateStartChannels([controller], models, countFor);
    const applied = models.map((m) => {
      const a = result.allocations.find((x) => x.modelId === m.id)!;
      return { ...m, controller_id: a.controllerId, controller_offset: a.controllerOffset };
    });
    const layout = controllerLayouts([controller], applied, countFor)[0]!;
    expect(layout.slots.every((s) => s.collidesWith.length === 0)).toBe(true);
    expect(layout.overrunChannels).toBe(0);
  });
});
