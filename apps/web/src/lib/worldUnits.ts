/**
 * How many world units one local geometry unit is worth.
 *
 * A model's stored position (`screen.x/y/z`) is already in world units, but the offsets that
 * `nodeWorldOffset` returns are in *local* units - "the spacing between two adjacent nodes"
 * (models/units.ts). Every view that draws a node therefore converts before adding the two
 * together: `position = screen.x + offset.x * NODE_SPACING`.
 *
 * It lives here because getting it wrong is invisible in a single view. The conversion cancels
 * out of anything that only ever looks at one model - a prop drawn at the wrong internal scale
 * against nothing to compare it to just looks like a prop. It only shows up when two coordinate
 * systems have to agree about where several models are *relative to each other*, and then it
 * shows up as a mismatch rather than as an obviously wrong size.
 *
 * That is how a group effect came to be misaligned: five files each declared their own copy of
 * this constant and the group buffer's world mapping, which needed it too, simply didn't have
 * one. Each member's nodes were laid into the shared buffer a quarter of the size they are drawn
 * at, while the gaps between the members stayed full size - so the buffer's idea of the group's
 * shape was not the shape on screen, and an effect that swept across the buffer did not sweep
 * across the yard.
 */
export const NODE_SPACING = 4;
