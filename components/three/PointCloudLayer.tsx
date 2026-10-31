"use client";

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { PointCloud } from "@/lib/galaxyLayout";

const VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uMaxSize;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / -view.z, uMaxSize);
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor, alpha * alpha * uOpacity);
  #include <colorspace_fragment>
}
`;

export interface PointLayerUniforms {
  uOpacity: { value: number };
}

/**
 * One draw call for a whole cloud. Geometry and material free themselves on
 * unmount. Pass `uniforms` to fade a layer without re-rendering React.
 */
export function PointCloudLayer({
  cloud,
  scale,
  maxSize = 7,
  dark = false,
  fade,
}: {
  cloud: PointCloud;
  scale: number;
  maxSize?: number;
  /** Darkens what's behind it, for dust, instead of adding light. */
  dark?: boolean;
  fade?: PointLayerUniforms;
}) {
  const dpr = useThree((state) => state.viewport.dpr);
  // Built through args: a `uniforms` prop is copied by value, which would cut
  // the link to `fade` and leave the layer stuck at its first opacity.
  const material = useMemo(
    () => ({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uScale: { value: scale * dpr },
        uMaxSize: { value: maxSize * dpr },
        uOpacity: fade?.uOpacity ?? { value: 1 },
      },
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    [scale, maxSize, dpr, fade, dark],
  );

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[cloud.positions, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[cloud.colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[cloud.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial args={[material]} />
    </points>
  );
}
