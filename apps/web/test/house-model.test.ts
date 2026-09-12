import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/synthetic-house.json";
import { houseModelFrom, createHouseGroup, disposeHouseGroup, fitHouseCamera, resizeHouseCamera, calibrateHouseWidth, houseDimensions, fitHouseToLayout } from "../src/lib/houseModel";

describe("house exterior geometry", () => {
  it("preserves every surface type and meter geometry without images or textures", () => {
    const house = houseModelFrom({ houseModel: fixture })!;
    expect(house).not.toBeNull();
    const group = createHouseGroup(house);
    const meshes = group.children.filter(c => c instanceof THREE.Mesh);
    expect(new Set(meshes.map(m => m.userData.kind)).size).toBe(6);
    expect(meshes).toHaveLength(fixture.surfaces.length);
    expect(meshes.every(m => m.material instanceof THREE.MeshLambertMaterial && !m.material.map)).toBe(true);
    const bounds = new THREE.Box3().setFromObject(group);
    expect(bounds.min.toArray()).toEqual([-240, 0, -320]);
    expect(bounds.max.toArray()).toEqual([240, 200, 80]);
    const disposal = vi.spyOn(meshes[0]!.geometry, "dispose");
    disposeHouseGroup(group);
    expect(disposal).toHaveBeenCalledOnce();
  });

  it("calibrates real dimensions without moving the house or mutating its source", () => {
    const house = houseModelFrom({ houseModel: fixture })!;
    const before = structuredClone(house);
    const scaled = calibrateHouseWidth(house, 24);
    expect(houseDimensions(scaled)).toEqual({ width: 24, height: 10, depth: 20 });
    expect(scaled.placement).toEqual(house.placement);
    expect(house).toEqual(before);
    for (const width of [0, -1, NaN, Infinity, 101]) expect(() => calibrateHouseWidth(house, width)).toThrow();
  });

  it("fits unmeasured photo geometry to the default layout without changing its proportions", () => {
    const house = houseModelFrom({ houseModel: structuredClone(fixture) })!;
    // An offset photo reconstruction must not float above the lawn or miss the center.
    for (const surface of house.surfaces) for (const p of surface.vertices) { p[0] += 40; p[1] += 7; p[2] += 20; }
    const before = structuredClone(house);
    const fitted = fitHouseToLayout(house);
    expect(fitted.surfaces).toEqual(before.surfaces);
    expect(house).toEqual(before);
    expect(fitted.source).toEqual(before.source);
    const group = createHouseGroup(fitted);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(200);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.z).toBeCloseTo(0);
    expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0);
    expect(size.x / size.y).toBeCloseTo(12 / 5);
    expect(size.x / size.z).toBeCloseTo(12 / 10);
    expect(fitHouseToLayout(fitted)).toEqual(fitted);
    disposeHouseGroup(group);
  });

  it("rejects corrupt or oversized geometry from stored layouts", () => {
    expect(houseModelFrom({})).toBeNull();
    for (const vertices of [[[0,0,0],[0,0,0],[1,0,0]], [[0,0,0],[1,0,0]], [[0,0,0],[1,0,0],[0,Infinity,0]]]) {
      const h = structuredClone(fixture);
      h.surfaces[0]!.vertices = vertices;
      expect(houseModelFrom({ houseModel: h })).toBeNull();
    }
    const huge = structuredClone(fixture);
    huge.surfaces = Array(257).fill(huge.surfaces[0]);
    expect(houseModelFrom({ houseModel: huge })).toBeNull();
  });

  it("fits rotated and translated houses on wide and narrow previews", () => {
    const h = houseModelFrom({ houseModel: structuredClone(fixture) })!;
    h.placement.position = [500, 80, -900];
    h.placement.rotationY = 47;
    const group = createHouseGroup(h);
    const bounds = new THREE.Box3().setFromObject(group);
    for (const aspect of [0.4, 2]) {
      const camera = new THREE.PerspectiveCamera(50, aspect);
      const target = new THREE.Vector3();
      fitHouseCamera(group, camera, target, new THREE.Box3());
      const previousAspect = camera.aspect;
      camera.aspect = 0.3;
      resizeHouseCamera(camera, target, previousAspect);
      camera.updateMatrixWorld();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
        expect(Math.abs(point.z)).toBeLessThan(1);
      }
    }
    disposeHouseGroup(group);
  });
});
