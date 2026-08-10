import * as THREE from "three";

// Shared scene/camera/renderer bootstrap for both HousePreview.vue (live playback) and
// LayoutCanvas3D.vue (M12 layout editing) - a small extracted helper rather than duplicating
// the boilerplate a second time.
export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(container: HTMLElement): SceneSetup {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0d);
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  return { scene, camera, renderer };
}

export function resizeScene(setup: SceneSetup, container: HTMLElement): void {
  setup.renderer.setSize(container.clientWidth, container.clientHeight);
  setup.camera.aspect = container.clientWidth / container.clientHeight;
  setup.camera.updateProjectionMatrix();
}

export function disposeScene(setup: SceneSetup, container: HTMLElement): void {
  setup.renderer.dispose();
  if (setup.renderer.domElement.parentElement === container) container.removeChild(setup.renderer.domElement);
}
