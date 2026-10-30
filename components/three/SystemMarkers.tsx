"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

export const MARKER_STATE = { normal: 0, dimmed: 1, hovered: 2, selected: 3 };

const VERTEX = /* glsl */ `
attribute vec3 iOffset;
attribute vec3 iLocal;
attribute vec3 iColor;
attribute float iSize;
attribute float iState;
uniform float uMix;
varying vec2 vPoint;
varying vec3 vColor;
varying float vState;
void main() {
  vPoint = position.xy * 2.0;
  vColor = iColor;
  vState = iState;
  vec4 view = viewMatrix * vec4(mix(iOffset, iLocal, uMix), 1.0);
  // Close to constant on screen, so distant systems stay clickable.
  float size = iSize * pow(-view.z, 0.86) * 2.6;
  if (iState > 1.5) size *= 1.5;
  view.xy += position.xy * size;
  gl_Position = projectionMatrix * view;
}
`;

// A crisp core with a thin halo, unlike the soft decorative galaxy stars.
const FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vPoint;
varying vec3 vColor;
varying float vState;
void main() {
  float r = length(vPoint);
  if (r > 1.0) discard;
  float core = smoothstep(0.3, 0.2, r);
  float halo = pow(1.0 - r, 3.0) * 0.08;
  vec3 color = vColor * (halo + core * 0.42);
  if (vState > 2.5) {
    float radius = 0.72 + 0.04 * sin(uTime * 2.2);
    color += vec3(1.4) * smoothstep(0.04, 0.0, abs(r - radius));
  }
  if (vState > 0.5 && vState < 1.5) color *= 0.12;
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

interface SystemMarkersProps {
  positions: THREE.Vector3[];
  localPositions: THREE.Vector3[];
  colors: THREE.Color[];
  sizes: number[];
  /** One MARKER_STATE per marker. Writing it needs no new geometry. */
  stateRef: React.RefObject<Float32Array>;
  /** Set true after writing stateRef. Uploaded on the next frame, no render. */
  stateDirty: React.RefObject<boolean>;
  /** 0 for true scale, 1 for the neighbourhood view. */
  mix: { value: number };
}

/** All markers share one instanced draw call and one compiled program. */
export function SystemMarkers({
  positions,
  localPositions,
  colors,
  sizes,
  stateRef,
  stateDirty,
  mix,
}: SystemMarkersProps) {
  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const instanced = new THREE.InstancedBufferGeometry();
    instanced.index = quad.index;
    instanced.setAttribute("position", quad.getAttribute("position"));
    instanced.instanceCount = positions.length;
    const flatten = (items: { toArray: (a: number[], o: number) => unknown }[]) => {
      const out: number[] = [];
      items.forEach((item, index) => item.toArray(out, index * 3));
      return new Float32Array(out);
    };
    instanced.setAttribute("iOffset", new THREE.InstancedBufferAttribute(flatten(positions), 3));
    instanced.setAttribute("iLocal", new THREE.InstancedBufferAttribute(flatten(localPositions), 3));
    instanced.setAttribute("iColor", new THREE.InstancedBufferAttribute(flatten(colors), 3));
    instanced.setAttribute("iSize", new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
    const state = new THREE.InstancedBufferAttribute(stateRef.current, 1);
    state.setUsage(THREE.DynamicDrawUsage);
    instanced.setAttribute("iState", state);
    return instanced;
  }, [positions, localPositions, colors, sizes, stateRef]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMix: mix }), [mix]);
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    if (stateDirty.current) {
      stateDirty.current = false;
      geometry.getAttribute("iState").needsUpdate = true;
    }
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
