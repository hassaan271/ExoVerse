"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const BLOOM_STRENGTH = 0.16;
const BLOOM_RADIUS = 0.42;
const BLOOM_THRESHOLD = 1.4;
const EXPOSURE = 0.62;

/**
 * Renders into a floating-point buffer, so additive starlight keeps its true
 * brightness instead of clipping at white in 8 bits. Tone mapping then rolls
 * highlights off, and bloom touches only what is genuinely bright. Taking the
 * frame at priority 1 replaces the default render, so there is still one loop.
 */
export function useHdrRender(idle?: RefObject<boolean>) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);

  const composer = useMemo(() => {
    const instance = new EffectComposer(gl);
    instance.addPass(new RenderPass(scene, camera));
    instance.addPass(
      new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD),
    );
    instance.addPass(new OutputPass());
    gl.toneMappingExposure = EXPOSURE;
    return instance;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
  }, [composer, dpr, height, width]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => {
    if (!idle?.current) composer.render(delta);
  }, 1);
}
