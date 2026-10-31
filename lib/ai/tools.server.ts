import "server-only";

import {
  getAllPlanetHabitability,
  getAllPlanetRecords,
  getPlanetHabitability,
  getPlanetRecord,
  getPlanetRecordsInSystem,
  getSystemHabitability,
  getSystemRecord,
} from "@/lib/catalog.server";
import { comparePlanets } from "@/lib/compare";
import { explain, HZ_MODEL, indicators, REASON_TEXT, ZONE_LABEL } from "@/lib/habitability";
import { planetFactGroups } from "@/lib/planetFacts";
import { toPlanetSummary } from "@/lib/planetSummary";
import { EARTH, JUPITER } from "@/lib/referenceBodies";
import type { PlanetRecord, PlanetSummary } from "@/types/planet";
import {
  ACTION_NAMES,
  type CatalogLookup,
  isActionName,
  SECTIONS,
  validateAction,
} from "./actions";
import type { Reference, ToolDefinition, ToolOutcome, ToolRegistry } from "./agent";

const MAX_RESULTS = 12;
const LIMITS_NOTE = "These results cover ExoVerse's copy of the NASA Exoplanet Archive only, not every planet known or existing.";
const HABITABILITY_LIMITS = `Screening of orbit and starlight using ${HZ_MODEL.citation}. It does not show liquid water, an atmosphere, life or actual habitability.`;

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** People write star names in full. The catalog uses standard abbreviations. */
const CONSTELLATIONS: [RegExp, string][] = [
  [/centauri/g, "cen"], [/pegasi/g, "peg"], [/cancri/g, "cnc"], [/eridani/g, "eri"],
  [/cygni/g, "cyg"], [/ceti/g, "cet"], [/andromedae/g, "and"], [/ursaemajoris/g, "uma"],
  [/ursaeminoris/g, "umi"], [/geminorum/g, "gem"], [/herculis/g, "her"], [/virginis/g, "vir"],
  [/draconis/g, "dra"], [/piscium/g, "psc"], [/pictoris/g, "pic"], [/orionis/g, "ori"],
];

const abbreviate = (query: string) =>
  CONSTELLATIONS.reduce((text, [name, short]) => text.replace(name, short), query);

const planetRef = (planet: { pl_name: string; id: string }): Reference => ({
  name: planet.pl_name,
  path: `/planets/${planet.id}`,
});

const systemRef = (id: string, hostname: string): Reference => ({
  name: hostname,
  path: `/explore/systems/${id}`,
});

/** Exact planet names in a message, so the model needn't spend a round searching. */
export function mentionedPlanets(text: string) {
  const words = abbreviate(normalize(text));
  return getAllPlanetRecords()
    .filter((planet) => {
      const name = normalize(planet.pl_name);
      return name.length >= 5 && words.includes(name);
    })
    .slice(0, 4)
    .map(({ pl_name }) => pl_name);
}

function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/** The model sometimes passes a name or a slightly wrong id, so both resolve. */
function findPlanet(value: unknown) {
  const direct = getPlanetRecord(String(value));
  if (direct) return direct;
  const wanted = abbreviate(normalize(String(value)));
  const matches = getAllPlanetRecords().filter((planet) => normalize(planet.pl_name) === wanted);
  return matches.length === 1 ? matches[0] : undefined;
}

const brief = (planet: PlanetRecord) => ({
  planet_id: planet.id,
  name: planet.pl_name,
  host_star: planet.hostname,
  system_id: planet.system_id,
  confirmed: planet.status.confirmed,
  default_values_from_candidate_stage: planet.status.solution_type !== "Published Confirmed",
  controversial: planet.status.controversial,
});

function searchExoplanet(args: Record<string, unknown>): ToolOutcome {
  const query = abbreviate(normalize(String(args.query)));
  const host = args.host_star ? normalize(String(args.host_star)) : null;
  const status = args.status as string | undefined;
  if (status === "candidate") {
    return { result: { matches: [], total: 0, note: "This dataset holds confirmed planets only, so there are no candidates to return." } };
  }
  if (query === "earth" || query === "jupiter") {
    const body = query === "earth" ? EARTH : JUPITER;
    return { result: { matches: [{ planet_id: body.id, name: body.name, host_star: "Sun", reference_body: true }], total: 1, ambiguous: false, note: "A Solar System reference body, not a catalog exoplanet. Usable in comparisons only." } };
  }

  const pool = getAllPlanetRecords().filter((planet) => !host || normalize(planet.hostname).includes(host));
  const exact = pool.filter((planet) => normalize(planet.pl_name) === query);
  const partial = exact.length > 0 ? exact : pool.filter((planet) =>
    normalize(planet.pl_name).includes(query) || normalize(planet.hostname) === query,
  );
  let matches = partial;
  let approximate = false;
  if (matches.length === 0 && query.length >= 4) {
    matches = pool.filter((planet) => editDistance(normalize(planet.pl_name), query) <= 2);
    approximate = matches.length > 0;
  }
  const ambiguous = matches.length > 1 || approximate;
  return {
    references: matches.slice(0, MAX_RESULTS).map(planetRef),
    result: {
      total: matches.length,
      ambiguous,
      approximate_spelling_match: approximate,
      matches: matches.slice(0, MAX_RESULTS).map(brief),
      note: matches.length === 0
        ? "No planet with that name is in this dataset. Don't guess one."
        : ambiguous
          ? "More than one possibility, or an inexact spelling. Ask the user which they mean instead of choosing."
          : undefined,
    },
  };
}

function details(id: string): ToolOutcome {
  const planet = findPlanet(id);
  if (!planet) return { result: { error: "No planet has that id. Use search_exoplanet first." } };
  const habitability = getPlanetHabitability(planet.id);
  return {
    references: [planetRef(planet), systemRef(planet.system_id, planet.hostname)],
    result: {
      ...brief(planet),
      size_class: `${planet.size_class} (ExoVerse's label, derived from radius, or mass if no radius)`,
      sections: planetFactGroups(planet).map((group) => ({
        title: group.title,
        facts: group.facts.map(({ label, value, origin }) => ({ label, value, origin })),
      })),
      published_limits: planet.provenance.limits,
      uncertainties: planet.uncertainties,
      habitable_zone: habitability ? ZONE_LABEL[habitability.zone] : null,
      published_spectra: planet.atmosphere,
      notes: [
        "origin: nasa is the default row, other-publication is another published row for this planet, calculated is an ExoVerse calculation.",
        "Equilibrium temperature is an estimate, not a surface temperature. Distance is to the host system.",
      ],
    },
  };
}

function system(id: string): ToolOutcome {
  const record = getSystemRecord(id);
  if (!record) return { result: { error: "No system has that id. Use search_exoplanet first." } };
  const planets = getPlanetRecordsInSystem(id);
  const habitability = getSystemHabitability(id);
  return {
    references: [systemRef(id, record.hostname), ...planets.map(planetRef)],
    result: {
      system_id: id,
      host_star: record.hostname,
      star: { ...record.host_star, luminosity_is_log10_solar: true },
      distance_parsecs: record.location.distance_parsecs,
      distance_light_years: record.location.distance_light_years,
      circumbinary: record.circumbinary,
      nasa_planet_count: record.nasa_sy_pnum,
      confirmed_planets: planets.map((planet) => ({
        planet_id: planet.id,
        name: planet.pl_name,
        size_class: planet.size_class,
        radius_earth: planet.physical.radius_earth,
        period_days: planet.orbit.period_days,
        semi_major_axis_au: planet.orbit.semi_major_axis_au,
        eccentricity: planet.orbit.eccentricity,
        habitable_zone: getPlanetHabitability(planet.id)?.zone ?? null,
      })),
      candidate_planets: [],
      candidate_note: "This dataset holds confirmed planets only.",
      data_completeness: habitability ? `${Math.round(habitability.completeness * 100)}% of habitability inputs available` : null,
    },
  };
}

function summaryFor(id: string): PlanetSummary | null {
  if (id === EARTH.id) return EARTH;
  if (id === JUPITER.id) return JUPITER;
  const planet = findPlanet(id);
  return planet ? toPlanetSummary(planet) : null;
}

const fluxOf = (planet: PlanetSummary) =>
  planet.id === EARTH.id ? 1 : (getPlanetRecord(planet.id)?.climate.insolation_earth ?? null);

function compare(args: Record<string, unknown>): ToolOutcome {
  const ids = args.planet_ids as string[];
  const bodies = ids.map(summaryFor);
  const missing = ids.filter((_, index) => !bodies[index]);
  if (missing.length > 0) return { result: { error: `Not in the catalog: ${missing.join(", ")}.` } };
  if (bodies.length < 2) return { result: { error: "Give at least two planets." } };
  const [first, ...others] = bodies as PlanetSummary[];
  const zone = (planet: PlanetSummary) =>
    planet.referenceBody ? "Not assessed: Solar System reference" : ZONE_LABEL[getPlanetHabitability(planet.id)?.zone ?? "insufficient"];
  return {
    references: (bodies as PlanetSummary[]).flatMap((planet) =>
      planet.referenceBody ? [] : [planetRef({ pl_name: planet.name, id: planet.id })],
    ),
    result: {
      comparisons: others.slice(0, 3).map((other) => ({
        planets: [first.name, other.name],
        rows: comparePlanets(first, other).map((row) => ({
          parameter: row.label,
          [first.name]: row.a.text,
          [other.name]: row.b.text,
          ratio: row.a.value !== null && row.b.value && !row.a.bound && !row.b.bound
            ? Number((row.a.value / row.b.value).toPrecision(4))
            : null,
          difference: row.difference?.sentence ?? row.reason,
        })),
        stellar_flux_relative_to_earth: {
          [first.name]: fluxOf(first),
          [other.name]: fluxOf(other),
          ratio: fluxOf(first) !== null && fluxOf(other)
            ? Number(((fluxOf(first) as number) / (fluxOf(other) as number)).toPrecision(4))
            : null,
          note: "How much starlight each receives. Null means it isn't available.",
        },
        habitable_zone: { [first.name]: zone(first), [other.name]: zone(other) },
      })),
      note: "Values use shared units, calculated by ExoVerse from catalog values. Earth and Jupiter are NASA fact-sheet references.",
    },
  };
}

function habitability(args: Record<string, unknown>): ToolOutcome {
  if (args.planet_id) {
    const record = findPlanet(args.planet_id);
    const planet = record ? getPlanetHabitability(record.id) : null;
    if (!planet) return { result: { error: "No planet has that id. Use search_exoplanet first." } };
    const star = getSystemHabitability(planet.systemId);
    return {
      references: [{ name: planet.name, path: `/planets/${planet.id}` }],
      result: {
        planet: planet.name,
        planet_id: planet.id,
        classification: ZONE_LABEL[planet.zone],
        position_from_semi_major_axis_alone: planet.nominalZone ? ZONE_LABEL[planet.nominalZone] : null,
        reasons: planet.reasons.map((reason) => REASON_TEXT[reason]),
        boundaries_au: star?.zone ?? null,
        boundaries_indicative_only: star?.indicative ?? false,
        semi_major_axis_au: planet.semiMajorAxis,
        semi_major_axis_source: planet.semiMajorAxisSource,
        periastron_au: planet.periastron,
        apastron_au: planet.apastron,
        eccentricity: planet.eccentricity,
        stellar_flux_earth: planet.insolation,
        equilibrium_temperature_kelvin: planet.equilibriumK,
        inputs_available: `${planet.completeness} of 8`,
        indicators: indicators(planet).map(({ label, status, value }) => ({ label, status, value })),
        summary: explain(planet, star ?? undefined),
        limitations: HABITABILITY_LIMITS,
      },
    };
  }
  const star = args.system_id ? getSystemHabitability(String(args.system_id)) : null;
  if (!star) return { result: { error: "Give a valid planet_id or system_id." } };
  return {
    references: [systemRef(star.id, star.hostname)],
    result: {
      system: star.hostname,
      counts: star.counts,
      boundaries_au: star.zone,
      boundaries_indicative_only: star.indicative,
      star_temperature_kelvin: star.teff,
      log10_luminosity_solar: star.logLuminosity,
      luminosity_source: star.luminositySource,
      data_completeness: `${Math.round(star.completeness * 100)}%`,
      limitations: HABITABILITY_LIMITS,
    },
  };
}

const SORTS = {
  radius: (planet: PlanetRecord) => planet.provenance.limits["physical.radius"] ? null : planet.physical.radius_earth,
  mass: (planet: PlanetRecord) => planet.provenance.limits["physical.mass"] || planet.physical.mass_provenance !== "Mass" ? null : planet.physical.mass_earth,
  distance: (planet: PlanetRecord) => planet.location.distance_light_years,
  orbital_period: (planet: PlanetRecord) => planet.provenance.limits["orbit.period"] ? null : planet.orbit.period_days,
  equilibrium_temperature: (planet: PlanetRecord) => planet.provenance.limits["climate.equilibrium_temperature"] ? null : planet.climate.equilibrium_temperature_kelvin,
  stellar_flux: (planet: PlanetRecord) => planet.climate.insolation_earth,
  discovery_year: (planet: PlanetRecord) => planet.discovery.year,
};

function findPlanets(args: Record<string, unknown>): ToolOutcome {
  const sortBy = args.sort_by as keyof typeof SORTS;
  const direction = args.order === "descending" ? -1 : 1;
  const limit = Math.min(Number(args.limit ?? 5), MAX_RESULTS);
  const zones = args.habitable_zones as string[] | undefined;
  const zoneOf = new Map(getAllPlanetHabitability().map((planet) => [planet.id, planet.zone]));
  const read = SORTS[sortBy];
  const number = (key: string) => (typeof args[key] === "number" ? (args[key] as number) : null);

  const planets = getAllPlanetRecords().filter((planet) => {
    if (read(planet) === null) return false;
    if (zones && !zones.includes(zoneOf.get(planet.id) as string)) return false;
    const spectra = planet.atmosphere;
    if (args.has_published_spectra === true && spectra.transmission_spectra + spectra.eclipse_spectra + spectra.direct_imaging_spectra === 0) return false;
    if (args.exclude_controversial === true && planet.status.controversial) return false;
    const radius = planet.physical.radius_earth;
    const minimum = number("min_radius_earth");
    const maximum = number("max_radius_earth");
    if ((minimum !== null || maximum !== null) && radius === null) return false;
    if (minimum !== null && (radius as number) < minimum) return false;
    if (maximum !== null && (radius as number) > maximum) return false;
    const limitLy = number("max_distance_light_years");
    return limitLy === null || (planet.location.distance_light_years ?? Infinity) <= limitLy;
  });

  const inZones = zones
    ? getAllPlanetHabitability().filter((planet) => zones.includes(planet.zone)).length
    : null;
  const sorted = planets.sort((a, b) => direction * ((read(a) as number) - (read(b) as number)));
  const top = sorted.slice(0, limit);
  return {
    references: top.map(planetRef),
    result: {
      criteria: { ...args, excluded: `Planets with no value for ${sortBy}, or only a published limit, are left out.` },
      total_matching_and_ranked: planets.length,
      total_in_requested_zones: inZones,
      left_out_for_no_value: inZones === null ? undefined : inZones - planets.length,
      results: top.map((planet) => ({
        ...brief(planet),
        [sortBy]: read(planet),
        radius_earth: planet.physical.radius_earth,
        distance_light_years: planet.location.distance_light_years,
        habitable_zone: zoneOf.get(planet.id) ?? null,
      })),
      note: LIMITS_NOTE,
    },
  };
}

const ID_FIELD = { type: "string", description: "An id from search_exoplanet.", maxLength: 121 } as const;

const DATA_TOOLS: ToolDefinition[] = [
  {
    name: "search_exoplanet",
    description: "Find planets by full or partial name, or list a host star's planets. Always use this to get an id for a named planet.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Planet or host-star name.", maxLength: 80 },
        host_star: { type: "string", maxLength: 80 },
        status: { type: "string", enum: ["confirmed", "candidate"] },
      },
      required: ["query"],
    },
  },
  { name: "get_planet_details", description: "All catalog values for one planet, with units, sources and missing values.", parameters: { type: "object", properties: { planet_id: ID_FIELD }, required: ["planet_id"] } },
  { name: "get_planetary_system", description: "A host star and all its planets.", parameters: { type: "object", properties: { system_id: ID_FIELD }, required: ["system_id"] } },
  {
    name: "compare_planets",
    description: "Compare the first planet with up to three others. Accepts catalog ids plus earth and jupiter.",
    parameters: { type: "object", properties: { planet_ids: { type: "array", items: { type: "string" } } }, required: ["planet_ids"] },
  },
  {
    name: "get_habitability_analysis",
    description: "ExoVerse's existing habitable-zone results for a planet or a system.",
    parameters: { type: "object", properties: { planet_id: ID_FIELD, system_id: ID_FIELD } },
  },
  {
    name: "find_planets_by_criteria",
    description: "Rank planets in the dataset by one field, with optional filters. Use for largest, closest, shortest orbit, and similar questions.",
    parameters: {
      type: "object",
      properties: {
        sort_by: { type: "string", enum: Object.keys(SORTS) },
        order: { type: "string", enum: ["ascending", "descending"] },
        limit: { type: "number", minimum: 1, maximum: MAX_RESULTS },
        habitable_zones: { type: "array", items: { type: "string", enum: ["conservative", "optimistic", "uncertain", "outside", "insufficient"] } },
        has_published_spectra: { type: "boolean" },
        exclude_controversial: { type: "boolean" },
        min_radius_earth: { type: "number" },
        max_radius_earth: { type: "number" },
        max_distance_light_years: { type: "number" },
      },
      required: ["sort_by", "order"],
    },
  },
];

const ACTION_TOOLS: ToolDefinition[] = [
  { name: "open_planet_in_3d", description: "Open a planet's own 3D view.", parameters: { type: "object", properties: { planet_id: ID_FIELD }, required: ["planet_id"] } },
  { name: "highlight_planet", description: "Select and highlight a planet inside its 3D planetary system.", parameters: { type: "object", properties: { planet_id: ID_FIELD }, required: ["planet_id"] } },
  { name: "show_planetary_system", description: "Open a host star's 3D planetary system view.", parameters: { type: "object", properties: { system_id: ID_FIELD }, required: ["system_id"] } },
  { name: "zoom_to_system", description: "Pull the camera back to show a whole planetary system.", parameters: { type: "object", properties: { system_id: ID_FIELD }, required: ["system_id"] } },
  { name: "navigate_to_explorer", description: "Go to a section of ExoVerse.", parameters: { type: "object", properties: { section: { type: "string", enum: SECTIONS } }, required: ["section"] } },
  { name: "open_comparison", description: "Open the Compare page for exactly two planets. Accepts earth and jupiter.", parameters: { type: "object", properties: { planet_ids: { type: "array", items: { type: "string" } } }, required: ["planet_ids"] } },
  { name: "open_habitability_view", description: "Open the Habitability Explorer on a planet or system.", parameters: { type: "object", properties: { planet_id: ID_FIELD, system_id: ID_FIELD } } },
];

export const catalogLookup: CatalogLookup = {
  planet(id) {
    const planet = getPlanetRecord(id);
    return planet ? { name: planet.pl_name, systemId: planet.system_id, hostname: planet.hostname } : null;
  },
  system(id) {
    const record = getSystemRecord(id);
    return record ? { hostname: record.hostname } : null;
  },
  reference(id) {
    return id === EARTH.id ? EARTH : id === JUPITER.id ? JUPITER : null;
  },
};

export const astronomerTools: ToolRegistry = {
  definitions: [...DATA_TOOLS, ...ACTION_TOOLS],
  isAction: isActionName,
  status(name) {
    if ((ACTION_NAMES as readonly string[]).includes(name)) return "Preparing your planetary view...";
    if (name === "compare_planets") return "Comparing planets...";
    if (name === "get_habitability_analysis") return "Checking the habitability analysis...";
    return "Searching the ExoVerse planetary database...";
  },
  run(name, args) {
    switch (name) {
      case "search_exoplanet": return searchExoplanet(args);
      case "get_planet_details": return details(String(args.planet_id));
      case "get_planetary_system": return system(String(args.system_id));
      case "compare_planets": return compare(args);
      case "get_habitability_analysis": return habitability(args);
      case "find_planets_by_criteria": return findPlanets(args);
      default: throw new Error("Unknown tool");
    }
  },
  action: (name, args) => validateAction(name, args, catalogLookup),
};
