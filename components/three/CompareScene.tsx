"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import { ProceduralPlanet } from "@/components/3d/ProceduralPlanet";
import type { CompareSizes } from "@/lib/compare";
import { createSkyCloud } from "@/lib/galaxyLayout";
import { PORTRAIT_DETAIL } from "@/lib/planet-visuals/createPlanetObject";
import { sceneRadius } from "@/lib/planetScale";
import type { PlanetSummary } from "@/types/planet";
import { PointCloudLayer } from "./PointCloudLayer";
import { SceneCanvas } from "./SceneCanvas";

const FOV = 26;
/** One scene unit is one Earth radius, for both planets, always. */
const UNITS_PER_EARTH_RADIUS = 1;
const LIGHT = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();
const EASE = 5;
/** Share of the view height kept clear for names and size labels. */
const VERTICAL_MARGIN = 2.3;
const LABEL_MARGIN = 10;
const projected = new THREE.Vector3();

interface WorldProps {
  a: PlanetSummary;
  b: PlanetSummary;
  sizes: CompareSizes;
  labelA: RefObject<HTMLElement | null>;
  labelB: RefObject<HTMLElement | null>;
  onReady: () => void;
}

function CompareWorld({ a, b, sizes, labelA, labelB, onReady }: WorldProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);

  const radiusA = sizes.a === null ? null : sceneRadius(sizes.a, UNITS_PER_EARTH_RADIUS);
  const radiusB = sizes.b === null ? null : sceneRadius(sizes.b, UNITS_PER_EARTH_RADIUS);

  // With no usable size, a planet borrows its neighbour's, labelled illustrative.
  const slotA = radiusA ?? radiusB ?? UNITS_PER_EARTH_RADIUS;
  const slotB = radiusB ?? radiusA ?? UNITS_PER_EARTH_RADIUS;
  const larger = Math.max(slotA, slotB);
  // A much smaller neighbour needs room for its label beside the larger planet.
  const gap = larger * (Math.min(slotA, slotB) / larger < 0.25 ? 0.95 : 0.3);
  const width = slotA * 2 + slotB * 2 + gap;
  const leftX = -width / 2 + slotA;
  const rightX = width / 2 - slotB;

  // Only the camera moves to fit. The geometry above is never refitted.
  const distance = useMemo(() => {
    const tangent = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = size.width / size.height;
    return Math.max((width * 1.1) / aspect, larger * 2 * VERTICAL_MARGIN) / 2 / tangent;
  }, [larger, size.height, size.width, width]);

  const place = (
    group: THREE.Group | null,
    label: HTMLElement | null,
    x: number,
    radius: number,
  ) => {
    if (group) group.position.x = x;
    if (!label) return;
    projected.set(group?.position.x ?? x, -radius, 0).project(camera);
    // Clamped, so a label beside a much larger planet stays inside the panel.
    const inset = label.offsetWidth / 2 + LABEL_MARGIN;
    const screenX = Math.min(
      Math.max(((projected.x + 1) / 2) * size.width, inset),
      Math.max(size.width - inset, inset),
    );
    const screenY = Math.min(
      ((1 - projected.y) / 2) * size.height + 10,
      size.height - label.offsetHeight - LABEL_MARGIN,
    );
    label.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translateX(-50%)`;
  };

  useFrame((_, delta) => {
    const ease = 1 - Math.exp(-Math.min(delta, 0.05) * EASE);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, distance, ease);
    camera.near = camera.position.z * 0.01;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    place(left.current, labelA.current, leftX, slotA);
    place(right.current, labelB.current, rightX, slotB);
  });

  const skyCloud = useMemo(() => createSkyCloud(1800), []);

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <PointCloudLayer cloud={skyCloud} scale={700} maxSize={2.4} />
      <group ref={left}>
        <ProceduralPlanet
          planet={a}
          detail={PORTRAIT_DETAIL}
          scale={slotA}
          lightDirection={LIGHT}
          onReady={onReady}
        />
      </group>
      <group ref={right}>
        <ProceduralPlanet
          planet={b}
          detail={PORTRAIT_DETAIL}
          scale={slotB}
          lightDirection={LIGHT}
          onReady={onReady}
        />
      </group>
    </>
  );
}

const CANVAS_DPR: [number, number] = [1, 1.75];
const CANVAS_CAMERA = { fov: FOV, near: 0.1, far: 6000, position: [0, 0, 8] } as const;

/** One canvas and one renderer draw both planets, whichever two are chosen. */
export default function CompareScene({
  fallback,
  ...world
}: WorldProps & { fallback: React.ReactNode }) {
  return (
    <SceneCanvas fallback={fallback} dpr={CANVAS_DPR} camera={CANVAS_CAMERA}>
      <CompareWorld {...world} />
    </SceneCanvas>
  );
}
