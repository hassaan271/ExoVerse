"use client";

import { useCallback, useEffect, useState } from "react";
import type { Catalog, PlanetSummary, SizeClass, SystemSummary } from "@/types/planet";

/**
 * The browser's copy of the catalog: every planet and system, in the flat form
 * written to public/data/catalog-index.json. Fetched once per visit.
 */
export const DEFAULT_SYSTEM_ID = "proxima-cen";
export const FEATURED_SYSTEM_IDS = ["proxima-cen", "trappist-1", "kepler-452", "toi-789"];

type N = number | null;
type SystemRow = [string, string, N, N, N, N, string | null, N, N, N];
type PlanetRow = [
  string, string, number, N, N, 0 | 1, N, N, N, N, N, string | null, N, SizeClass,
  N, number, number, 0 | 1, N,
];

interface RawIndex {
  metadata: Catalog["metadata"];
  systems: SystemRow[];
  planets: PlanetRow[];
}

function decode(raw: RawIndex): Catalog {
  const systems: SystemSummary[] = raw.systems.map(
    ([id, hostname, starTemperatureK, distanceLy, galacticLongitude, galacticLatitude,
      spectralType, distanceParsecs, starRadiusSolar, starMassSolar]) => ({
      id,
      hostname,
      starTemperatureK,
      distanceLy,
      galacticLongitude,
      galacticLatitude,
      spectralType,
      distanceParsecs,
      starRadiusSolar,
      starMassSolar,
      planets: [],
    }),
  );

  const planets: PlanetSummary[] = raw.planets.map((row) => {
    const [id, name, systemIndex, radiusEarth, massEarth, minimum, density, temperatureK,
      periodDays, semiMajorAxisAu, distanceLy, method, year, sizeClass, eccentricity,
      gapFilledMask, limitMask, calculatedDensity, radiusJupiter] = row;
    const system = systems[systemIndex];
    const planet: PlanetSummary = {
      id,
      name,
      hostname: system.hostname,
      systemId: system.id,
      radiusEarth,
      radiusJupiter,
      massEarth,
      massIsMinimum: minimum === 1,
      density,
      temperatureK,
      starTemperatureK: system.starTemperatureK,
      periodDays,
      semiMajorAxisAu,
      distanceLy,
      method,
      year,
      sizeClass,
      eccentricity,
      gapFilledMask,
      limitMask,
      densityIsCalculated: calculatedDensity === 1,
    };
    system.planets.push(planet);
    return planet;
  });

  for (const system of systems) {
    system.planets.sort(
      (a, b) =>
        (a.semiMajorAxisAu ?? a.periodDays ?? Infinity) -
        (b.semiMajorAxisAu ?? b.periodDays ?? Infinity),
    );
  }

  return {
    metadata: raw.metadata,
    systems,
    planets,
    methods: [...new Set(planets.flatMap((p) => p.method ?? []))].sort(),
    systemById: new Map(systems.map((system) => [system.id, system])),
    planetById: new Map(planets.map((planet) => [planet.id, planet])),
    stats: {
      planets: planets.length,
      systems: systems.length,
      multiPlanetSystems: systems.filter((s) => s.planets.length > 1).length,
      systemsWithPosition: systems.filter(
        (s) => s.distanceParsecs !== null && s.galacticLongitude !== null,
      ).length,
    },
  };
}

let request: Promise<Catalog> | null = null;

function loadCatalog() {
  request ??= fetch("/data/catalog-index.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
      return response.json();
    })
    .then(decode)
    .catch((error) => {
      request = null;
      throw error;
    });
  return request;
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    loadCatalog().then(setCatalog, () => setFailed(true));
  }, []);

  useEffect(load, [load]);

  return { catalog, failed, retry: load };
}
