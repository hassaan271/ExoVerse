import { seedFromName } from "@/lib/planet-visuals/visualProfile";
import {
  EARTH_RADII_PER_AU,
  EARTH_RADII_PER_SOLAR_RADIUS,
  sceneRadius,
} from "@/lib/planetScale";
import type { SystemSummary } from "@/types/planet";

/**
 * Where things sit in the 3D galaxy.
 *
 * Frame: Galactocentric, right-handed, y up. The galactic centre is the origin,
 * the disc is the xz plane and +y points to the north galactic pole. The Sun
 * sits on the -x axis, so looking along +x from the Sun is looking at the centre.
 *
 * From NASA's fields: glon = l, glat = b, sy_dist = d in parsecs.
 *   X = d cos(b) cos(l)   towards the centre
 *   Y = d cos(b) sin(l)   along galactic rotation, l = 90
 *   Z = d sin(b)          towards the north galactic pole
 * Scene position = ((X - R0), (Z + z0), -Y) x scale. Y is negated because
 * (X, Z, Y) would be left-handed and mirror the sky.
 *
 * Two views use the same frame and directions:
 *   True scale: 1 unit is 100 parsecs, for galaxy and stars alike.
 *   Neighbourhood: direction is unchanged, and distance from the Sun is
 *   compressed logarithmically. The decorative galaxy is hidden there, because
 *   it can't share that scale.
 */
export type Vec3 = [number, number, number];
export type GalaxyViewMode = "galaxy" | "neighbourhood";

/** Bennett & Bovy 2019 for height, GRAVITY Collaboration 2019 for distance. */
export const SUN_TO_CENTRE_PARSECS = 8178;
export const SUN_ABOVE_PLANE_PARSECS = 20.8;
export const SCENE_UNITS_PER_PARSEC = 0.01;
export const SUN_POSITION: Vec3 = [
  -SUN_TO_CENTRE_PARSECS * SCENE_UNITS_PER_PARSEC,
  SUN_ABOVE_PLANE_PARSECS * SCENE_UNITS_PER_PARSEC,
  0,
];
export const GALACTIC_CENTRE: Vec3 = [0, 0, 0];

const LOCAL_BASE = 4;
const LOCAL_UNITS_PER_DECADE = 15;
const LIGHT_YEARS_PER_PARSEC = 3.26156;

/** Distance rings for the neighbourhood view, in light-years. */
export const NEIGHBOURHOOD_RINGS_LY = [10, 100, 1000, 10000];

export function hasPosition(system: SystemSummary) {
  return (
    system.distanceParsecs !== null &&
    system.galacticLongitude !== null &&
    system.galacticLatitude !== null
  );
}

/** Unit vector from the Sun, in scene axes. */
function sunDirection(system: SystemSummary): Vec3 {
  const l = ((system.galacticLongitude as number) * Math.PI) / 180;
  const b = ((system.galacticLatitude as number) * Math.PI) / 180;
  return [Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l)];
}

/** Call only for systems that pass hasPosition. */
export function trueScalePosition(system: SystemSummary): Vec3 {
  const direction = sunDirection(system);
  const reach = (system.distanceParsecs as number) * SCENE_UNITS_PER_PARSEC;
  return [
    SUN_POSITION[0] + direction[0] * reach,
    SUN_POSITION[1] + direction[1] * reach,
    SUN_POSITION[2] + direction[2] * reach,
  ];
}

export function compressedRadius(parsecs: number) {
  return LOCAL_BASE + Math.log10(Math.max(parsecs, 1)) * LOCAL_UNITS_PER_DECADE;
}

export function ringRadius(lightYears: number) {
  return compressedRadius(lightYears / LIGHT_YEARS_PER_PARSEC);
}

/** Call only for systems that pass hasPosition. */
export function neighbourhoodPosition(system: SystemSummary): Vec3 {
  const direction = sunDirection(system);
  const reach = compressedRadius(system.distanceParsecs as number);
  return [
    SUN_POSITION[0] + direction[0] * reach,
    SUN_POSITION[1] + direction[1] * reach,
    SUN_POSITION[2] + direction[2] * reach,
  ];
}

/** Screen size follows stellar radius gently, on a log scale. */
export function markerSize(starRadiusSolar: number | null, planetCount: number, featured: boolean) {
  const radius = starRadiusSolar ?? 1;
  const star = 0.0055 * (1 + Math.log10(1 + radius) * 0.9);
  return star + Math.min(planetCount, 8) * 0.0004 + (featured ? 0.006 : 0);
}

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PointCloud {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
}

function emptyCloud(count: number): PointCloud {
  return {
    positions: new Float32Array(count * 3),
    colors: new Float32Array(count * 3),
    sizes: new Float32Array(count),
  };
}

/**
 * Inner radii and arm pitch loosely follow Reid et al. 2019. The Sun sits
 * between two arms, as it does. Angle falls with radius so the arms trail the
 * Galaxy's rotation, which is clockwise seen from the north.
 */
const ARM_COUNT = 4;
const ARM_PITCH_FACTOR = 4.5; // 1 / tan(12.5 degrees)
const ARM_REFERENCE_KPC = 6.9;
const DISC_SCALE_KPC = 3.6;
const DISC_EDGE_KPC = 16.5;
const BAR_ANGLE = Math.PI + 0.45;

const armAngle = (arm: number, radiusKpc: number) =>
  Math.PI + (arm * Math.PI * 2) / ARM_COUNT - ARM_PITCH_FACTOR * Math.log(radiusKpc / ARM_REFERENCE_KPC);

const gaussian = (next: () => number) =>
  (next() + next() + next() + next() - 2) * 1.05;

/** Radius drawn from an exponential disc. */
function discRadius(next: () => number) {
  for (;;) {
    const radius = -Math.log(1 - next()) * DISC_SCALE_KPC;
    if (radius > 1.4 && radius < DISC_EDGE_KPC) return radius;
  }
}

function setPoint(cloud: PointCloud, index: number, x: number, y: number, z: number) {
  cloud.positions[index * 3] = x;
  cloud.positions[index * 3 + 1] = y;
  cloud.positions[index * 3 + 2] = z;
}

function setColor(cloud: PointCloud, index: number, r: number, g: number, b: number) {
  cloud.colors[index * 3] = r;
  cloud.colors[index * 3 + 1] = g;
  cloud.colors[index * 3 + 2] = b;
}

type Rgb = [number, number, number];

// Natural stellar tints, in linear light.
const OLD_RED: Rgb = [1, 0.62, 0.36];
const GOLD: Rgb = [1, 0.78, 0.5];
const WARM_WHITE: Rgb = [1, 0.9, 0.76];
const COOL_WHITE: Rgb = [0.86, 0.91, 1];
const YOUNG_BLUE: Rgb = [0.6, 0.73, 1];
const NEBULA_ROSE: Rgb = [1, 0.34, 0.4];

const mixColor = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Warm giants near the centre give way to mixed disc stars further out. */
function discTint(next: () => number, radius: number): Rgb {
  const old = Math.max(0, 1 - radius / 7.5);
  const pick = next();
  if (pick < old * 0.6) return mixColor(OLD_RED, GOLD, next());
  if (pick < 0.62) return mixColor(GOLD, WARM_WHITE, next());
  return mixColor(WARM_WHITE, COOL_WHITE, next());
}

const CLUSTER_COUNT = 700;

/** Young open clusters sit along the arms, so density varies in clumps. */
function createClusterCentres(next: () => number) {
  return Array.from({ length: CLUSTER_COUNT }, () => {
    const radius = discRadius(next);
    const angle = armAngle(Math.floor(next() * ARM_COUNT), radius) + gaussian(next) * 0.1;
    return { radius, angle };
  });
}

/** Fine decorative stars: bulge, bar, arms, clusters, disc and halo. */
export function createGalaxyStars(count: number): PointCloud {
  const next = random(11);
  const cloud = emptyCloud(count);
  const unit = 1000 * SCENE_UNITS_PER_PARSEC;
  const clusters = createClusterCentres(next);

  for (let index = 0; index < count; index += 1) {
    const kind = next();
    let radius: number;
    let angle: number;
    let height: number;
    let tint: Rgb;
    let brightness = 0.1 + next() ** 3 * 0.75;

    if (kind < 0.24) {
      // Bulge and bar: dense, elongated, and mostly old red and gold giants.
      const spread = 0.3 + next() ** 2 * 1.5;
      const along = gaussian(next) * spread * 1.7;
      const across = gaussian(next) * spread * 0.72;
      radius = Math.hypot(along, across);
      angle = Math.atan2(across, along) + BAR_ANGLE;
      height = gaussian(next) * spread * 0.42;
      tint = mixColor(OLD_RED, GOLD, next());
      brightness *= 0.45;
    } else if (kind < 0.62) {
      radius = discRadius(next);
      const arm = Math.floor(next() * ARM_COUNT);
      angle = armAngle(arm, radius) + gaussian(next) * (0.07 + 0.5 / radius);
      height = gaussian(next) * 0.1;
      tint = next() < 0.55 ? mixColor(COOL_WHITE, YOUNG_BLUE, next()) : discTint(next, radius);
    } else if (kind < 0.72) {
      const centre = clusters[Math.floor(next() * CLUSTER_COUNT)];
      const offset = gaussian(next) * 0.11;
      radius = Math.max(centre.radius + offset, 0.5);
      angle = centre.angle + (gaussian(next) * 0.11) / centre.radius;
      height = gaussian(next) * 0.05;
      tint = mixColor(COOL_WHITE, YOUNG_BLUE, next());
      brightness *= 1.5;
    } else if (kind < 0.98) {
      radius = discRadius(next);
      angle = next() * Math.PI * 2;
      height = gaussian(next) * 0.18;
      tint = discTint(next, radius);
      brightness *= 0.7;
    } else {
      // Halo: sparse, round and old.
      radius = 3 + next() * 15;
      angle = next() * Math.PI * 2;
      height = gaussian(next) * 7;
      tint = mixColor(GOLD, WARM_WHITE, next());
    }

    setPoint(
      cloud,
      index,
      Math.cos(angle) * radius * unit,
      height * unit,
      Math.sin(angle) * radius * unit,
    );
    setColor(cloud, index, tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
    cloud.sizes[index] = 0.5 + next() ** 4 * 1.3;
  }
  return cloud;
}

/** Faint unresolved light along the arms and round the core, plus nebulae. */
export function createGalaxyGlow(count: number): PointCloud {
  const next = random(29);
  const cloud = emptyCloud(count);
  const unit = 1000 * SCENE_UNITS_PER_PARSEC;

  for (let index = 0; index < count; index += 1) {
    const pick = next();
    const inBulge = pick < 0.14;
    const nebula = pick > 0.86;
    const radius = inBulge ? 0.25 + next() ** 2 * 2.6 : discRadius(next);
    const arm = Math.floor(next() * ARM_COUNT);
    const angle = inBulge
      ? next() * Math.PI * 2
      : armAngle(arm, radius) + gaussian(next) * (nebula ? 0.05 : 0.09);

    setPoint(
      cloud,
      index,
      Math.cos(angle) * radius * unit,
      gaussian(next) * (inBulge ? 0.22 : 0.06) * unit,
      Math.sin(angle) * radius * unit,
    );

    const tint = inBulge
      ? GOLD
      : nebula
        ? NEBULA_ROSE
        : mixColor(YOUNG_BLUE, WARM_WHITE, next());
    const light = inBulge ? 0.016 : nebula ? 0.05 : 0.011;
    setColor(cloud, index, tint[0] * light, tint[1] * light, tint[2] * light);
    cloud.sizes[index] = inBulge ? 7 + next() * 7 : nebula ? 1.2 + next() * 2.4 : 3 + next() * 5;
  }
  return cloud;
}

/** Thin dark filaments on the inner edge of each arm, as real dust lanes lie. */
export function createDustLanes(count: number): PointCloud {
  const next = random(47);
  const cloud = emptyCloud(count);
  const unit = 1000 * SCENE_UNITS_PER_PARSEC;

  for (let index = 0; index < count; index += 1) {
    const radius = 1.2 + next() ** 1.3 * 13;
    const arm = Math.floor(next() * ARM_COUNT);
    const lane = next() < 0.72 ? 0.13 : -0.07;
    const angle = armAngle(arm, radius) + lane + gaussian(next) * 0.035;
    setPoint(
      cloud,
      index,
      Math.cos(angle) * radius * unit,
      gaussian(next) * 0.03 * unit,
      Math.sin(angle) * radius * unit,
    );
    setColor(cloud, index, 0.012, 0.007, 0.004);
    cloud.sizes[index] = 2 + next() ** 2 * 5;
  }
  return cloud;
}

/** Far stars on a distant shell, so the sky is full from every angle. */
export function createSkyCloud(count: number, radius = 1100): PointCloud {
  const next = random(23);
  const cloud = emptyCloud(count);

  for (let index = 0; index < count; index += 1) {
    const y = next() * 2 - 1;
    const around = next() * Math.PI * 2;
    const flat = Math.sqrt(1 - y * y);
    const reach = radius * (0.75 + next() * 0.25);
    setPoint(cloud, index, Math.cos(around) * flat * reach, y * reach, Math.sin(around) * flat * reach);
    const tint = next() < 0.5 ? mixColor(COOL_WHITE, YOUNG_BLUE, next()) : mixColor(WARM_WHITE, GOLD, next());
    const brightness = 0.25 + next() ** 2 * 0.6;
    setColor(cloud, index, tint[0] * brightness, tint[1] * brightness, tint[2] * brightness);
    cloud.sizes[index] = 0.5 + next() ** 4 * 1.6;
  }
  return cloud;
}

export interface OrbitInput {
  name: string;
  semiMajorAxisAu: number | null;
  periodDays: number | null;
  eccentricity: number | null;
  argumentOfPeriastronDegrees: number | null;
  radiusEarth: number | null;
}

export type OrbitDistanceSource = "nasa" | "kepler" | "illustrative";
export type SystemViewMode = "enhanced" | "physical";

export interface OrbitLayout {
  semiMajorAxis: number;
  semiMinorAxis: number;
  eccentricity: number;
  /** Rotation of the ellipse in the drawing plane, in radians. */
  periastronAngle: number;
  displayRadius: number;
  /** False when NASA has no radius, so displayRadius is only a stand-in. */
  radiusKnown: boolean;
  meanMotion: number;
  startAnomaly: number;
  distanceSource: OrbitDistanceSource;
  eccentricityKnown: boolean;
  /** False when NASA has no period, so this planet's speed is illustrative. */
  periodKnown: boolean;
  /** True when the distance is measured and the shape known. */
  exact: boolean;
}

export interface SystemLayout {
  orbits: OrbitLayout[];
  /** The same AU-to-scene conversion the orbits use, for anything drawn with them. */
  drawDistance: (au: number) => number;
  starRadius: number;
  extent: number;
}

const AU_PER_SOLAR_RADIUS = 0.00465;
const DISPLAY_EXTENT = 22;
/** Visibility Enhanced spacing: drawn distance = k x au^0.5. */
const ENHANCED_ORBIT_POWER = 0.5;
/** Visibility Enhanced size: Earth-sized planets draw this large... */
const ENHANCED_EARTH_RADIUS = 0.34;
/** ...unless that would make the system's largest planet exceed this. */
const ENHANCED_LARGEST_PLANET = 1.5;
const FALLBACK_STEP = 1.6;
/** The fastest planet in a system takes about nine seconds per orbit at 1x. */
const BASE_ORBIT_SPEED = 0.7;

/**
 * Both views of a system, in the catalog's order. Planet radii always use one
 * factor per view, so their ratios are true in both. Physical Scale also uses
 * that factor for orbits and the star, so everything is literally to scale.
 * Visibility Enhanced compresses orbits with one power law instead, so its
 * distances are not literal. All orbits share one plane because mutual tilt is
 * mostly unknown, and each planet's place along its orbit is arbitrary.
 */
export function systemLayouts(
  planets: OrbitInput[],
  star: { radiusSolar: number | null; massSolar: number | null },
): Record<SystemViewMode, SystemLayout> {
  const resolved = planets.map((planet) => {
    if (planet.semiMajorAxisAu !== null) {
      return { au: planet.semiMajorAxisAu, source: "nasa" as const };
    }
    if (planet.periodDays !== null && star.massSolar !== null) {
      const years = planet.periodDays / 365.25;
      return { au: Math.cbrt(star.massSolar * years * years), source: "kepler" as const };
    }
    return { au: null, source: "illustrative" as const };
  });

  // Planets with nothing to go on follow the outermost known orbit, by order.
  let outermost = Math.max(0, ...resolved.flatMap((entry) => entry.au ?? []));
  const distances = resolved.map((entry) => {
    if (entry.au !== null) return entry.au;
    outermost = outermost ? outermost * FALLBACK_STEP : 0.1;
    return outermost;
  });

  const widest = Math.max(
    ...distances.map((au, index) => au * (1 + (planets[index].eccentricity ?? 0))),
  );
  const periods = planets.map(
    (planet, index) => planet.periodDays ?? 365.25 * distances[index] ** 1.5,
  );
  const shortest = Math.min(...periods);
  const largestRadius = Math.max(1, ...planets.flatMap((p) => p.radiusEarth ?? []));

  const physicalPerAu = DISPLAY_EXTENT / widest;
  const physicalPerEarthRadius = physicalPerAu / EARTH_RADII_PER_AU;
  const enhancedPerRootAu = DISPLAY_EXTENT / widest ** ENHANCED_ORBIT_POWER;
  const enhancedPerEarthRadius = Math.min(
    ENHANCED_EARTH_RADIUS,
    ENHANCED_LARGEST_PLANET / largestRadius,
  );

  const build = (
    drawDistance: (au: number) => number,
    unitsPerEarthRadius: number,
    starRadius: number,
  ): SystemLayout => ({
    drawDistance,
    extent: DISPLAY_EXTENT,
    starRadius,
    orbits: planets.map((planet, index) => {
      const semiMajorAxis = drawDistance(distances[index]);
      const eccentricity = planet.eccentricity ?? 0;
      const degrees = planet.argumentOfPeriastronDegrees;
      return {
        semiMajorAxis,
        semiMinorAxis: semiMajorAxis * Math.sqrt(1 - eccentricity ** 2),
        eccentricity,
        periastronAngle: degrees === null ? 0 : (degrees * Math.PI) / 180,
        // A planet with no radius borrows Earth's, and the panel says so.
        displayRadius: sceneRadius(planet.radiusEarth ?? 1, unitsPerEarthRadius),
        radiusKnown: planet.radiusEarth !== null,
        // Radians per second at 1x. Proportional to 1 / period, so the planets
        // keep their true relative rates at any playback speed.
        meanMotion: BASE_ORBIT_SPEED * (shortest / periods[index]),
        startAnomaly: seedFromName(planet.name) * Math.PI * 2,
        distanceSource: resolved[index].source,
        eccentricityKnown: planet.eccentricity !== null,
        periodKnown: planet.periodDays !== null,
        exact: resolved[index].source === "nasa" && planet.eccentricity !== null,
      };
    }),
  });

  const starSolarRadii = star.radiusSolar ?? 1;
  return {
    physical: build(
      (au) => au * physicalPerAu,
      physicalPerEarthRadius,
      starSolarRadii * EARTH_RADII_PER_SOLAR_RADIUS * physicalPerEarthRadius,
    ),
    enhanced: build(
      (au) => enhancedPerRootAu * au ** ENHANCED_ORBIT_POWER,
      enhancedPerEarthRadius,
      Math.min(
        Math.max(enhancedPerRootAu * (starSolarRadii * AU_PER_SOLAR_RADIUS) ** ENHANCED_ORBIT_POWER, 0.45),
        9,
      ),
    ),
  };
}

/** Kepler's equation, so planets speed up near the star on eccentric orbits. */
export function eccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  const wrapped = meanAnomaly % (Math.PI * 2);
  let estimate = eccentricity > 0.8 ? Math.PI : wrapped;
  for (let step = 0; step < 8; step += 1) {
    estimate -=
      (estimate - eccentricity * Math.sin(estimate) - wrapped) /
      (1 - eccentricity * Math.cos(estimate));
  }
  return estimate;
}
