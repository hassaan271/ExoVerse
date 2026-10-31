"use client";

import { type RefObject, useEffect, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import type { SystemPlayback } from "@/components/three/SystemScene";
import type { SystemViewMode } from "@/lib/galaxyLayout";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./SystemControls.module.css";

/** Playback multipliers. They scale time only, never the stored periods. */
const SPEEDS = [0.25, 0.5, 1, 2, 5, 10];
const DEFAULT_SPEED_INDEX = SPEEDS.indexOf(1);

/**
 * Planet Zoom and Orbital Speed. Values go to the scene through a ref, so
 * dragging a slider re-renders this bar and nothing in the 3D view.
 */
export function SystemControls({
  playback,
  planetName,
  mode,
  onModeChange,
}: {
  playback: RefObject<SystemPlayback>;
  planetName: string;
  mode: SystemViewMode;
  onModeChange: (mode: SystemViewMode) => void;
}) {
  const [zoom, setZoom] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const [paused, setPaused] = useState(false);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    const state = playback.current;
    state.onZoomChange = (value) => setZoom(Math.round(value * 100));
    state.onTooSmall = setTooSmall;
    return () => {
      state.onZoomChange = undefined;
      state.onTooSmall = undefined;
    };
  }, [playback]);

  const changeZoom = (value: number) => {
    setZoom(value);
    playback.current.zoom = value / 100;
  };

  const changeSpeed = (index: number) => {
    setSpeedIndex(index);
    playback.current.speed = SPEEDS[index];
  };

  const togglePaused = () => {
    playback.current.paused = !paused;
    setPaused(!paused);
  };

  return (
    <div className={`glass ${styles.controls}`}>
      <div className={styles.modes} role="group" aria-label="System scale">
        <LiquidIndicator />
        <button type="button" aria-pressed={mode === "enhanced"} onClick={() => onModeChange("enhanced")}>
          Visibility Enhanced
        </button>
        <button type="button" aria-pressed={mode === "physical"} onClick={() => onModeChange("physical")}>
          Physical Scale
        </button>
      </div>

      <div className={styles.control}>
        <label htmlFor="planet-zoom">Planet Zoom</label>
        <input
          id="planet-zoom"
          type="range"
          min={0}
          max={100}
          value={zoom}
          aria-valuetext={zoom === 0 ? "Whole system" : `${zoom} percent, ${planetName}`}
          onChange={(event) => changeZoom(Number(event.target.value))}
        />
        <output htmlFor="planet-zoom">{zoom === 0 ? "System" : `${zoom}%`}</output>
        <button
          type="button"
          className="icon-button"
          aria-label="Reset Planet Zoom"
          title="Reset Planet Zoom"
          onClick={() => changeZoom(0)}
        >
          <Icon name="reset" size={18} />
        </button>
      </div>

      <div className={styles.control}>
        <label htmlFor="orbital-speed">Orbital Speed</label>
        <input
          id="orbital-speed"
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          step={1}
          value={speedIndex}
          aria-valuetext={`${SPEEDS[speedIndex]} times`}
          onChange={(event) => changeSpeed(Number(event.target.value))}
        />
        <output htmlFor="orbital-speed">{SPEEDS[speedIndex]}×</output>
        <button
          type="button"
          className="icon-button"
          aria-label={paused ? "Resume orbits" : "Pause orbits"}
          title={paused ? "Resume orbits" : "Pause orbits"}
          aria-pressed={paused}
          onClick={togglePaused}
        >
          <Icon name={paused ? "play" : "pause"} size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Reset Orbital Speed"
          title="Reset Orbital Speed"
          onClick={() => changeSpeed(DEFAULT_SPEED_INDEX)}
        >
          <Icon name="reset" size={18} />
        </button>
      </div>

      <p className={styles.note}>
        {mode === "physical"
          ? "Planets, star and orbits share one true scale, so bodies are often far too small to see. Dots mark positions, not sizes."
          : "Planet size ratios are true within this system. Orbit spacing is compressed as the square root of AU, so these are not literal distances."}{" "}
        {tooSmall && `${planetName} is under a pixel wide at this zoom: raise Planet Zoom. `}
        Speed changes playback only. Dashed orbits are incomplete, tilt isn&rsquo;t shown, and
        close-up lighting is adjusted.
      </p>
    </div>
  );
}
