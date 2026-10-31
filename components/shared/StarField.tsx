"use client";

import { useEffect, useRef } from "react";
import styles from "./StarField.module.css";

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  phase: number;
  speed: number;
}

const FRAME_MS = 50;

/** A sparse, slowly twinkling star layer. It only draws while on screen. */
export function StarField({
  density = 1,
  className,
}: {
  density?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let frame = 0;
    let lastDraw = 0;
    let visible = false;

    const draw = (time: number) => {
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const twinkle = still
          ? 1
          : 0.6 + 0.4 * Math.sin(time * star.speed + star.phase);
        context.globalAlpha = star.alpha * twinkle;
        context.fillStyle = "#ecebe6";
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const loop = (time: number) => {
      if (time - lastDraw >= FRAME_MS) {
        lastDraw = time;
        draw(time);
      }
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (still) draw(0);
      else if (visible) frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      const area = canvas.clientWidth * canvas.clientHeight;
      const count = Math.min(Math.round((area / 14000) * density), 260);
      stars = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        radius: (0.4 + Math.random() ** 3 * 1.1) * ratio,
        alpha: 0.25 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0004 + Math.random() * 0.0012,
      }));
      draw(lastDraw);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else cancelAnimationFrame(frame);
    });
    intersectionObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.field} ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
