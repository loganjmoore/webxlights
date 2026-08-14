import type { ControllerRecord, ModelRecord } from "./api";

// xLights' controller visualiser (manual: Controllers tab): what is plugged in where, laid out
// controller by controller.
//
// The reason to build it isn't the picture - it is what the picture makes visible. Two models
// assigned to overlapping channel spans is a show-day bug of exactly the worst kind: nothing
// errors, the .fseq exports, and two props light each other's effects. Nothing in the app
// surfaced that before, because each model's assignment was only ever validated against the
// *controller's* span, never against the other models on it.

export interface ControllerSlot {
  model: ModelRecord;
  /** 1-based, absolute - the channel numbers a controller's own UI shows. */
  startChannel: number;
  endChannel: number;
  channelCount: number;
  /** Names of the other models on this controller whose channels this one collides with. */
  collidesWith: string[];
}

export interface ControllerLayout {
  controller: ControllerRecord;
  slots: ControllerSlot[];
  /** Channels the controller has that nothing is using. */
  freeChannels: number;
  /** Total channels claimed past the end of the controller's span, if any. */
  overrunChannels: number;
}

/**
 * Lays out each controller's models by channel, and reports what collides.
 *
 * `channelCountFor` is passed in rather than imported so this stays free of the render engine -
 * the caller already has the function that decides how many channels a model needs, and this is
 * about arithmetic on the answers rather than about geometry.
 */
export function controllerLayouts(
  controllers: ControllerRecord[],
  models: ModelRecord[],
  channelCountFor: (model: ModelRecord) => number,
): ControllerLayout[] {
  return controllers.map((controller) => {
    const slots: ControllerSlot[] = models
      .filter((m) => m.controller_id === controller.id && m.controller_offset != null)
      .map((model) => {
        const channelCount = model.channel_count ?? channelCountFor(model);
        const startChannel = controller.start_channel + (model.controller_offset ?? 0);
        return {
          model,
          startChannel,
          // Inclusive, so a one-channel model starts and ends on the same number - which is what
          // a controller's own UI shows and what someone counting on their fingers expects.
          endChannel: startChannel + Math.max(1, channelCount) - 1,
          channelCount,
          collidesWith: [],
        };
      })
      .sort((a, b) => a.startChannel - b.startChannel || a.model.name.localeCompare(b.model.name));

    // Pairwise rather than a sweep: a controller holds a few dozen models at most, and comparing
    // every pair means a model reports *all* of its collisions rather than only the next one
    // along - which is what you need when a mis-typed offset buries three props at once.
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!;
        const b = slots[j]!;
        if (a.endChannel < b.startChannel || b.endChannel < a.startChannel) continue;
        a.collidesWith.push(b.model.name);
        b.collidesWith.push(a.model.name);
      }
    }

    const controllerEnd = controller.start_channel + controller.channel_count - 1;
    const used = new Set<number>();
    let overrun = 0;
    for (const slot of slots) {
      for (let c = slot.startChannel; c <= slot.endChannel; c++) {
        if (c > controllerEnd) overrun++;
        else used.add(c);
      }
    }

    return {
      controller,
      slots,
      freeChannels: Math.max(0, controller.channel_count - used.size),
      overrunChannels: overrun,
    };
  });
}

/** Models assigned to no controller at all - they still export, but at wherever there's room. */
export function unassignedModels(models: ModelRecord[]): ModelRecord[] {
  return models.filter((m) => m.supported && (m.controller_id == null || m.controller_offset == null));
}

/** Where a slot sits within its controller's span, as percentages, for drawing the bar. */
export function slotBarStyle(layout: ControllerLayout, slot: ControllerSlot): { left: string; width: string } {
  const span = Math.max(1, layout.controller.channel_count);
  const offset = slot.startChannel - layout.controller.start_channel;
  const left = Math.max(0, Math.min(100, (offset / span) * 100));
  // Floored at a hair's width so a single-channel model on a 512-channel controller is still
  // visible - a bar you can't see is the same as a model that isn't shown.
  const width = Math.max(0.6, Math.min(100 - left, (slot.channelCount / span) * 100));
  return { left: `${left}%`, width: `${width}%` };
}

export interface Allocation {
  modelId: number;
  controllerId: number;
  controllerOffset: number;
  channelCount: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Models there was no room for, with why. */
  unplaced: Array<{ model: ModelRecord; reason: string }>;
}

/**
 * xLights' auto start-channel allocation: give every unassigned model a home.
 *
 * Packs models into the first controller with room, in the order given, starting after everything
 * already assigned. Existing assignments are never moved - someone who has hand-placed a model
 * has done so for a reason, usually because a physical port starts there, and silently
 * repositioning it would break the wiring rather than the spreadsheet.
 *
 * First-fit rather than best-fit on purpose: best-fit packs tighter but scatters related props
 * across controllers, and a run of models created together almost always wants to be contiguous.
 */
export function allocateStartChannels(
  controllers: ControllerRecord[],
  models: ModelRecord[],
  channelCountFor: (model: ModelRecord) => number,
): AllocationResult {
  const active = controllers.filter((c) => c.active);
  // Where each controller is already full up to. Taken from the highest end of anything on it, so
  // a gap left by hand stays a gap - it is usually there to match a physical port boundary.
  const nextFree = new Map<number, number>();
  for (const controller of active) nextFree.set(controller.id, 0);
  for (const model of models) {
    if (model.controller_id == null || model.controller_offset == null) continue;
    const used = model.controller_offset + Math.max(1, model.channel_count ?? channelCountFor(model));
    nextFree.set(model.controller_id, Math.max(nextFree.get(model.controller_id) ?? 0, used));
  }

  const allocations: Allocation[] = [];
  const unplaced: AllocationResult["unplaced"] = [];

  for (const model of unassignedModels(models)) {
    const channelCount = Math.max(1, model.channel_count ?? channelCountFor(model));
    if (channelCount <= 0) continue;

    const home = active.find((c) => (nextFree.get(c.id) ?? 0) + channelCount <= c.channel_count);
    if (!home) {
      unplaced.push({
        model,
        reason: active.length === 0 ? "no active controller" : `needs ${channelCount} channels; none has that many free`,
      });
      continue;
    }
    const offset = nextFree.get(home.id) ?? 0;
    allocations.push({ modelId: model.id, controllerId: home.id, controllerOffset: offset, channelCount });
    nextFree.set(home.id, offset + channelCount);
  }

  return { allocations, unplaced };
}
