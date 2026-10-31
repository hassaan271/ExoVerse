"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type * as THREE from "three";
import {
  createPlanetObject,
  type PlanetDetail,
  type PlanetObject,
  preparePlanetShaders,
} from "@/lib/planet-visuals/createPlanetObject";
import { getPlanetVisual } from "@/lib/planet-visuals/forPlanet";
import type { PlanetSummary } from "@/types/planet";

const ARRIVAL_SCALE = 0.92;
const ARRIVAL_SECONDS = 1.4;

interface ProceduralPlanetProps {
  /** Any catalog record. Appearance comes only from its data and name. */
  planet: PlanetSummary;
  detail: PlanetDetail;
  /** Shows a pointer and reports clicks through onSelect. */
  interactive?: boolean;
  paused?: boolean;
  scale?: number;
  /** Mutable world-space direction to the star. Read every frame. */
  lightDirection?: THREE.Vector3;
  onSelect?: () => void;
  onReady?: () => void;
}

/**
 * The single renderer for every planet in the catalog. It holds no per-planet
 * assets: a seed from the name and the record's values produce the surface.
 * Textures live only as long as the component, so views stay light.
 */
export const ProceduralPlanet = forwardRef<THREE.Group, ProceduralPlanetProps>(
  function ProceduralPlanet(
    {
      planet,
      detail,
      interactive = false,
      paused = false,
      scale = 1,
      lightDirection,
      onSelect,
      onReady,
    },
    forwardedRef,
  ) {
    const gl = useThree((state) => state.gl);
    const holder = useRef<THREE.Group>(null);
    const object = useRef<PlanetObject | null>(null);
    const arrival = useRef(1);
    const visual = useMemo(() => getPlanetVisual(planet), [planet]);

    useImperativeHandle(forwardedRef, () => holder.current as THREE.Group);

    useEffect(() => {
      const group = holder.current;
      if (!group) return;
      let built: PlanetObject | null = null;
      let active = true;

      preparePlanetShaders(gl, visual).then(() => {
        if (!active) return;
        built = createPlanetObject(gl, visual, detail);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        arrival.current = reduced ? 1 : 0;
        if (!reduced) built.group.scale.setScalar(ARRIVAL_SCALE);
        group.add(built.group);
        object.current = built;
        onReady?.();
      });

      return () => {
        active = false;
        object.current = null;
        if (built) {
          group.remove(built.group);
          built.dispose();
        }
      };
      // onReady may change identity without the planet changing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gl, visual, detail]);

    useFrame((_, delta) => {
      const current = object.current;
      if (!current) return;
      // Eases to full size. The `scale` prop on the holder stays exact throughout.
      if (arrival.current < 1) {
        arrival.current = Math.min(arrival.current + Math.min(delta, 0.05) / ARRIVAL_SECONDS, 1);
        const eased = arrival.current ** 2 * (3 - 2 * arrival.current);
        current.group.scale.setScalar(ARRIVAL_SCALE + (1 - ARRIVAL_SCALE) * eased);
      }
      current.update(paused ? 0 : delta);
      if (lightDirection) current.setLightDirection(lightDirection);
    });

    return (
      <group
        ref={holder}
        scale={scale}
        onClick={
          interactive
            ? (event) => {
                event.stopPropagation();
                onSelect?.();
              }
            : undefined
        }
        onPointerOver={
          interactive
            ? () => {
                gl.domElement.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? () => {
                gl.domElement.style.cursor = "";
              }
            : undefined
        }
      />
    );
  },
);
