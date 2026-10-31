"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { SceneLoading, SceneUnavailable } from "@/components/explorer/SceneFallback";
import { SceneToolbar } from "@/components/explorer/SceneToolbar";
import { Icon } from "@/components/shared/Icon";
import type { ViewerControls } from "@/components/three/PlanetViewerScene";
import type { PlanetSummary } from "@/types/planet";
import styles from "./PlanetViewer.module.css";

const PlanetViewerScene = dynamic(
  () => import("@/components/three/PlanetViewerScene"),
  { ssr: false },
);

/** `clearRight` is the width of a side panel, which the planet shifts away from. */
export function PlanetViewer({ planet, clearRight = 0 }: { planet: PlanetSummary; clearRight?: number }) {
  const controls = useRef<ViewerControls | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  return (
    <section className={styles.viewer} aria-label={`3D view of ${planet.name}`}>
      <SceneLoading label={`Rendering ${planet.name}`} ready={ready} />
      <PlanetViewerScene
        planet={planet}
        paused={paused}
        controlsRef={controls}
        clearRight={clearRight}
        onReady={onReady}
        fallback={
          <SceneUnavailable>
            This device can't show the 3D planet. Its details are all listed here.
          </SceneUnavailable>
        }
      />
      <Link href={`/explore/systems/${planet.systemId}`} className={`glass ${styles.back}`}>
        <Icon name="back" size={18} />
        Return to system
      </Link>
      <div className={styles.toolbar}>
        <SceneToolbar
          hint="Drag to rotate, scroll to zoom. Artistic visualization."
          paused={paused}
          pauseLabel="rotation"
          onTogglePause={() => setPaused((value) => !value)}
          onZoomIn={() => controls.current?.zoom(0.8)}
          onZoomOut={() => controls.current?.zoom(1.25)}
          onReset={() => controls.current?.reset()}
        />
      </div>
    </section>
  );
}
