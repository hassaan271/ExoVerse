"use client";

import { useEffect, useRef } from "react";
import styles from "./CursorLight.module.css";

const LIT_SURFACES = ".glass, .plate, .button-secondary";
const INTERACTIVE = "a, button, input, select, summary, label";
/** How quickly each light catches up with the pointer, per second. */
const SPOT_EASE = 7;
const SURFACE_EASE = 14;
const SETTLED_PX = 0.2;

/**
 * A light that follows the cursor. One soft spot trails behind it, and the single
 * surface beneath it catches the same light on its face and edge. Everything
 * runs in one animation loop that stops when the light comes to rest, and only
 * the one lit element is written to, so moving the mouse never renders React.
 */
export function CursorLight() {
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = spot.current;
    if (!canHover || reduced || !light) return;

    let frame = 0;
    let last = 0;
    let targetX = 0;
    let targetY = 0;
    let spotX = 0;
    let spotY = 0;
    let surfaceX = 0;
    let surfaceY = 0;
    let started = false;
    let pointed: Element | null = null;
    let surface: HTMLElement | null = null;
    let bounds: DOMRect | null = null;

    const setSurface = (next: HTMLElement | null) => {
      if (next === surface) return;
      surface?.removeAttribute("data-lit");
      surface = next;
      bounds = next?.getBoundingClientRect() ?? null;
      if (next && bounds) {
        surfaceX = targetX;
        surfaceY = targetY;
        next.style.setProperty("--light-scroll", `${next.scrollTop}px`);
        next.style.setProperty("--lx", `${targetX - bounds.left}px`);
        next.style.setProperty("--ly", `${targetY - bounds.top}px`);
        next.setAttribute("data-lit", "true");
      }
    };

    const tick = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (pointed) {
        setSurface(pointed.closest<HTMLElement>(LIT_SURFACES));
        light.dataset.over = String(pointed.closest(INTERACTIVE) !== null);
        pointed = null;
      }

      spotX += (targetX - spotX) * (1 - Math.exp(-elapsed * SPOT_EASE));
      spotY += (targetY - spotY) * (1 - Math.exp(-elapsed * SPOT_EASE));
      light.style.transform = `translate3d(${spotX}px, ${spotY}px, 0)`;

      if (surface && bounds) {
        surfaceX += (targetX - surfaceX) * (1 - Math.exp(-elapsed * SURFACE_EASE));
        surfaceY += (targetY - surfaceY) * (1 - Math.exp(-elapsed * SURFACE_EASE));
        surface.style.setProperty("--lx", `${surfaceX - bounds.left}px`);
        surface.style.setProperty("--ly", `${surfaceY - bounds.top}px`);
      }

      const moving =
        Math.abs(targetX - spotX) > SETTLED_PX || Math.abs(targetY - spotY) > SETTLED_PX;
      frame = moving ? requestAnimationFrame(tick) : 0;
    };

    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!started) {
        started = true;
        spotX = targetX;
        spotY = targetY;
      }
      light.dataset.visible = "true";
      pointed = event.target instanceof Element ? event.target : null;
      wake();
    };

    const onLeave = () => {
      light.dataset.visible = "false";
      setSurface(null);
    };

    // A scroll moves the surface under a still cursor, and the light is painted
    // inside the surface, so a scrolling panel has to carry it along.
    const onScroll = () => {
      if (!surface) return;
      bounds = surface.getBoundingClientRect();
      surface.style.setProperty("--light-scroll", `${surface.scrollTop}px`);
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      setSurface(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <div ref={spot} className={styles.spot} aria-hidden="true" />;
}
