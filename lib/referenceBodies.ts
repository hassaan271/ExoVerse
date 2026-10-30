import { EARTH_RADII_PER_JUPITER_RADIUS } from "@/lib/planetScale";
import type { PlanetSummary } from "@/types/planet";

/**
 * Earth and Jupiter, the permanent comparison references. These are not
 * exoplanet catalog records. Values are from the NASA Planetary Fact Sheet
 * (nssdc.gsfc.nasa.gov/planetary/factsheet). Jupiter's radius is the archive's
 * own 11.209 Earth radii, so it shares a scale with catalog planets, and
 * temperature is the fact sheet's black-body value, the same idea as pl_eqt.
 */
const SHARED = {
  hostname: "Sun",
  systemId: "",
  massIsMinimum: false,
  starTemperatureK: 5772,
  distanceLy: null,
  method: null,
  year: null,
  gapFilledMask: 0,
  limitMask: 0,
  densityIsCalculated: false,
};

export const EARTH: PlanetSummary = {
  ...SHARED,
  id: "earth",
  name: "Earth",
  referenceBody: "earth",
  sizeClass: "Earth-sized",
  radiusEarth: 1,
  radiusJupiter: 1 / EARTH_RADII_PER_JUPITER_RADIUS,
  massEarth: 1,
  density: 5.514,
  temperatureK: 254,
  periodDays: 365.256,
  semiMajorAxisAu: 1,
  eccentricity: 0.0167,
};

export const JUPITER: PlanetSummary = {
  ...SHARED,
  id: "jupiter",
  name: "Jupiter",
  referenceBody: "jupiter",
  sizeClass: "Jupiter-sized",
  radiusEarth: EARTH_RADII_PER_JUPITER_RADIUS,
  radiusJupiter: 1,
  massEarth: 317.8,
  density: 1.326,
  temperatureK: 110,
  periodDays: 4332.589,
  semiMajorAxisAu: 5.203,
  eccentricity: 0.0489,
};

export const REFERENCE_SOURCE = "NASA Planetary Fact Sheet";
