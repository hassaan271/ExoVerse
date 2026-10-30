import type { PlanetSummary, SizeClass } from "@/types/planet";

export interface PlanetFilters {
  query: string;
  sizeClass: SizeClass | "";
  size: string;
  temperature: string;
  distance: string;
  method: string;
}

export const NO_FILTERS: PlanetFilters = {
  query: "",
  sizeClass: "",
  size: "",
  temperature: "",
  distance: "",
  method: "",
};

interface RangeOption {
  value: string;
  label: string;
  min: number;
  max: number;
}

export const SIZE_CLASSES: SizeClass[] = [
  "Earth-sized",
  "Super-Earth",
  "Neptune-sized",
  "Jupiter-sized",
  "Unclassified",
];

export const SIZE_OPTIONS: RangeOption[] = [
  { value: "small", label: "Under 1.6 Earth radii", min: 0, max: 1.6 },
  { value: "medium", label: "1.6 to 6 Earth radii", min: 1.6, max: 6 },
  { value: "large", label: "Over 6 Earth radii", min: 6, max: Infinity },
];

export const TEMPERATURE_OPTIONS: RangeOption[] = [
  { value: "cold", label: "Under 200 K", min: 0, max: 200 },
  { value: "temperate", label: "200 to 320 K", min: 200, max: 320 },
  { value: "warm", label: "320 to 1,000 K", min: 320, max: 1000 },
  { value: "scorching", label: "Over 1,000 K", min: 1000, max: Infinity },
];

export const DISTANCE_OPTIONS: RangeOption[] = [
  { value: "near", label: "Within 50 light-years", min: 0, max: 50 },
  { value: "local", label: "50 to 500 light-years", min: 50, max: 500 },
  { value: "far", label: "500 to 5,000 light-years", min: 500, max: 5000 },
  { value: "distant", label: "Over 5,000 light-years", min: 5000, max: Infinity },
];

export const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "distance", label: "Nearest first" },
  { value: "radius", label: "Largest first" },
  { value: "temperature", label: "Hottest first" },
  { value: "year", label: "Newest first" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

function inRange(value: number | null, options: RangeOption[], selected: string) {
  if (!selected) return true;
  const option = options.find((candidate) => candidate.value === selected);
  if (!option || value === null) return false;
  return value >= option.min && value < option.max;
}

export function hasActiveFilters(filters: PlanetFilters) {
  return Object.values(filters).some(Boolean);
}

// NASA abbreviates constellations, so "Proxima Centauri" is stored "Proxima Cen".
const GENITIVES: Record<string, string> = {
  centauri: "cen",
  ceti: "cet",
  eridani: "eri",
  pegasi: "peg",
  pictoris: "pic",
  cancri: "cnc",
  andromedae: "and",
  draconis: "dra",
  tauri: "tau",
  ursae: "uma",
  virginis: "vir",
  librae: "lib",
  arae: "ara",
  hydrae: "hya",
  geminorum: "gem",
  leonis: "leo",
  aquarii: "aqr",
};

function normalize(query: string) {
  return query
    .trim()
    .toLowerCase()
    .replace(/[a-z]+/g, (word) => GENITIVES[word] ?? word);
}

export function filterPlanets(planets: PlanetSummary[], filters: PlanetFilters) {
  const query = normalize(filters.query);

  return planets.filter(
    (planet) =>
      (!query ||
        planet.name.toLowerCase().includes(query) ||
        planet.hostname.toLowerCase().includes(query)) &&
      (!filters.sizeClass || planet.sizeClass === filters.sizeClass) &&
      inRange(planet.radiusEarth, SIZE_OPTIONS, filters.size) &&
      inRange(planet.temperatureK, TEMPERATURE_OPTIONS, filters.temperature) &&
      inRange(planet.distanceLy, DISTANCE_OPTIONS, filters.distance) &&
      (!filters.method || planet.method === filters.method),
  );
}

const SORT_VALUE: Record<Exclude<SortKey, "name">, (p: PlanetSummary) => number | null> = {
  distance: (p) => p.distanceLy,
  radius: (p) => (p.radiusEarth === null ? null : -p.radiusEarth),
  temperature: (p) => (p.temperatureK === null ? null : -p.temperatureK),
  year: (p) => (p.year === null ? null : -p.year),
};

/** Planets with no value for the sort key go last, never first. */
export function sortPlanets(planets: PlanetSummary[], key: SortKey) {
  if (key === "name") return planets;
  const read = SORT_VALUE[key];
  return [...planets].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left === null) return right === null ? 0 : 1;
    return right === null ? -1 : left - right;
  });
}
