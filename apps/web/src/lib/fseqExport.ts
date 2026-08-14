import { writeFseqV2 } from "@webxlights/formats";
import {
  applyGroupBase,
  computeGeometryFromAttrs,
  computeSubModel,
  createRowSequencer,
  DEFAULT_PALETTE,
  channelBlockBytes,
  channelColorsFrom,
  channelsPerNodeFor,
  defaultChannelColorFrom,
  nodeColorsToChannelBytes,
  planGroupRendering,
  scatterGroupColors,
  type AudioSeries,
  type ModelGeometry,
  type RGBA,
} from "@webxlights/engine";
import type { ControllerRecord, ModelGroupRecord, ModelRecord, SequenceBody, SequenceRecord } from "./api";
import { groupRenderSpecs } from "./groupRendering";
import { toRenderableEffects } from "./renderableEffects";

const SEED = 12345;

function extractRgbOrder(stringType: string | null): string {
  const match = stringType?.match(/^([RGB]{3})/i);
  return match ? match[1]!.toUpperCase() : "RGB";
}

// Same geometry call the M11 controller-assignment UI uses to validate an offset against a
// controller's channel_count before saving - one source of truth for "how many bytes does
// this model need" instead of two.
export function channelCountForModel(model: Pick<ModelRecord, "type" | "raw_attrs">): number {
  try {
    const geo = computeGeometryFromAttrs(model.type, model.raw_attrs);
    // Not always three: a Channel Block drives one device per channel, so it is one byte each.
    // Assuming three would have a 24-channel relay board claim 72, shifting every model after it
    // on the controller by 48 - which lights the wrong props, and does it silently.
    return geo ? geo.nodes.length * channelsPerNodeFor(model.type) : 0;
  } catch {
    return 0;
  }
}

// M11: real controller-routed addressing, not layout-order concatenation. controller.start_channel
// is user-authoritative (not auto-allocated - the reference screenshot shows it hand-edited
// directly), so a controller-assigned model's byte position is controller.start_channel - 1 +
// controller_offset. Unassigned models keep writing sequentially, starting right after the
// highest controller-routed span - this is a real, stated behavior change: the moment any
// controller exists and has models assigned, unassigned models' byte positions shift from the
// pre-M11 offset-0 start. See DECISIONS.md M11.
export function exportSequenceToFseq(
  models: ModelRecord[],
  body: SequenceBody,
  sequence: SequenceRecord,
  controllers: ControllerRecord[] = [],
  // The analysed track, so an audio-reactive effect exports the same frames the preview shows.
  // Omitted (no audio loaded) those effects render as "no audio", not as silence.
  audio?: AudioSeries,
  // Model groups, so group rows export. Omitted, a sequence's group rows contribute nothing -
  // which is what this export did for every group row before groups rendered at all.
  groups: ModelGroupRecord[] = [],
): Uint8Array {
  const frameMs = sequence.frame_ms;
  const frameCount = Math.max(1, Math.ceil(sequence.duration_ms / frameMs));

  const supported = models.filter((m) => m.supported);
  const geometries: Array<ModelGeometry | null> = supported.map((m) => {
    try {
      return computeGeometryFromAttrs(m.type, m.raw_attrs);
    } catch {
      return null;
    }
  });
  const rgbOrders = supported.map((m) => extractRgbOrder(m.string_type));
  // A Channel Block's channels are single devices - relays, AC lights, a smoke machine - so each
  // takes one byte, and which of the rendered pixel's channels drives it is the model's own
  // Channel Color setting.
  const singleChannel = supported.map((m) =>
    m.type === "Channel Block"
      ? { colors: channelColorsFrom(m.raw_attrs), fallback: defaultChannelColorFrom(m.raw_attrs) }
      : null,
  );
  const byteCounts = geometries.map((g, i) => (g ? g.nodes.length * channelsPerNodeFor(supported[i]!.type) : 0));

  const activeControllers = controllers.filter((c) => c.active);
  const controllerSpanEnd = activeControllers.reduce((max, c) => Math.max(max, c.start_channel - 1 + c.channel_count), 0);

  let unassignedCursor = controllerSpanEnd;
  const byteOffsets = supported.map((m, i) => {
    const controller = m.controller_id != null ? controllers.find((c) => c.id === m.controller_id) : undefined;
    if (controller && m.controller_offset != null) {
      return controller.start_channel - 1 + m.controller_offset;
    }
    const offset = unassignedCursor;
    unassignedCursor += byteCounts[i]!;
    return offset;
  });
  const channelCount = unassignedCursor;

  // One sequencer per model, created once and called in strictly increasing atMs order -
  // O(frames) instead of the O(frames^2) a fresh renderRowAtMs-per-frame call would cost for
  // any stateful effect (Fire/Meteors/Snowflakes/Strobe), which replays from the effect's
  // start every call (correct for scrubbing, wrong for a full sequential export). See
  // DECISIONS.md M9 perf note - this is the fix that keeps full-length exports with those
  // effects inside the ROADMAP's 60s budget instead of stalling the tab.
  const sequencers = supported.map((model, i) => {
    const geo = geometries[i];
    if (!geo) return null;
    const rowEffects = toRenderableEffects(
      body.rows.filter((r) => r.elementType === "model" && r.elementId === model.id).flatMap((r) => r.effects),
      { timingTracks: body.timingTracks, model },
    );
    return createRowSequencer({ geometry: geo, effects: rowEffects }, frameMs, SEED, DEFAULT_PALETTE, audio);
  });

  // Sub-model rows get their own sequencer over the sub-model's geometry, and their output is
  // written back onto the parent's nodes. The export has to do this the same way the preview
  // does, or a show looks right on screen and plays wrong in the yard.
  const subSequencers = supported.map((model, i) => {
    const geo = geometries[i];
    if (!geo) return [];
    return (model.sub_models ?? [])
      .map((spec) => {
        const sub = computeSubModel(geo, spec);
        if (!sub) return null;
        const rowEffects = toRenderableEffects(
          body.rows
            .filter((r) => r.elementType === "submodel" && r.elementId === model.id && r.subName === spec.name)
            .flatMap((r) => r.effects),
          { timingTracks: body.timingTracks },
        );
        if (rowEffects.length === 0) return null;
        return {
          parentIndices: sub.parentIndices,
          sequencer: createRowSequencer({ geometry: sub.geometry, effects: rowEffects }, frameMs, SEED, DEFAULT_PALETTE, audio),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  });

  // Group rows get one sequencer over the group's composed buffer, and their output is scattered
  // back onto the member models. Planned by the same code the preview uses, so the two can't
  // disagree about how a group is laid out.
  const geometryByModelId = new Map<number, ModelGeometry>();
  supported.forEach((model, i) => {
    const geo = geometries[i];
    if (geo) geometryByModelId.set(model.id, geo);
  });
  const groupSequencers = planGroupRendering(groupRenderSpecs(groups, geometryByModelId, body)).map((job) => ({
    job,
    sequencer: createRowSequencer(job.row, frameMs, SEED, DEFAULT_PALETTE, audio),
  }));

  const frames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    const atMs = f * frameMs;
    const frame = new Uint8Array(channelCount);

    const groupBase = new Map<number, RGBA[]>();
    for (const { job, sequencer } of groupSequencers) {
      scatterGroupColors(job, sequencer.renderFrameAt(atMs), groupBase);
    }

    supported.forEach((model, i) => {
      const sequencer = sequencers[i];
      if (!sequencer) return;
      const nodeColors = sequencer.renderFrameAt(atMs);
      // A group is the less specific statement about a prop, so the model's own rows sit on top
      // of it and its sub-models on top of those - the same order the preview uses.
      applyGroupBase(nodeColors, groupBase.get(model.id));
      for (const sub of subSequencers[i] ?? []) {
        const subColors = sub.sequencer.renderFrameAt(atMs);
        subColors.forEach((c, n) => {
          const parentIndex = sub.parentIndices[n];
          if (parentIndex !== undefined && c.a > 0) nodeColors[parentIndex] = c;
        });
      }
      const block = singleChannel[i];
      const bytes = block ? channelBlockBytes(nodeColors, block.colors, block.fallback) : nodeColorsToChannelBytes(nodeColors, rgbOrders[i]);
      try {
        frame.set(bytes, byteOffsets[i]!);
      } catch (err) {
        throw new Error(`Couldn't place "${model.name}" at channel ${byteOffsets[i]! + 1}`, { cause: err });
      }
    });
    frames.push(frame);
  }

  return writeFseqV2(frames, { channelCount, frameCount, stepTimeMs: frameMs, producer: "webXLights" });
}

export function downloadFseq(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".fseq") ? filename : `${filename}.fseq`;
  a.click();
  URL.revokeObjectURL(url);
}
