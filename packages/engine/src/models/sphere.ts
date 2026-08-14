import type { ModelGeometry, ModelNode } from "./types";
import { ringRadiusForNodeCount } from "./units";

export interface SphereParams {
  strings: number;
  nodesPerString: number;
  /** 360 is a full sphere, 180 a half one. */
  degrees: number;
  /** "Distance from the nodes to the bottom pole", as a percentage. */
  southernLatitude: number;
  /** "Distance from the nodes to the top pole". */
  northernLatitude: number;
}

// Manual "Sphere": strings running pole to pole, each at its own longitude, between a southern
// and a northern latitude. Degrees says how far round the strings are spread - a half sphere is
// the same strings over 180 degrees rather than fewer strings.
//
// Buffer is strings x nodes-per-string, so an effect running across it goes round the sphere and
// one running up it goes from pole to pole. That is the same buffer a matrix of the same counts
// would get, which is what makes an effect written for a matrix work here.
export function computeSphere(params: SphereParams): ModelGeometry {
  const strings = Math.max(1, Math.trunc(params.strings));
  const perString = Math.max(1, Math.trunc(params.nodesPerString));
  const degrees = params.degrees === 0 ? 360 : params.degrees;

  // The latitudes are given as distances *from* their poles, so the band the nodes occupy is
  // what's left between them.
  const south = clampPct(params.southernLatitude);
  const north = clampPct(params.northernLatitude);
  const from = -90 + south * 180;
  const to = 90 - north * 180;

  // Radius from the equator's own spacing: the strings sit one node-unit apart around the widest
  // ring, extrapolated to a full turn when the sphere covers less than one.
  const radius = ringRadiusForNodeCount(strings * (360 / Math.abs(degrees)));

  const wraps = Math.abs(degrees) >= 360;
  const step = wraps ? degrees / strings : strings > 1 ? degrees / (strings - 1) : 0;

  const nodes: ModelNode[] = [];
  for (let s = 0; s < strings; s++) {
    const longitude = ((s * step) * Math.PI) / 180;
    for (let i = 0; i < perString; i++) {
      const t = perString > 1 ? i / (perString - 1) : 0.5;
      const latitude = ((from + (to - from) * t) * Math.PI) / 180;
      const ring = Math.cos(latitude) * radius;
      nodes.push({
        bufX: s,
        bufY: i,
        screenX: Math.cos(longitude) * ring,
        screenY: Math.sin(latitude) * radius,
        screenZ: Math.sin(longitude) * ring,
        string: s,
        indexInString: i,
      });
    }
  }

  return { width: strings, height: perString, nodes };
}

function clampPct(v: number): number {
  const n = Number.isFinite(v) ? v : 0;
  return Math.min(0.49, Math.max(0, n / 100));
}
