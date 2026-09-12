import * as THREE from "three";

export const HOUSE_SURFACE_KINDS = ["wall", "roof", "window", "door", "porch", "exterior"] as const;
export type HousePoint = [number, number, number];
export interface HouseSurface {
  name: string;
  kind: typeof HOUSE_SURFACE_KINDS[number];
  estimated: boolean;
  /** Consecutive triples form triangles, in meters. Y is up, +Z faces the street. */
  vertices: HousePoint[];
}
export interface HouseModel {
  version: 1;
  source: { label: string; notes: string; credits?: { label: string; url: string; license: string }[] };
  /** Explicit calibration: existing layouts do not have a universal physical scale. */
  placement: { position: HousePoint; rotationY: number; worldUnitsPerMeter: number };
  surfaces: HouseSurface[];
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numberIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const point = (v: unknown, limit: number): v is HousePoint =>
  Array.isArray(v) && v.length === 3 && v.every(n => numberIn(n, -limit, limit));

/** Settings also arrive through version restores; never send unchecked coordinates to WebGL. */
export function houseModelFrom(settings: Record<string, unknown> | null | undefined): HouseModel | null {
  const h = settings?.houseModel;
  if (!record(h) || h.version !== 1 || !record(h.source) || !record(h.placement)) return null;
  if (typeof h.source.label !== "string" || !h.source.label.trim() || h.source.label.length > 200 ||
      typeof h.source.notes !== "string" || h.source.notes.length > 2000) return null;
  if (h.source.credits !== undefined && (!Array.isArray(h.source.credits) || h.source.credits.length > 8 ||
      !h.source.credits.every(c => record(c) && typeof c.label === "string" && typeof c.license === "string" &&
        typeof c.url === "string" && /^https:\/\//.test(c.url)))) return null;
  const p = h.placement;
  if (!point(p.position, 100000) || !numberIn(p.rotationY, -360, 360) || !numberIn(p.worldUnitsPerMeter, 0.1, 1000)) return null;
  if (!Array.isArray(h.surfaces) || !h.surfaces.length || h.surfaces.length > 256) return null;
  for (const s of h.surfaces) {
    if (!record(s) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 120 ||
        !HOUSE_SURFACE_KINDS.includes(s.kind as HouseSurface["kind"]) || typeof s.estimated !== "boolean" ||
        !Array.isArray(s.vertices) || s.vertices.length < 3 || s.vertices.length > 96 || s.vertices.length % 3 ||
        !s.vertices.every(v => point(v, 1000))) return null;
    for (let i = 0; i < s.vertices.length; i += 3) {
      const [a, b, c] = s.vertices.slice(i, i + 3).map(v => new THREE.Vector3(...v as HousePoint));
      if (b!.sub(a!).cross(c!.sub(a!)).lengthSq() < 1e-12) return null;
    }
  }
  return h as unknown as HouseModel;
}

/** Neutral surfaces with edges; no source images, textures, or exterior color guesses. */
export function createHouseGroup(house: HouseModel): THREE.Group {
  const group = new THREE.Group();
  group.name = "House exterior";
  group.position.fromArray(house.placement.position);
  group.rotation.y = THREE.MathUtils.degToRad(house.placement.rotationY);
  group.scale.setScalar(house.placement.worldUnitsPerMeter);
  const material = new THREE.MeshLambertMaterial({ color: 0xb8b8b8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x454545 });
  for (const surface of house.surfaces) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(surface.vertices.flat(), 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = surface.name;
    mesh.userData = { kind: surface.kind, estimated: surface.estimated };
    group.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial));
  }
  group.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(-15, 30, 20);
  group.add(light, light.target);
  return group;
}

export function disposeHouseGroup(group: THREE.Group | null): void {
  if (!group) return;
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m);
    }
  });
  for (const material of materials) material.dispose();
  group.removeFromParent();
}

/** Fit the house and lights together, including depth and narrow preview aspect ratios. */
export function fitHouseCamera(group: THREE.Group, camera: THREE.PerspectiveCamera, target: THREE.Vector3, extraBounds: THREE.Box3): void {
  const bounds = new THREE.Box3().setFromObject(group).union(extraBounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1);
  const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const distance = radius / Math.sin(halfFov) * 1.1;
  target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0, 0.12, 1).normalize().multiplyScalar(distance));
  camera.near = Math.max(0.01, radius / 1000);
  camera.far = distance + radius * 40;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

/** Keep the chosen orbit and zoom when a pane becomes narrower or wider. */
export function resizeHouseCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, previousAspect: number): void {
  const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfAngle = (aspect: number) => Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * aspect));
  const ratio = Math.sin(halfAngle(previousAspect)) / Math.sin(halfAngle(camera.aspect));
  camera.position.sub(target).multiplyScalar(ratio).add(target);
  camera.far = Math.max(camera.far, camera.position.distanceTo(target) * 4);
  camera.updateProjectionMatrix();
}

export function houseDimensions(house: HouseModel): { width: number; height: number; depth: number } {
  const bounds = new THREE.Box3();
  for (const s of house.surfaces) for (const p of s.vertices) bounds.expandByPoint(new THREE.Vector3(...p));
  const size = bounds.getSize(new THREE.Vector3());
  return { width: size.x, height: size.y, depth: size.z };
}

/** Physical calibration changes meter geometry, independently of alignment with existing lights. */
export function calibrateHouseWidth(house: HouseModel, meters: number): HouseModel {
  const width = houseDimensions(house).width;
  if (!Number.isFinite(meters) || meters < 1 || meters > 100 || width <= 0) throw new Error("Enter a house width between 1 and 100 meters.");
  const ratio = meters / width;
  const next = structuredClone(house);
  for (const surface of next.surfaces) surface.vertices = surface.vertices.map(p => p.map(v => v * ratio) as HousePoint);
  next.source.notes = `Width calibrated to ${meters.toFixed(2)} m; other dimensions scaled proportionally.\n${house.source.notes}`.slice(0, 2000);
  if (!houseModelFrom({ houseModel: next })) throw new Error("That width exceeds the supported model size.");
  return next;
}

/** Preserve photo proportions, fit the empty layout's 200-unit span, and stand on the lawn.
 * Placement changes only: estimated meter geometry is retained, never presented as measured.
 */
export function fitHouseToLayout(house: HouseModel): HouseModel {
  const bounds = new THREE.Box3();
  for (const surface of house.surfaces) for (const p of surface.vertices) bounds.expandByPoint(new THREE.Vector3(...p));
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 200 / Math.max(size.x, size.y, size.z);
  const next = structuredClone(house);
  next.placement = {
    worldUnitsPerMeter: scale,
    rotationY: 0,
    position: [-(bounds.min.x + bounds.max.x) / 2 * scale, -bounds.min.y * scale, -bounds.max.z * scale],
  };
  if (!houseModelFrom({ houseModel: next })) throw new Error("This draft could not be fitted to the layout. Try clearer house photos.");
  return next;
}
