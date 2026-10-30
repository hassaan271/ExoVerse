"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

interface Options {
  minDistance: number;
  maxDistance: number;
  autoRotateSpeed?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  enablePan?: boolean;
  enableZoom?: boolean;
  /**
   * The owner calls controls.update(delta) itself, after moving the camera or
   * target. Otherwise the view would lag those moves by a frame.
   */
  manualUpdate?: boolean;
}

export function useOrbitControls({
  minDistance,
  maxDistance,
  autoRotateSpeed = 0,
  minPolarAngle = 0,
  maxPolarAngle = Math.PI,
  enablePan = false,
  enableZoom = true,
  manualUpdate = false,
}: Options) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);

  const controls = useMemo(() => {
    const instance = new OrbitControls(camera, canvas);
    instance.enableDamping = true;
    instance.dampingFactor = 0.08;
    instance.enablePan = enablePan;
    instance.enableZoom = enableZoom;
    instance.minDistance = minDistance;
    instance.maxDistance = maxDistance;
    instance.minPolarAngle = minPolarAngle;
    instance.maxPolarAngle = maxPolarAngle;
    instance.rotateSpeed = 0.6;
    instance.autoRotate = autoRotateSpeed > 0;
    instance.autoRotateSpeed = autoRotateSpeed;
    return instance;
    // Set once: controls are recreated only with a new camera or canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, canvas]);

  // Connecting here, not only in the constructor, survives Strict Mode's
  // mount-unmount-mount, which would otherwise leave the controls deaf.
  useEffect(() => {
    controls.connect(canvas);
    return () => controls.disconnect();
  }, [canvas, controls]);

  useFrame((_, delta) => {
    if (!manualUpdate) controls.update(delta);
  });

  return controls;
}
