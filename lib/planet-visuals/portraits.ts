import * as THREE from "three";
import {
  createPlanetObject,
  PORTRAIT_DETAIL,
  preparePlanetShaders,
} from "./createPlanetObject";
import type { PlanetVisual } from "./visualProfile";

/**
 * Cards and lists show many planets, and a browser allows only a few WebGL
 * contexts. So one hidden renderer draws each planet once into an image, then
 * closes. The page shows plain <img> tags with no GPU cost while scrolling.
 */
const SIZE = 640;
const IDLE_CLOSE_MS = 1500;

const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;
let closeTimer = 0;
let queue: Promise<unknown> = Promise.resolve();

function getRenderer() {
  window.clearTimeout(closeTimer);
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function closeWhenIdle() {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
  }, IDLE_CLOSE_MS);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function draw(visual: PlanetVisual): Promise<string | null> {
  // One portrait per frame, so a page of them never blocks scrolling.
  await nextFrame();
  const context = getRenderer();
  await preparePlanetShaders(context, visual);
  const planet = createPlanetObject(context, visual, PORTRAIT_DETAIL);
  const scene = new THREE.Scene();
  scene.add(planet.group);
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
  camera.position.z = 6.3;

  context.render(scene, camera);
  const blob = await new Promise<Blob | null>((resolve) =>
    context.domElement.toBlob(resolve, "image/webp", 0.86),
  );
  planet.dispose();
  closeWhenIdle();
  return blob ? URL.createObjectURL(blob) : null;
}

/** Resolves to an image URL, or null if WebGL isn't available. */
export function getPlanetPortrait(visual: PlanetVisual): Promise<string | null> {
  const key = `${visual.seed}:${visual.preset}`;
  let portrait = cache.get(key);
  if (!portrait) {
    portrait = queue.then(() => draw(visual)).catch(() => null);
    queue = portrait;
    cache.set(key, portrait);
  }
  return portrait;
}
