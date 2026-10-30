/** Earth radii in one Jupiter radius, the archive's own conversion. */
export const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;

/**
 * One planet radius in Earth radii. pl_rade is used directly, pl_radj is
 * converted only when pl_rade is blank, and with neither there is no radius.
 */
export function resolveRadius(earthRadii, jupiterRadii) {
  if (earthRadii !== null) return { radius: earthRadii, source: "pl_rade" };
  if (jupiterRadii !== null) {
    return { radius: jupiterRadii * EARTH_RADII_PER_JUPITER_RADIUS, source: "pl_radj" };
  }
  return { radius: null, source: null };
}
