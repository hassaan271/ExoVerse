"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPlanetVisual } from "@/lib/planet-visuals/forPlanet";
import type { PlanetSummary } from "@/types/planet";
import styles from "./PlanetPortrait.module.css";

/**
 * A planet rendered by the real engine, delivered as an image. Three.js only
 * loads once a portrait nears the viewport.
 */
export function PlanetPortrait({
  planet,
  className,
}: {
  planet: PlanetSummary;
  className?: string;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<string>("waiting");
  const visual = useMemo(() => getPlanetVisual(planet), [planet]);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    let active = true;
    setState("waiting");

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        try {
          const { getPlanetPortrait } = await import(
            "@/lib/planet-visuals/portraits"
          );
          const url = await getPlanetPortrait(visual);
          if (active) setState(url ?? "failed");
        } catch {
          if (active) setState("failed");
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [visual]);

  const ready = state !== "waiting" && state !== "failed";

  return (
    <span
      ref={holder}
      className={`${styles.portrait} ${className ?? ""}`}
      data-state={ready ? "ready" : state}
    >
      {ready && (
        // A local blob made in this browser, so next/image can't optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state} alt={`Artistic visualization of ${planet.name}`} />
      )}
    </span>
  );
}
