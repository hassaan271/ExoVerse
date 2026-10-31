"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneLoading, SceneUnavailable } from "@/components/explorer/SceneFallback";
import { clearSelection, reportSelection } from "@/lib/ai/appContext";
import { useCatalog } from "@/lib/catalogIndex";
import { comparePlanets, compareSizes, radiusLabel, scaleNote } from "@/lib/compare";
import { EARTH, JUPITER, REFERENCE_SOURCE } from "@/lib/referenceBodies";
import { replaceUrl } from "@/lib/replaceUrl";
import type { Catalog, PlanetSummary } from "@/types/planet";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./CompareExperience.module.css";
import { CompareTable } from "./CompareTable";
import { PlanetPicker } from "./PlanetPicker";

const CompareScene = dynamic(() => import("@/components/three/CompareScene"), {
  ssr: false,
});

type Mode = "earth" | "jupiter" | "planets";

const MODES: { value: Mode; label: string }[] = [
  { value: "earth", label: "Compare with Earth" },
  { value: "jupiter", label: "Compare with Jupiter" },
  { value: "planets", label: "Compare two planets" },
];

const DEFAULT_A = "kepler-452-b";
const DEFAULT_B = "trappist-1-e";

function Comparison({ catalog }: { catalog: Catalog }) {
  const params = useSearchParams();
  const { planets: catalogPlanets, planetById } = catalog;
  // Earth and Jupiter are selectable too, but they stay separate from NASA data.
  const planets = useMemo(() => [EARTH, JUPITER, ...catalogPlanets], [catalogPlanets]);
  const findPlanet = (id: string | null) =>
    id === EARTH.id ? EARTH : id === JUPITER.id ? JUPITER : planetById.get(id ?? "");

  const [mode, setMode] = useState<Mode>(() => {
    const value = params.get("mode");
    return value === "jupiter" || value === "planets" ? value : "earth";
  });
  const [planetA, setPlanetA] = useState<PlanetSummary>(
    () => findPlanet(params.get("a")) ?? findPlanet(DEFAULT_A) ?? catalogPlanets[0],
  );
  const [planetB, setPlanetB] = useState<PlanetSummary>(() => {
    const requested = findPlanet(params.get("b"));
    if (requested) return requested;
    // Never open by comparing a planet with itself.
    const fallback = planetA.id === DEFAULT_B ? DEFAULT_A : DEFAULT_B;
    return findPlanet(fallback) ?? catalogPlanets[1];
  });
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  const right = mode === "earth" ? EARTH : mode === "jupiter" ? JUPITER : planetB;
  const rows = useMemo(() => comparePlanets(planetA, right), [planetA, right]);
  const sizes = useMemo(() => compareSizes(planetA, right), [planetA, right]);

  const syncUrl = (nextMode: Mode, a: PlanetSummary, b: PlanetSummary) => {
    const query = new URLSearchParams({ mode: nextMode, a: a.id });
    if (nextMode === "planets") query.set("b", b.id);
    replaceUrl(`/compare?${query}`);
  };

  useEffect(() => {
    reportSelection({ planetId: planetA.referenceBody ? null : planetA.id, comparison: [planetA.id, right.id] });
    return clearSelection;
  }, [planetA, right]);

  const labelARef = useRef<HTMLDivElement>(null);
  const labelBRef = useRef<HTMLDivElement>(null);
  const labelA = radiusLabel(planetA);
  const labelB = radiusLabel(right);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Compare worlds</h1>
        <div className={styles.modes} role="group" aria-label="Comparison mode">
          <LiquidIndicator />
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.mode}
              aria-pressed={mode === option.value}
              onClick={() => {
                setMode(option.value);
                syncUrl(option.value, planetA, planetB);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.pickers}>
        <PlanetPicker
          label="Planet A"
          planets={planets}
          selected={planetA}
          onSelect={(planet) => {
            setPlanetA(planet);
            syncUrl(mode, planet, planetB);
          }}
        />
        {mode === "planets" ? (
          <PlanetPicker
            label="Planet B"
            planets={planets}
            selected={planetB}
            onSelect={(planet) => {
              setPlanetB(planet);
              syncUrl(mode, planetA, planet);
            }}
          />
        ) : (
          <div className={styles.reference}>
            <span className={styles.referenceLabel}>Reference planet</span>
            <span>{right.name}, Solar System</span>
          </div>
        )}
      </div>

      <section className={styles.stage} aria-label={`3D comparison of ${planetA.name} and ${right.name}`}>
        <SceneLoading label="Rendering both planets" ready={ready} />
        <CompareScene
          a={planetA}
          b={right}
          sizes={sizes}
          labelA={labelARef}
          labelB={labelBRef}
          onReady={onReady}
          fallback={
            <SceneUnavailable>
              This device can't show the 3D comparison. All measurements are in the
              table below.
            </SceneUnavailable>
          }
        />
        <div className={styles.names}>
          <div>
            {planetA.referenceBody ? (
              <span className={styles.name}>{planetA.name}</span>
            ) : (
              <Link href={`/planets/${planetA.id}`} className={styles.name}>
                {planetA.name}
              </Link>
            )}
            <p>{planetA.referenceBody ? "Solar System, reference body" : planetA.hostname}</p>
          </div>
          <div className={styles.nameRight}>
            {right.referenceBody ? (
              <span className={styles.name}>{right.name}</span>
            ) : (
              <Link href={`/planets/${right.id}`} className={styles.name}>
                {right.name}
              </Link>
            )}
            <p>{right.referenceBody ? "Solar System, reference body" : right.hostname}</p>
          </div>
        </div>
        <div ref={labelARef} className={styles.sizeLabel}>
          <strong>{labelA.size}</strong>
          <span>{labelA.detail}</span>
        </div>
        <div ref={labelBRef} className={styles.sizeLabel}>
          <strong>{labelB.size}</strong>
          <span>{labelB.detail}</span>
        </div>
      </section>

      <p className={styles.scale}>{scaleNote(planetA, right, sizes)}</p>

      <CompareTable a={planetA} b={right} rows={rows} />

      <p className={styles.footnote}>
        Exoplanet values come from the NASA Exoplanet Archive. Earth and Jupiter are
        reference bodies from the {REFERENCE_SOURCE}, not catalog records. All images
        are artistic visualizations, and the Earth view is stylised, not a map.
      </p>
    </div>
  );
}

export function CompareExperience() {
  const { catalog, failed, retry } = useCatalog();
  const params = useSearchParams();

  if (failed) {
    return (
      <div className={styles.failure}>
        <p>The planet catalog didn't load. Check your connection and try again.</p>
        <button type="button" className="button button-secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className={styles.waiting}>
        <SceneLoading label="Loading the planet catalog" />
      </div>
    );
  }

  // A new link means new selections, which only apply when the view starts.
  return <Comparison key={params.toString()} catalog={catalog} />;
}
