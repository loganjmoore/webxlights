import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/synthetic-house.json";
import { houseModelFrom, createHouseGroup, disposeHouseGroup, fitHouseCamera, resizeHouseCamera } from "../src/lib/houseModel";

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
