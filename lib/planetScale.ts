/**
 * The one physical scale. Earth radii are the internal unit everywhere, and a
 * planet's drawn radius is always its radius in Earth radii times a single
 * factor for the whole scene. Nothing here depends on which planet it is.
 */
export const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
export const EARTH_RADII_PER_SOLAR_RADIUS = 109.2;
/** 149,597,870.7 km / 6,371 km */
export const EARTH_RADII_PER_AU = 23481;

/**
 * A radius estimated from mass, for planets with no measured radius. Chen &
 * Kipping 2017 (ApJ 834, 17), mean relation: rocky, then Neptune-like, then
 * giants, whose size barely changes with mass. An estimate, never a measurement.
 */
export function radiusFromMass(massEarth: number) {
  if (massEarth < 2.04) return 1.008 * massEarth ** 0.279;
  if (massEarth < 131.6) return 0.80811 * massEarth ** 0.589;
  return 17.74 * massEarth ** -0.044;
}

/** The only conversion from radius to scene size. */
export function sceneRadius(radiusEarth: number, unitsPerEarthRadius: number) {
  return radiusEarth * unitsPerEarthRadius;
}
