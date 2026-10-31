"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";

const HIT_RADIUS_MOUSE_PX = 14;
const HIT_RADIUS_TOUCH_PX = 26;
/** A press only counts as a click if it is short and nearly still. */
const CLICK_MAX_MOVE_PX = 4;
const CLICK_MAX_MS = 320;

const projected = new THREE.Vector3();

export interface LabelSlot {
  element: HTMLElement | null;
  /** Index into `points`, or -1 to hide the label. */
  point: number;
}

interface Options {
  /** World positions. May be moved every frame, as planets are. */
  points: RefObject<THREE.Vector3[]>;
  /** Only the first `pickableCount` points respond to the pointer. */
  pickableCount: number;
  labels: RefObject<LabelSlot[]>;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}

/**
 * Picks by distance on screen rather than by ray. Markers are tiny, so a fixed
 * hit radius stays easy to use with a finger at any zoom. With thousands of
 * markers, every point is projected only when the pointer acts; the per-frame
 * pass touches just the handful of points that carry a DOM label.
 */
export function useScreenPicking({
  points,
  pickableCount,
  labels,
  onHover,
  onSelect,
}: Options) {
  const canvas = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);
  const hovered = useRef<number | null>(null);
  const callbacks = useRef({ onHover, onSelect });
  callbacks.current = { onHover, onSelect };

  useFrame(({ size }) => {
    for (const slot of labels.current) {
      const { element, point } = slot;
      if (!element) continue;
      const target = points.current[point];
      if (!target) {
        element.style.visibility = "hidden";
        continue;
      }
      projected.copy(target).project(camera);
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      element.style.visibility = projected.z < 1 ? "" : "hidden";
    }
  });

  useEffect(() => {
    const nearest = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      let best: number | null = null;
      let bestDistance =
        event.pointerType === "mouse" ? HIT_RADIUS_MOUSE_PX : HIT_RADIUS_TOUCH_PX;

      for (let index = 0; index < pickableCount; index += 1) {
        const point = points.current[index];
        if (!point) continue;
        projected.copy(point).project(camera);
        if (projected.z >= 1) continue;
        const x = ((projected.x + 1) / 2) * bounds.width;
        const y = ((1 - projected.y) / 2) * bounds.height;
        const distance = Math.hypot(x - pointerX, y - pointerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    };

    const setHovered = (next: number | null) => {
      if (next === hovered.current) return;
      hovered.current = next;
      canvas.style.cursor = next === null ? "" : "pointer";
      callbacks.current.onHover(next);
    };

    let downX = 0;
    let downY = 0;
    let downAt = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.buttons === 0) {
        setHovered(nearest(event));
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      downAt = performance.now();
    };
    const onPointerUp = (event: PointerEvent) => {
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (moved > CLICK_MAX_MOVE_PX || performance.now() - downAt > CLICK_MAX_MS) return;
      const index = nearest(event);
      if (index !== null) callbacks.current.onSelect(index);
    };
    const onPointerLeave = () => setHovered(null);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [camera, canvas, pickableCount, points]);
}
