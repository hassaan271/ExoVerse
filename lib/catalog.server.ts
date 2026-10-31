import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HabitabilityPlanet, HabitabilitySystem } from "@/lib/habitability";
import { toPlanetSummary } from "@/lib/planetSummary";
import type {
  CatalogStats,
  PlanetRecord,
  PlanetSummary,
  SystemRecord,
} from "@/types/planet";

/**
 * Server-only access to the full catalog. The 31 MB file is parsed once per
 * server process, then every lookup is a Map read.
 */
const FEATURED_PLANET_IDS = [
  "trappist-1-e",
  "hd-209458-b",
  "proxima-cen-b",
  "55-cnc-e",
  "kepler-16-b",
  "k2-18-b",
  "hr-8799-b",
  "kepler-452-b",
  "wasp-12-b",
  "psr-b1257-12-c",
  "kepler-62-f",
  "toi-789-c",
];

interface Store {
  planets: Map<string, PlanetRecord>;
  systems: Map<string, SystemRecord>;
}

let store: Store | null = null;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data/processed", file), "utf8"));
}

function getStore(): Store {
  if (!store) {
    const { planets } = readJson<{ planets: PlanetRecord[] }>("exoplanets.json");
    const { systems } = readJson<{ systems: SystemRecord[] }>("planetary_systems.json");
    store = {
      planets: new Map(planets.map((planet) => [planet.id, planet])),
      systems: new Map(systems.map((system) => [system.id, system])),
    };
  }
  return store;
}

export function getPlanetRecord(id: string): PlanetRecord | undefined {
  return getStore().planets.get(id);
}

export function getSystemRecord(id: string): SystemRecord | undefined {
  return getStore().systems.get(id);
}

/** A system's planets, innermost first. */
export function getPlanetRecordsInSystem(id: string): PlanetRecord[] {
  const { planets, systems } = getStore();
  return (systems.get(id)?.planet_ids ?? []).flatMap((planetId) => {
    const planet = planets.get(planetId);
    return planet ? [planet] : [];
  });
}

interface HabitabilityStore {
  planets: Map<string, HabitabilityPlanet>;
  systems: Map<string, HabitabilitySystem>;
}

let habitability: HabitabilityStore | null = null;

function getHabitability() {
  if (!habitability) {
    const { planets, systems } = JSON.parse(
      readFileSync(join(process.cwd(), "public/data/habitability.json"), "utf8"),
    ) as { planets: HabitabilityPlanet[]; systems: HabitabilitySystem[] };
    habitability = {
      planets: new Map(planets.map((planet) => [planet.id, planet])),
      systems: new Map(systems.map((system) => [system.id, system])),
    };
  }
  return habitability;
}

export function getPlanetHabitability(id: string) {
  return getHabitability().planets.get(id) ?? null;
}

export function getSystemHabitability(id: string) {
  return getHabitability().systems.get(id) ?? null;
}

export function getAllPlanetHabitability() {
  return [...getHabitability().planets.values()];
}

export function getAllPlanetRecords() {
  return [...getStore().planets.values()];
}

/** Read from the small generated file, so counts never parse the whole catalog. */
export function getCatalogStats(): CatalogStats & { confirmed: number } {
  return readJson("catalog_stats.json");
}

/** The observatory page for a discovery facility, if ExoVerse has one. */
export function getObservatoryId(facility: string | null): string | null {
  if (!facility) return null;
  return readJson<Record<string, string>>("facility_links.json")[facility] ?? null;
}

export function getFeaturedPlanets(): PlanetSummary[] {
  return FEATURED_PLANET_IDS.flatMap((id) => {
    const planet = getPlanetRecord(id);
    return planet ? [toPlanetSummary(planet)] : [];
  });
}
