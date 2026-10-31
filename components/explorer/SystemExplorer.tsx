"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HabitabilityAssessment } from "@/components/habitability/HabitabilityAssessment";
import { HabitableZoneLegend } from "@/components/habitability/HabitableZoneLegend";
import { PlanetInfoPanel } from "@/components/planet/PlanetInfoPanel";
import { Icon } from "@/components/shared/Icon";
import { formatValue } from "@/lib/format";
import { clearSelection, reportSelection, SYSTEM_COMMAND, type SystemCommand } from "@/lib/ai/appContext";
import { type SystemViewMode, systemLayouts } from "@/lib/galaxyLayout";
import type { HabitabilityPlanet, HabitabilitySystem } from "@/lib/habitability";
import { toPlanetSummary } from "@/lib/planetSummary";
import type { PlanetRecord, SystemRecord } from "@/types/planet";
import type { SystemPlayback } from "@/components/three/SystemScene";
import { PlanetRows } from "./PlanetRows";
import { SceneLoading, SceneUnavailable } from "./SceneFallback";
import { SystemControls } from "./SystemControls";
import styles from "./SystemExplorer.module.css";

const SystemScene = dynamic(() => import("@/components/three/SystemScene"), {
  ssr: false,
});

export function SystemExplorer({
  system,
  planets,
  habitability,
  planetHabitability,
  initialPlanetId,
}: {
  system: SystemRecord;
  planets: PlanetRecord[];
  habitability: HabitabilitySystem | null;
  planetHabitability: HabitabilityPlanet[];
  initialPlanetId?: string;
}) {
  const [selectedId, setSelectedId] = useState(
    planets.some((planet) => planet.id === initialPlanetId) ? (initialPlanetId as string) : planets[0].id,
  );
  const [ready, setReady] = useState(false);
  const [showZone, setShowZone] = useState(true);
  const playback = useRef<SystemPlayback>({ zoom: 0, speed: 1, paused: false });
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    reportSelection({ planetId: selectedId, systemId: system.id });
    return clearSelection;
  }, [selectedId, system.id]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<SystemCommand>).detail;
      if (command.systemId !== system.id) return;
      if (command.planetId && planets.some((planet) => planet.id === command.planetId)) {
        setSelectedId(command.planetId);
      }
      if (command.zoomOut) {
        playback.current.zoom = 0;
        playback.current.onZoomChange?.(0);
      }
      command.handled = true;
    };
    window.addEventListener(SYSTEM_COMMAND, onCommand);
    return () => window.removeEventListener(SYSTEM_COMMAND, onCommand);
  }, [planets, system.id]);
  const selectedIndex = Math.max(planets.findIndex((p) => p.id === selectedId), 0);
  const selected = planets[selectedIndex];
  const summaries = useMemo(() => planets.map(toPlanetSummary), [planets]);
  const [mode, setMode] = useState<SystemViewMode>("enhanced");
  const layouts = useMemo(
    () =>
      systemLayouts(
        planets.map((planet) => ({
          name: planet.pl_name,
          semiMajorAxisAu: planet.orbit.semi_major_axis_au,
          periodDays: planet.orbit.period_days,
          eccentricity: planet.orbit.eccentricity,
          argumentOfPeriastronDegrees: planet.orbit.argument_of_periastron_degrees,
          radiusEarth: planet.physical.radius_earth,
        })),
        {
          radiusSolar: system.host_star.radius_solar,
          massSolar: system.host_star.mass_solar,
        },
      ),
    [planets, system],
  );
  const layout = layouts[mode];
  const orbit = layout.orbits[selectedIndex];
  const distance = system.location.distance_light_years;
  const zone = habitability?.zone ?? null;
  const selectedHabitability = planetHabitability.find((planet) => planet.id === selected.id);

  const orbitNote = [
    orbit.distanceSource === "kepler" &&
      "Orbital distance calculated from period and star mass.",
    orbit.distanceSource === "illustrative" &&
      "No orbital distance is available, so this orbit is illustrative and placed by order.",
    !orbit.eccentricityKnown && "Eccentricity is not available, so the orbit is drawn circular.",
    !orbit.periodKnown && "Orbital period is not available, so its speed is illustrative.",
    !orbit.radiusKnown &&
      "Radius is not available, so this planet is drawn at a stand-in size of one Earth radius.",
  ].filter(Boolean);

  return (
    <div className={styles.shell}>
      <section className={styles.scene} aria-label={`${system.hostname} system view`}>
        <SceneLoading label={`Loading ${system.hostname}`} ready={ready} />
        <SystemScene
          zone={showZone ? zone : null}
          indicative={habitability?.indicative ?? false}
          system={system}
          planets={planets}
          layout={layout}
          physical={mode === "physical"}
          selectedId={selectedId}
          playback={playback}
          onSelect={setSelectedId}
          onReady={onReady}
          fallback={
            <SceneUnavailable>
              This device can't show the 3D system. You can still open each planet
              from the list.
            </SceneUnavailable>
          }
        />
      </section>

      <HabitableZoneLegend
        system={habitability}
        layout={layout}
        compressed={mode === "enhanced"}
        visible={showZone}
        onToggle={() => setShowZone((value) => !value)}
      />

      <div className={styles.toolbar}>
        <SystemControls
          playback={playback}
          planetName={selected.pl_name}
          mode={mode}
          onModeChange={setMode}
        />
      </div>

      <section className={`glass ${styles.bodies}`} aria-labelledby="system-title">
        <Link href={`/explore?system=${system.id}`} className={styles.back}>
          <Icon name="back" size={18} />
          Galaxy
        </Link>
        <div>
          <h1 id="system-title" className={styles.title}>
            {system.hostname}
          </h1>
          <p className={styles.star}>
            {system.host_star.spectral_type ?? "Spectral type not available"},{" "}
            {distance === null
              ? "distance not available"
              : `${formatValue(distance, "light-years")} away`}
          </p>
        </div>
        <h2 className={styles.listTitle}>
          {planets.length === 1 ? "1 planet" : `${planets.length} planets`}
        </h2>
        <PlanetRows planets={summaries} selectedId={selectedId} onSelect={setSelectedId} />
      </section>

      <aside className={`glass ${styles.preview}`} aria-label="Selected planet">
        <PlanetInfoPanel key={selected.id} planet={selected} />
        {selectedHabitability && (
          <HabitabilityAssessment
            key={`hz-${selected.id}`}
            planet={selectedHabitability}
            system={habitability}
            compact
          />
        )}
        {orbitNote.length > 0 && <p className={styles.note}>{orbitNote.join(" ")}</p>}
        <Link href={`/planets/${selected.id}`} className="button button-primary">
          View planet
        </Link>
      </aside>
    </div>
  );
}
