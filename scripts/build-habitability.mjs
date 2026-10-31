/**
 * Runs every planet through lib/habitability.ts once, so the site reads results
 * instead of recalculating them. Run after build-catalog.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessPlanet,
  completenessOf,
  HZ_MODEL,
  resolveStar,
  starClass,
  ZONE_ORDER,
} from "../lib/habitability.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const { metadata, planets } = read("data/processed/exoplanets.json");
const { systems } = read("data/processed/planetary_systems.json");
const byId = new Map(planets.map((planet) => [planet.id, planet]));

const emptyCounts = () => Object.fromEntries(ZONE_ORDER.map((zone) => [zone, 0]));
const outPlanets = [];
const outSystems = [];

for (const system of systems) {
  const star = {
    teff: system.host_star.temperature_kelvin,
    logLuminosity: system.host_star.luminosity_log_solar,
    luminosityError: system.host_star.luminosity_uncertainty,
    radiusSolar: system.host_star.radius_solar,
    massSolar: system.host_star.mass_solar,
  };
  const resolved = resolveStar(star);
  const counts = emptyCounts();
  let available = 0;

  for (const id of system.planet_ids) {
    const planet = byId.get(id);
    const { orbit, physical, climate, atmosphere, status, uncertainties, provenance } = planet;
    const assessment = assessPlanet(
      {
        semiMajorAxis: orbit.semi_major_axis_au,
        semiMajorAxisError: uncertainties.semi_major_axis,
        semiMajorAxisIsLimit: Boolean(provenance.limits["orbit.semi_major_axis"]),
        eccentricity: orbit.eccentricity,
        eccentricityError: uncertainties.eccentricity,
        eccentricityLimit: provenance.limits["orbit.eccentricity"] ?? null,
        periodDays: orbit.period_days,
        circumbinary: status.circumbinary,
        insolation: climate.insolation_earth,
      },
      star,
      resolved,
    );
    counts[assessment.zone] += 1;
    const completeness = completenessOf([
      assessment.semiMajorAxis, orbit.eccentricity, climate.insolation_earth,
      climate.equilibrium_temperature_kelvin, physical.radius_earth, physical.mass_earth,
      resolved.teff, resolved.logLuminosity,
    ]);
    available += completeness;
    outPlanets.push({
      id,
      name: planet.pl_name,
      systemId: system.id,
      hostname: system.hostname,
      ...assessment,
      eccentricity: orbit.eccentricity,
      radiusEarth: physical.radius_earth,
      massEarth: physical.mass_earth,
      massIsMinimum: physical.mass_provenance !== "Mass",
      insolation: climate.insolation_earth,
      equilibriumK: climate.equilibrium_temperature_kelvin,
      periodDays: orbit.period_days,
      spectra: {
        transmission: atmosphere.transmission_spectra,
        eclipse: atmosphere.eclipse_spectra,
        directImaging: atmosphere.direct_imaging_spectra,
      },
      completeness,
      defaultSolutionConfirmed: status.solution_type === "Published Confirmed",
      controversial: status.controversial,
    });
  }

  outSystems.push({
    id: system.id,
    hostname: system.hostname,
    teff: resolved.teff,
    logLuminosity: resolved.logLuminosity,
    luminositySource: resolved.luminositySource,
    starClass: starClass(resolved.teff),
    zone: resolved.zone,
    indicative: resolved.indicative,
    circumbinary: system.circumbinary,
    planets: system.planet_ids.length,
    candidates: system.planet_ids.filter((id) => !byId.get(id).status.confirmed).length,
    counts,
    completeness: available / (system.planet_ids.length * 8),
    planetIds: system.planet_ids,
  });
}

const totals = emptyCounts();
for (const planet of outPlanets) totals[planet.zone] += 1;

const assessed = outSystems.filter((s) => s.counts.insufficient < s.planets).length;
const summary = {
  model: HZ_MODEL,
  source: {
    table: metadata.source_table,
    retrieved: metadata.retrieved,
    rows: metadata.total_records_processed,
  },
  totals,
  systems: outSystems.length,
  systemsWithAnyAssessment: assessed,
  luminosity: {
    nasa: outSystems.filter((s) => s.luminositySource === "nasa").length,
    derived: outSystems.filter((s) => s.luminositySource === "derived").length,
    none: outSystems.filter((s) => s.luminositySource === null).length,
  },
};

writeFileSync(
  join(root, "public/data/habitability.json"),
  // Six figures is beyond any input's precision, and keeps the file small.
  JSON.stringify({ summary, systems: outSystems, planets: outPlanets }, (_, value) =>
    typeof value === "number" && !Number.isInteger(value) ? Number(value.toPrecision(6)) : value,
  ),
);
console.log(JSON.stringify(summary));
