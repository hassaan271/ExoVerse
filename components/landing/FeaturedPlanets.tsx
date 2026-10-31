"use client";

import Link from "next/link";
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { PlanetPortrait } from "@/components/planet/PlanetPortrait";
import { hasMetricBit } from "@/lib/planetSummary";
import type { PlanetSummary } from "@/types/planet";
import styles from "./FeaturedPlanets.module.css";

/** Past this many pixels a press is a drag, not a click on the card. */
const DRAG_THRESHOLD = 6;

const number = (value: number, digits = 3) =>
  value.toLocaleString("en-US", { maximumSignificantDigits: digits });

/** Up to two measured values. A missing value or a limit is left out, not filled. */
function cardStats(planet: PlanetSummary) {
  const { limitMask, radiusEarth, periodDays, temperatureK } = planet;
  const stats = [
    radiusEarth !== null && !hasMetricBit(limitMask, "physical.radius")
      ? { label: "Radius", value: `${number(radiusEarth)} × Earth` }
      : null,
    periodDays !== null && !hasMetricBit(limitMask, "orbit.period")
      ? { label: "Orbit", value: `${number(periodDays)} days` }
      : null,
    temperatureK !== null && !hasMetricBit(limitMask, "climate.equilibrium_temperature")
      ? { label: "Equilibrium temperature", value: `${number(temperatureK, 4)} K` }
      : null,
  ];
  return stats.flatMap((stat) => stat ?? []).slice(0, 2);
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={direction === "left" ? "M11 3.5 5.5 9l5.5 5.5" : "M7 3.5 12.5 9 7 14.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FeaturedPlanets({
  planets,
  totalPlanets,
}: {
  planets: PlanetSummary[];
  totalPlanets: number;
}) {
  const track = useRef<HTMLUListElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  // Scroll position goes straight to the DOM. React only hears about the ends.
  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const room = element.scrollWidth - element.clientWidth;
    const share = element.clientWidth / element.scrollWidth;
    const position = room > 0 ? element.scrollLeft / room : 0;
    if (progress.current) {
      progress.current.style.width = `${share * 100}%`;
      progress.current.style.transform = `translateX(${(position * (1 - share) * 100) / share}%)`;
    }
    setAtStart(element.scrollLeft < 4);
    setAtEnd(element.scrollLeft > room - 4);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const move = (direction: 1 | -1, cards = 1) => {
    const element = track.current;
    const card = element?.firstElementChild as HTMLElement | null;
    if (!element || !card) return;
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({
      left: direction * cards * (card.offsetWidth + gap),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  };

  // Touch and trackpads scroll natively. A mouse has no sideways gesture.
  const onPointerDown = (event: PointerEvent) => {
    const element = track.current;
    if (event.pointerType !== "mouse" || event.button !== 0 || !element) return;
    drag.current = { active: true, startX: event.clientX, startScroll: element.scrollLeft, moved: false };
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    const element = track.current;
    if (!state.active || !element) return;
    const offset = event.clientX - state.startX;
    if (!state.moved && Math.abs(offset) < DRAG_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      element.dataset.dragging = "true";
    }
    element.scrollLeft = state.startScroll - offset;
  };

  const endDrag = () => {
    drag.current.active = false;
    if (track.current) delete track.current.dataset.dragging;
    // After this drag's own click, which fires first, clicks work again.
    window.setTimeout(() => {
      drag.current.moved = false;
    });
  };

  // A drag that ends over a card must not open it.
  const onClickCapture = (event: MouseEvent) => {
    if (drag.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <section className={styles.section} aria-labelledby="featured-title">
      <div className={styles.intro}>
        <h2 id="featured-title" className={styles.title}>
          Featured planetary systems
        </h2>
        <p className={styles.note}>
          Measurements are from the NASA Exoplanet Archive. Images are artistic
          visualizations, not photographs.
        </p>
      </div>

      <ul
        ref={track}
        className={styles.track}
        tabIndex={0}
        aria-label="Featured planets. Use the left and right arrow keys to scroll."
        onScroll={measure}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(event) => event.preventDefault()}
      >
        {planets.map((planet) => (
          <li key={planet.id} className={`plate ${styles.card}`}>
            <PlanetPortrait planet={planet} className={styles.portrait} />
            <div className={styles.body}>
              <h3 className={styles.name}>{planet.name}</h3>
              <p className={styles.meta}>Orbits {planet.hostname}</p>
              <p className={styles.category}>{planet.sizeClass}</p>
              <dl className={styles.stats}>
                {cardStats(planet).map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href={`/planets/${planet.id}`}
                className={styles.link}
                aria-label={`View ${planet.name}, orbiting ${planet.hostname}`}
              >
                View planet
                <Arrow direction="right" />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className={styles.controls}>
        <span className={styles.progress} aria-hidden="true">
          <span ref={progress} className={styles.progressBar} />
        </span>
        <button type="button" className="icon-button" aria-label="Previous planets" disabled={atStart} onClick={() => move(-1, 2)}>
          <Arrow direction="left" />
        </button>
        <button type="button" className="icon-button" aria-label="Next planets" disabled={atEnd} onClick={() => move(1, 2)}>
          <Arrow direction="right" />
        </button>
      </div>

      <div className={styles.more}>
        <Link href="/explore" className="button button-primary">
          Explore More Planets
        </Link>
        <p className={styles.moreNote}>
          Search and filter all {totalPlanets.toLocaleString("en-US")} planets in the catalog.
        </p>
      </div>
    </section>
  );
}
