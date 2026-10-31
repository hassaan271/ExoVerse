/**
 * Joins the observatory directory to the catalog. A planet belongs to an
 * observatory only when its disc_facility names it: nothing is inferred from
 * follow-up observations, and planets credited to "Multiple Observatories" stay
 * unattributed. Run after build-catalog.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUND_SITES, OBSERVATORIES } from "../data/observatories/directory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { planets } = JSON.parse(readFileSync(join(root, "data/processed/exoplanets.json"), "utf8"));

const byFacility = new Map();
for (const planet of planets) {
  const { facility } = planet.discovery;
  if (!byFacility.has(facility)) byFacility.set(facility, []);
  byFacility.get(facility).push(planet);
}

function discoveries(facilities) {
  const found = facilities.flatMap((name) => {
    if (!byFacility.has(name)) throw new Error(`No planets for facility: ${name}`);
    return byFacility.get(name);
  });
  const systems = new Map();
  const methods = {};
  const years = [];
  for (const planet of found) {
    const { ra, dec } = planet.location;
    const system = systems.get(planet.system_id) ?? {
      id: planet.system_id, hostname: planet.hostname, planets: 0, ra, dec,
    };
    system.planets += 1;
    systems.set(planet.system_id, system);
    methods[planet.discovery.method] = (methods[planet.discovery.method] ?? 0) + 1;
    if (planet.discovery.year) years.push(planet.discovery.year);
  }
  return {
    planets: found.length,
    systemCount: systems.size,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    methods,
    // Flat rows: Kepler alone has thousands of systems.
    systems: [...systems.values()]
      .sort((a, b) => b.planets - a.planets || a.hostname.localeCompare(b.hostname))
      .map((s) => [s.id, s.hostname, s.planets, s.ra, s.dec]),
  };
}

const claimed = new Set();
const claim = (facility, id) => {
  if (claimed.has(facility)) throw new Error(`${facility} is claimed twice (${id})`);
  claimed.add(facility);
};

const observatories = OBSERVATORIES.map((observatory) => {
  observatory.facilities.forEach((facility) => claim(facility, observatory.id));
  return { ...observatory, discoveries: discoveries(observatory.facilities) };
});
const ground = GROUND_SITES.map((site) => {
  claim(site.facility, site.id);
  return { ...site, discoveries: discoveries([site.facility]) };
});

const unattributed = [...byFacility.entries()]
  .filter(([facility]) => !claimed.has(facility))
  .map(([facility, list]) => ({ facility, planets: list.length }))
  .sort((a, b) => b.planets - a.planets);

const facilityLinks = Object.fromEntries(
  observatories.flatMap((o) => o.facilities.map((facility) => [facility, o.id])),
);
for (const site of ground) facilityLinks[site.facility] = site.id;

writeFileSync(
  join(root, "public/data/observatories.json"),
  JSON.stringify({ observatories, ground, unattributed, totalPlanets: planets.length }),
);
writeFileSync(join(root, "data/processed/facility_links.json"), JSON.stringify(facilityLinks));

console.log(
  `${observatories.length} observatories, ${ground.length} ground sites, ` +
    `${planets.length - unattributed.reduce((sum, row) => sum + row.planets, 0)} planets attributed, ` +
    `${unattributed.length} other facilities.`,
);
