import * as THREE from "three";

// Shared scene/camera/renderer bootstrap for both HousePreview.vue (live playback) and
// LayoutCanvas3D.vue (M12 layout editing) - a small extracted helper rather than duplicating
// the boilerplate a second time.
export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

/**
 * `transparent` leaves the canvas unpainted where nothing is drawn, so a sibling behind it shows
 * through - which is how the layout's house photo sits behind the 3D scene. Opaque by default:
 * the house preview has nothing behind it, and a cleared buffer is marginally cheaper.
 */
export function createScene(container: HTMLElement, options: { transparent?: boolean } = {}): SceneSetup {
  const scene = new THREE.Scene();
  if (!options.transparent) scene.background = new THREE.Color(0x0a0a0d);
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: options.transparent === true });
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
