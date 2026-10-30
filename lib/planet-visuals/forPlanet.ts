import type { PlanetSummary } from "@/types/planet";
import { type PlanetVisual, resolvePlanetVisual } from "./visualProfile";

/** Gathers only the facts the catalog actually holds for this planet. */
export function getPlanetVisual(planet: PlanetSummary): PlanetVisual {
  return resolvePlanetVisual({
    name: planet.name,
    radiusEarth: planet.radiusEarth,
    massEarth: planet.massEarth,
    massIsMinimum: planet.massIsMinimum,
    densityGcm3: planet.density,
    equilibriumTempK: planet.temperatureK,
    starTempK: planet.starTemperatureK,
    referenceBody: planet.referenceBody,
  });
}
