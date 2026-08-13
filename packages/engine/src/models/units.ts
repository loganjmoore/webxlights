// One convention for `ModelNode.screenX/screenY`, shared by every model type:
//
//     one local unit == the spacing between two adjacent nodes.
//
// Matrix, Single Line, Icicles and friends already worked this way (a 50-node line is 49 units
// long). The ring-shaped types - Circle, Star, Wreath - did not: they placed nodes on a *unit*
// circle, so a 50-node circle and a 500-node circle were both 2 units across.
//
// That mattered far beyond their own rendering. xLights' ScaleX multiplies the model's render
// size, which is in node units, so a real show's ScaleX values are tuned against node counts.
// Applying them to a normalized 2-unit shape made ring models come out ~25x too small relative
// to a matrix of the same node count, which is what made an imported layout look scrambled
// rather than merely mis-scaled. Nothing about effect rendering is affected - effects address
// nodes through bufX/bufY, and screenX/screenY is purely the layout-space position.
export function ringRadiusForNodeCount(nodeCount: number): number {
  // Nodes evenly spaced around a ring: circumference = nodeCount * 1 unit, so r = n / 2pi.
  return Math.max(nodeCount, 1) / (2 * Math.PI);
}
