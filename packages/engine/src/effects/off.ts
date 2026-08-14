import { rgba } from "../color";
import type { RenderBuffer } from "../renderBuffer";

export interface OffParams {
  /** Leave the buffer transparent instead of painting opaque black. */
  transparent: boolean;
}

// SPEC / manual "Off": every pixel off on the model this lands on. Colours and timing are
// ignored by design - the manual says so outright.
//
// The distinction that makes this more than a no-op is Transparent. An opaque black layer hides
// whatever is under it, which is the point when Off is used to punch a gap in a sequence; a
// transparent one leaves the layers below showing, which is the point when it is used with
// canvas-style blending to gate another layer. Rendering nothing at all would only ever give the
// second behaviour, and the first is the common one.
export function renderOff(buffer: RenderBuffer, params: OffParams): void {
  buffer.fill(params.transparent ? rgba(0, 0, 0, 0) : rgba(0, 0, 0, 255));
}
