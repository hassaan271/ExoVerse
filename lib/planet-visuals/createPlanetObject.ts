import * as THREE from "three";
import {
  ATMOSPHERE_FRAGMENT,
  ATMOSPHERE_VERTEX,
  BAKE_VERTEX,
  CLOUD_BAKE_FRAGMENT,
  PLANET_FRAGMENT,
  PLANET_VERTEX,
  SURFACE_BAKE_FRAGMENT,
} from "./shaders";
import { type PlanetVisual, PRESET_ID } from "./visualProfile";

export interface PlanetObject {
  group: THREE.Group;
  /** Advances spin and cloud drift. Pass 0 to hold still. */
  update: (deltaSeconds: number) => void;
  /** Sets the world-space direction from the planet towards its star. */
  setLightDirection: (direction: THREE.Vector3) => void;
  dispose: () => void;
}

export interface PlanetDetail {
  /** Surface map width. Height is half this. Cloud maps are half the width. */
  textureWidth: number;
  sphereSegments: number;
}

export const VIEWER_DETAIL: PlanetDetail = { textureWidth: 2048, sphereSegments: 128 };
export const VIEWER_DETAIL_MOBILE: PlanetDetail = { textureWidth: 1024, sphereSegments: 96 };
export const SYSTEM_DETAIL: PlanetDetail = { textureWidth: 1024, sphereSegments: 64 };
export const PORTRAIT_DETAIL: PlanetDetail = { textureWidth: 1024, sphereSegments: 96 };

const WHITE = new THREE.Color("#ffffff");

// Geometries and programs are shared: a system of seven planets is seven sets
// of textures and uniforms, not seven compiled shaders.
const geometries = new Map<number, THREE.SphereGeometry>();

function sphereGeometry(segments: number) {
  let geometry = geometries.get(segments);
  if (!geometry) {
    geometry = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
    geometries.set(segments, geometry);
  }
  return geometry;
}

interface Baker {
  scene: THREE.Scene;
  camera: THREE.Camera;
  quad: THREE.Mesh;
  clouds: THREE.ShaderMaterial;
  /** One small program per preset, built the first time a preset is used. */
  surfaces: Map<number, THREE.ShaderMaterial>;
}

const bakers = new WeakMap<THREE.WebGLRenderer, Baker>();

function getBaker(renderer: THREE.WebGLRenderer): Baker {
  const existing = bakers.get(renderer);
  if (existing) return existing;

  const clouds = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: CLOUD_BAKE_FRAGMENT,
    uniforms: { uSeed: { value: 0 }, uStretch: { value: 1 } },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), clouds);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const baker: Baker = {
    scene,
    camera: new THREE.Camera(),
    quad,
    clouds,
    surfaces: new Map(),
  };
  bakers.set(renderer, baker);
  return baker;
}

function surfaceBakeMaterial(baker: Baker, preset: number) {
  let material = baker.surfaces.get(preset);
  if (!material) {
    material = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader: SURFACE_BAKE_FRAGMENT,
      defines: { PRESET: preset },
      uniforms: {
        uSeed: { value: 0 },
        uColors: { value: Array.from({ length: 5 }, () => new THREE.Color()) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    baker.surfaces.set(preset, material);
  }
  return material;
}

/**
 * Compiles a preset's bake shaders without blocking the page, so a first visit
 * stays responsive. Await this before createPlanetObject.
 */
export async function preparePlanetShaders(
  renderer: THREE.WebGLRenderer,
  visual: PlanetVisual,
) {
  const baker = getBaker(renderer);
  const surface = surfaceBakeMaterial(baker, PRESET_ID[visual.preset]);
  for (const material of [surface, baker.clouds]) {
    baker.quad.material = material;
    await renderer.compileAsync(baker.scene, baker.camera);
  }
}

function bakeInto(
  renderer: THREE.WebGLRenderer,
  baker: Baker,
  material: THREE.ShaderMaterial,
  width: number,
  height: number,
) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    anisotropy,
  });
  const previous = renderer.getRenderTarget();
  baker.quad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(baker.scene, baker.camera);
  renderer.setRenderTarget(previous);
  return target;
}

export function createPlanetObject(
  renderer: THREE.WebGLRenderer,
  visual: PlanetVisual,
  detail: PlanetDetail,
): PlanetObject {
  const baker = getBaker(renderer);
  const width = detail.textureWidth;

  const surfaceBake = surfaceBakeMaterial(baker, PRESET_ID[visual.preset]);
  surfaceBake.uniforms.uSeed.value = visual.seed;
  (surfaceBake.uniforms.uColors.value as THREE.Color[]).forEach((color, index) => {
    color.set(visual.palette[index]);
  });
  const surfaceTarget = bakeInto(renderer, baker, surfaceBake, width, width / 2);

  baker.clouds.uniforms.uSeed.value = visual.seed;
  baker.clouds.uniforms.uStretch.value = visual.preset === "ice-giant" ? 5 : 1.6;
  const cloudTarget = bakeInto(renderer, baker, baker.clouds, width / 2, width / 4);

  const lightDirection = new THREE.Vector3(-0.7, 0.45, 0.6).normalize();
  // Eyes adapt to a star's colour, so red-dwarf light is softened, not literal.
  const lightColor = new THREE.Color(visual.starLightColor).lerp(WHITE, 0.55);
  const atmosphereColor = new THREE.Color(visual.atmosphereColor);

  const surfaceMaterial = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERTEX,
    fragmentShader: PLANET_FRAGMENT,
    uniforms: {
      uSurface: { value: surfaceTarget.texture },
      uClouds: { value: cloudTarget.texture },
      uTexel: { value: new THREE.Vector2(1.5 / width, 3 / width) },
      uLightDirection: { value: lightDirection },
      uLightColor: { value: lightColor },
      uAtmosphere: { value: atmosphereColor },
      uCloudColor: { value: new THREE.Color(visual.cloudColor) },
      uAtmosphereStrength: { value: visual.atmosphereStrength },
      uBump: { value: visual.bumpStrength },
      uSpecular: { value: visual.specular },
      uLava: { value: visual.lava },
      uCloudAmount: { value: visual.cloudAmount },
      uCloudShift: { value: visual.seed },
    },
  });

  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    uniforms: {
      uAtmosphere: { value: atmosphereColor },
      uLightDirection: { value: lightDirection },
      uLightColor: { value: lightColor },
      uAtmosphereStrength: { value: visual.atmosphereStrength },
    },
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const geometry = sphereGeometry(detail.sphereSegments);
  const surface = new THREE.Mesh(geometry, surfaceMaterial);
  surface.rotation.y = visual.seed * Math.PI * 2;
  const atmosphere = new THREE.Mesh(geometry, atmosphereMaterial);
  atmosphere.scale.setScalar(visual.atmosphereScale);

  const group = new THREE.Group();
  group.rotation.z = visual.tiltRadians;
  group.add(surface, atmosphere);

  return {
    group,
    update(deltaSeconds) {
      surface.rotation.y += deltaSeconds * visual.spinRate;
      surfaceMaterial.uniforms.uCloudShift.value += deltaSeconds * visual.spinRate * 0.02;
    },
    setLightDirection(direction) {
      lightDirection.copy(direction).normalize();
    },
    dispose() {
      surfaceTarget.dispose();
      cloudTarget.dispose();
      surfaceMaterial.dispose();
      atmosphereMaterial.dispose();
    },
  };
}
