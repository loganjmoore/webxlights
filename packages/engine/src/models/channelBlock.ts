import type { ModelGeometry, ModelNode } from "./types";

export interface ChannelBlockParams {
  channels: number;
}

// Manual "Channel Block": not a shape at all - it "can be used to 'model' generic channel to be
// used or AC Lights, relays, smoke machines, etc". Each channel drives one device.
//
// So it is a row of independent cells: one node per channel, side by side, which is the layout
// that lets a sequencer address them one at a time (a chase across the buffer steps through the
// relays in order). Giving it a shape it doesn't physically have would be worse than admitting
// it is a strip of switches.
//
// Not implemented: the per-channel "Channel Color" setting, which decides which of the RGB
// values drives each output channel. That belongs to channel assignment on export rather than to
// geometry, and is recorded in docs/MANUAL-COVERAGE.md.
export function computeChannelBlock(params: ChannelBlockParams): ModelGeometry {
  // The manual's own range is 1-128.
  const channels = Math.min(128, Math.max(1, Math.trunc(params.channels)));
  const nodes: ModelNode[] = [];
  for (let i = 0; i < channels; i++) {
    nodes.push({ bufX: i, bufY: 0, screenX: i, screenY: 0, string: 0, indexInString: i });
  }
  return { width: channels, height: 1, nodes };
}

// Manual "Image": "used to represent single channel props like blow-molds, inflatables or
// incandescent cutouts/wire-frames" - the whole prop is one channel, and the picture is how it is
// drawn in the layout rather than something the renderer lights per pixel.
//
// One node is therefore the honest geometry: an effect placed on it lights the prop or doesn't.
// The picture itself is a layout-view concern this engine doesn't draw.
export function computeImageModel(): ModelGeometry {
  return {
    width: 1,
    height: 1,
    nodes: [{ bufX: 0, bufY: 0, screenX: 0, screenY: 0, string: 0, indexInString: 0 }],
  };
}
