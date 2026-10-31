import * as THREE from "three";
import type {
  DiscoveredSystem,
  GroundSite,
  Observatory,
  ObservatoryRegion,
} from "@/lib/observatories";

/**
 * The mission map. It is a schematic, deliberately not to scale: real distances
 * run from 500 km to 150 million km, which no single view can hold. Each mission
 * sits in its documented region, at its documented inclination where that is
 * meaningful. Where it sits along its orbit is arbitrary and never live: no
 * ephemeris is used, so nothing here claims to be a current position.
 */
export const EARTH_RADIUS = 10;
export const SKY_RADIUS = 1800;

const LOW_ORBIT = 14;
const HIGH_ORBIT = { semiMajor: 30, eccentricity: 0.55 };
const TESS_ORBIT = { semiMajor: 46, eccentricity: 0.55 };
const L2_DISTANCE = 85;
const L2_HALO = 9;
const SUN_DISTANCE = 1100;
const TRAILING_STEP = 0.1;
const BALLOON_ALTITUDE = 0.9;
const GROUND_ALTITUDE = 0.08;
/** Spaces repeated orbits evenly, without implying a real phase. */
const GOLDEN_ANGLE = 2.39996;

export const SUN_POSITION = new THREE.Vector3(SUN_DISTANCE, 0, 0);
export const L2_POSITION = new THREE.Vector3(-L2_DISTANCE, 0, 0);

export interface Orbit {
  key: string;
  semiMajor: number;
  eccentricity: number;
  inclination: number;
}

export interface PlacedItem {
  id: string;
  name: string;
  short: string;
  status: Observatory["status"] | "ground";
  planets: number;
  position: THREE.Vector3;
  orbit: Orbit | null;
}

function fromLatLon(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    Math.cos(phi) * Math.cos(lambda),
    Math.sin(phi),
    -Math.cos(phi) * Math.sin(lambda),
  ).multiplyScalar(radius);
}

/** A point on an orbit around Earth, whose focus sits at the origin. */
function onOrbit(orbit: Orbit, angle: number) {
  const { semiMajor: a, eccentricity: e } = orbit;
  const radius = (a * (1 - e * e)) / (1 + e * Math.cos(angle));
  return new THREE.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)).applyAxisAngle(
    new THREE.Vector3(1, 0, 0),
    THREE.MathUtils.degToRad(orbit.inclination),
  );
}

export function orbitPoints(orbit: Orbit, count = 128) {
  return Array.from({ length: count }, (_, index) =>
    onOrbit(orbit, (index / count) * Math.PI * 2),
  );
}

function place(region: ObservatoryRegion, id: string, index: number, peers: number) {
  switch (region.kind) {
    case "low":
    case "high":
    case "tess": {
      const shape =
        region.kind === "low"
          ? { semiMajor: LOW_ORBIT + (index % 3) * 0.9, eccentricity: 0 }
          : region.kind === "high"
            ? HIGH_ORBIT
            : TESS_ORBIT;
      const orbit = { key: id, ...shape, inclination: region.inclination };
      return { position: onOrbit(orbit, index * GOLDEN_ANGLE), orbit };
    }
    case "l2": {
      const angle = (index / Math.max(peers, 1)) * Math.PI * 2;
      const position = L2_POSITION.clone().add(
        new THREE.Vector3(0, Math.cos(angle) * L2_HALO, Math.sin(angle) * L2_HALO),
      );
      return { position, orbit: null };
    }
    case "trailing": {
      const angle = region.offset * TRAILING_STEP;
      const position = new THREE.Vector3(
        SUN_DISTANCE - Math.cos(angle) * SUN_DISTANCE,
        0,
        Math.sin(angle) * SUN_DISTANCE,
      );
      return { position, orbit: null };
    }
    case "balloon":
      return {
        position: fromLatLon(region.lat, region.lon, EARTH_RADIUS + BALLOON_ALTITUDE),
        orbit: null,
      };
    default:
      return null;
  }
}

export function layOutObservatories(observatories: Observatory[], ground: GroundSite[]) {
  const placed: PlacedItem[] = [];
  const seen = new Map<string, number>();
  const peers = observatories.filter(({ region }) => region.kind === "l2").length;

  for (const observatory of observatories) {
    const { region } = observatory;
    if ("hostedOn" in region && region.hostedOn) continue;
    const index = seen.get(region.kind) ?? 0;
    seen.set(region.kind, index + 1);
    const spot = place(region, observatory.id, index, peers);
    if (!spot) continue;
    placed.push({
      id: observatory.id,
      name: observatory.name,
      short: observatory.short,
      status: observatory.status,
      planets: observatory.discoveries.planets,
      ...spot,
    });
  }

  // A hosted payload shares its host's place on the map.
  for (const observatory of observatories) {
    const { region } = observatory;
    if (!("hostedOn" in region) || !region.hostedOn) continue;
    const host = placed.find(({ id }) => id === (region as { hostedOn: string }).hostedOn);
    if (!host) continue;
    placed.push({
      id: observatory.id,
      name: observatory.name,
      short: observatory.short,
      status: observatory.status,
      planets: observatory.discoveries.planets,
      position: host.position.clone().add(new THREE.Vector3(0.25, 0.25, 0)),
      orbit: null,
    });
  }

  for (const site of ground) {
    placed.push({
      id: site.id,
      name: site.name,
      short: site.name,
      status: "ground",
      planets: site.discoveries.planets,
      position: fromLatLon(site.lat, site.lon, EARTH_RADIUS + GROUND_ALTITUDE),
      orbit: null,
    });
  }
  return placed;
}

/** A real direction on the sky, from right ascension and declination. */
export function skyDirection(ra: number, dec: number) {
  return fromLatLon(dec, ra, 1);
}

export function skyPoint(system: DiscoveredSystem) {
  return skyDirection(system[3], system[4]).multiplyScalar(SKY_RADIUS);
}

/**
 * The galaxy's real orientation on this sky, so the Milky Way backdrop lines up
 * with the discovered systems: the galactic centre and north galactic pole.
 */
export function galaxyOrientation() {
  const center = skyDirection(266.4, -28.94);
  const pole = skyDirection(192.86, 27.13);
  const third = new THREE.Vector3().crossVectors(center, pole);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(center, pole, third),
  );
}

/** Where a survey looked. Null for an all-sky survey, which has no one direction. */
export function surveyDirection(systems: DiscoveredSystem[]) {
  if (systems.length === 0) return null;
  const sum = new THREE.Vector3();
  for (const system of systems) sum.add(skyDirection(system[3], system[4]));
  sum.divideScalar(systems.length);
  return sum.length() > 0.35 ? sum.normalize() : null;
}
