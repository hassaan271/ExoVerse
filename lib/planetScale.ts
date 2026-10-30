/**
 * The one physical scale. Earth radii are the internal unit everywhere, and a
 * planet's drawn radius is always its radius in Earth radii times a single
 * factor for the whole scene. Nothing here depends on which planet it is.
 */
export const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
export const EARTH_RADII_PER_SOLAR_RADIUS = 109.2;
/** 149,597,870.7 km / 6,371 km */
export const EARTH_RADII_PER_AU = 23481;

/** The only conversion from radius to scene size. */
export function sceneRadius(radiusEarth: number, unitsPerEarthRadius: number) {
  return radiusEarth * unitsPerEarthRadius;
}
