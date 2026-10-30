import type { PlanetRecord, PlanetSummary } from "@/types/planet";

/** Bit order for gapFilledMask and limitMask. Matches scripts/build-catalog.mjs. */
export const METRIC_PATHS = [
  "physical.radius",
  "physical.mass",
  "physical.density",
  "climate.equilibrium_temperature",
  "orbit.period",
  "orbit.semi_major_axis",
  "orbit.eccentricity",
  "host_star.temperature",
  "location.distance",
] as const;

export type MetricPath = (typeof METRIC_PATHS)[number];

export const hasMetricBit = (mask: number, path: MetricPath) =>
  (mask & (1 << METRIC_PATHS.indexOf(path))) !== 0;

const metricMask = (entries: Record<string, unknown>) =>
  METRIC_PATHS.reduce((mask, path, bit) => (entries[path] ? mask | (1 << bit) : mask), 0);

export function toPlanetSummary(planet: PlanetRecord): PlanetSummary {
  return {
    id: planet.id,
    name: planet.pl_name,
    hostname: planet.hostname,
    systemId: planet.system_id,
    radiusEarth: planet.physical.radius_earth,
    radiusJupiter: planet.physical.radius_jupiter,
    massEarth: planet.physical.mass_earth,
    massIsMinimum: planet.physical.mass_provenance !== "Mass",
    density: planet.physical.density ?? planet.physical.density_calculated,
    temperatureK: planet.climate.equilibrium_temperature_kelvin,
    starTemperatureK: planet.host_star.temperature_kelvin,
    periodDays: planet.orbit.period_days,
    semiMajorAxisAu: planet.orbit.semi_major_axis_au,
    distanceLy: planet.location.distance_light_years,
    method: planet.discovery.method,
    year: planet.discovery.year,
    sizeClass: planet.size_class,
    eccentricity: planet.orbit.eccentricity,
    gapFilledMask: metricMask(planet.provenance.gap_filled),
    limitMask: metricMask(planet.provenance.limits),
    densityIsCalculated:
      planet.physical.density === null && planet.physical.density_calculated !== null,
  };
}

/** A plain sentence built only from values the record holds. */
export function describePlanet(planet: PlanetSummary): string {
  const size =
    planet.radiusEarth !== null
      ? `A planet ${planet.radiusEarth.toLocaleString("en-US")} times Earth's radius`
      : "A planet of unmeasured radius";
  const orbit =
    planet.periodDays !== null
      ? `, orbiting ${planet.hostname} every ${planet.periodDays.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`
      : `, orbiting ${planet.hostname}`;
  const found = planet.year !== null ? `. Discovered in ${planet.year}.` : ".";
  return `${size}${orbit}${found}`;
}
