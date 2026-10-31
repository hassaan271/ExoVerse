"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ProceduralPlanet } from "@/components/3d/ProceduralPlanet";
import { createSkyCloud } from "@/lib/galaxyLayout";
import { VIEWER_DETAIL, VIEWER_DETAIL_MOBILE } from "@/lib/planet-visuals/createPlanetObject";
import type { PlanetSummary } from "@/types/planet";
import { PointCloudLayer } from "./PointCloudLayer";
import { SceneCanvas } from "./SceneCanvas";
import { useOrbitControls } from "./useOrbitControls";

export interface ViewerControls {
  zoom: (factor: number) => void;
  reset: () => void;
}

const FOV = 30;
/** The planet fills this share of the view's shorter side. */
const FILL = 0.82;
const MAX_ZOOM_IN = 1.45;

// Light stays over the viewer's shoulder, so dragging turns the planet under
// it rather than rotating the camera round to the unlit side.
const LIGHT_FROM_VIEW = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();

interface WorldProps {
  planet: PlanetSummary;
  paused: boolean;
  controlsRef: RefObject<ViewerControls | null>;
  onReady: () => void;
  clearRight: number;
}

/** Less than half, so the planet's limb passes behind the glass and bends in it. */
const PANEL_OVERLAP = 0.05;
const STACKED_BELOW = 1080;
/** How far above centre the planet sits while the page scrolls over it. */
const STACKED_RAISE = 0.22;
const ARRIVAL_DISTANCE = 1.5;
const ARRIVAL_SECONDS = 2.2;
const CAMERA_EASE = 5;

function ViewerWorld({ planet, paused, controlsRef, onReady, clearRight }: WorldProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const [detail] = useState(() =>
    window.innerWidth < 760 ? VIEWER_DETAIL_MOBILE : VIEWER_DETAIL,
  );

  const halfFov = THREE.MathUtils.degToRad(FOV / 2);
  const shorterSide = Math.min(size.width / size.height, 1);
  const homeDistance = 1 / Math.tan(halfFov) / (FILL * shorterSide);

  const controls = useOrbitControls({
    minDistance: MAX_ZOOM_IN,
    maxDistance: homeDistance * 1.8,
  });

  const flight = useRef<number | null>(null);
  const arrival = useRef<"waiting" | number | null>(null);
  const home = useRef(false);
  const homePosition = useMemo(
    () => new THREE.Vector3(0, 0, homeDistance),
    [homeDistance],
  );

  useEffect(() => {
    camera.position.copy(homePosition);
    // Waits back here until the planet is ready, then glides in as the cover fades.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      camera.position.multiplyScalar(ARRIVAL_DISTANCE);
      arrival.current = "waiting";
    }
    controls.update();
    // Framed for the current size; a resize re-frames the same way.
  }, [camera, controls, homePosition]);

  // Slides the picture, not the planet, so dragging still turns it about its centre.
  useEffect(() => {
    const view = camera as THREE.PerspectiveCamera;
    const stacked = size.width <= STACKED_BELOW;
    view.setViewOffset(
      size.width,
      size.height,
      stacked ? 0 : clearRight * PANEL_OVERLAP,
      stacked ? size.height * STACKED_RAISE : 0,
      size.width,
      size.height,
    );
    return () => view.clearViewOffset();
  }, [camera, clearRight, size.height, size.width]);

  // Taking hold of the view ends the glide, so the visitor always wins.
  useEffect(() => {
    const stop = () => {
      arrival.current = null;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  const planetReady = useCallback(() => {
    if (arrival.current === "waiting") arrival.current = 0;
    onReady();
  }, [onReady]);

  useEffect(() => {
    controlsRef.current = {
      zoom(factor) {
        flight.current = THREE.MathUtils.clamp(
          camera.position.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        );
      },
      reset() {
        home.current = true;
      },
    };
  }, [camera, controls, controlsRef]);

  const light = useMemo(() => LIGHT_FROM_VIEW.clone(), []);

  useFrame((_, delta) => {
    light.copy(LIGHT_FROM_VIEW).applyQuaternion(camera.quaternion);

    if (typeof arrival.current === "number") {
      arrival.current = Math.min(arrival.current + Math.min(delta, 0.1) / ARRIVAL_SECONDS, 1);
      const t = arrival.current;
      const eased = t * t * t * (t * (6 * t - 15) + 10);
      camera.position.setLength(homeDistance * (ARRIVAL_DISTANCE + (1 - ARRIVAL_DISTANCE) * eased));
      if (t === 1) arrival.current = null;
    }

    const ease = 1 - Math.exp(-Math.min(delta, 0.05) * CAMERA_EASE);
    if (flight.current !== null) {
      const next = THREE.MathUtils.lerp(camera.position.length(), flight.current, ease);
      camera.position.setLength(next);
      if (Math.abs(next - flight.current) < 0.01) flight.current = null;
    }
    if (home.current) {
      camera.position.lerp(homePosition, ease);
      if (camera.position.distanceTo(homePosition) < 0.01) home.current = false;
    }
  });

  const skyCloud = useMemo(() => createSkyCloud(2000), []);

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <PointCloudLayer cloud={skyCloud} scale={260} maxSize={3} />
      <ProceduralPlanet
        planet={planet}
        detail={detail}
        paused={paused}
        lightDirection={light}
        onReady={planetReady}
      />
    </>
  );
}

interface PlanetViewerSceneProps extends WorldProps {
  fallback: React.ReactNode;
}

export default function PlanetViewerScene({ fallback, ...world }: PlanetViewerSceneProps) {
  return (
    <SceneCanvas
      fallback={fallback}
      dpr={[1, 1.75]}
      camera={{ fov: FOV, near: 0.05, far: 1200, position: [0, 0, 6] }}
    >
      <ViewerWorld {...world} />
    </SceneCanvas>
  );
}
