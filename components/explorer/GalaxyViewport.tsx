"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { GalaxyControls } from "@/components/three/GalaxyScene";
import type { GalaxyViewMode } from "@/lib/galaxyLayout";
import type { SystemSummary } from "@/types/planet";
import { SceneLoading, SceneUnavailable } from "./SceneFallback";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./GalaxyViewport.module.css";
import { SceneToolbar } from "./SceneToolbar";

const GalaxyScene = dynamic(() => import("@/components/three/GalaxyScene"), {
  ssr: false,
});

const HINT: Record<GalaxyViewMode, string> = {
  galaxy:
    "True scale, 1 unit = 100 parsecs. Sharp points are NASA host stars at real positions. The soft spiral is decorative.",
  neighbourhood:
    "Directions are real. Distance from the Sun is logarithmic, so each ring is ten times farther.",
};

interface GalaxyViewportProps {
  systems: SystemSummary[];
  selectedId: string;
  matching: Set<string> | null;
  onSelect: (id: string) => void;
}

export function GalaxyViewport({
  systems,
  selectedId,
  matching,
  onSelect,
}: GalaxyViewportProps) {
  const controls = useRef<GalaxyControls | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<GalaxyViewMode>("galaxy");

  return (
    <section className={styles.viewport} aria-label="Galaxy view">
      <SceneLoading label="Loading the galaxy" ready={ready} />
      <GalaxyScene
        systems={systems}
        selectedId={selectedId}
        matching={matching}
        mode={mode}
        paused={paused}
        onSelect={onSelect}
        controlsRef={controls}
        onReady={() => setReady(true)}
        fallback={
          <SceneUnavailable>
            This device can't show the 3D galaxy. You can still search and choose a
            system from the list.
          </SceneUnavailable>
        }
      />
      <div className={styles.toolbar}>
        <SceneToolbar
          hint={HINT[mode]}
          paused={paused}
          pauseLabel="rotation"
          onTogglePause={() => setPaused((value) => !value)}
          onZoomIn={() => controls.current?.zoom(0.7)}
          onZoomOut={() => controls.current?.zoom(1.4)}
          onReset={() => controls.current?.reset()}
        >
          <div className={styles.modes} role="group" aria-label="Map scale">
            <LiquidIndicator />
            <button type="button" aria-pressed={mode === "galaxy"} onClick={() => setMode("galaxy")}>
              True scale
            </button>
            <button
              type="button"
              aria-pressed={mode === "neighbourhood"}
              onClick={() => setMode("neighbourhood")}
            >
              Neighbourhood
            </button>
          </div>
        </SceneToolbar>
      </div>
    </section>
  );
}
