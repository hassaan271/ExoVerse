"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogStats } from "@/types/planet";
import { AnimatedNumber } from "./AnimatedNumber";
import styles from "./CatalogStatsBar.module.css";

/** Counted from the loaded catalog, never written by hand. */
export function CatalogStatsBar({ stats }: { stats: CatalogStats }) {
  const holder = useRef<HTMLDListElement>(null);
  // Rolls when first seen, not while it's still below the fold.
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setSeen(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const items = [
    ["Exoplanets", stats.planets],
    ["Host-star systems", stats.systems],
    ["Multi-planet systems", stats.multiPlanetSystems],
    ["Systems with a 3D position", stats.systemsWithPosition],
  ] as const;

  return (
    <dl ref={holder} className={styles.stats}>
      {items.map(([label, value]) => (
        <div key={label} className={styles.stat}>
          <dd>
            <AnimatedNumber value={value} precision={0} animationKey={String(seen)} />
          </dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}
