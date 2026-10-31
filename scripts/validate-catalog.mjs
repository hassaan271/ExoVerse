/**
 * Checks the processed catalog against the raw CSV. Deliberately reads the
 * source itself and shares no logic with build-catalog.mjs beyond CSV parsing,
 * so a builder mistake can't hide. Exits non-zero on any failure.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readNasaCsv } from "./lib/nasaCsv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));

const { records } = readNasaCsv(join(root, "data/raw/nasa_exoplanets.csv"));
const { planets } = load("data/processed/exoplanets.json");
const { systems } = load("data/processed/planetary_systems.json");
const index = load("public/data/catalog-index.json");

const failures = [];
const fail = (message) => {
  if (failures.length < 50) failures.push(message);
  failures.total = (failures.total ?? 0) + 1;
};
const check = (condition, message) => condition || fail(message);

const defaults = records.filter((row) => row.default_flag === "1");
const names = new Set(records.map((row) => row.pl_name));
const byName = new Map(planets.map((planet) => [planet.pl_name, planet]));

check(planets.length === names.size, `planet count ${planets.length} != ${names.size}`);
check(defaults.length === names.size, "default rows do not map one-to-one to planets");
check(new Set(planets.map((p) => p.id)).size === planets.length, "planet ids are not unique");
check(new Set(systems.map((s) => s.id)).size === systems.length, "system ids are not unique");
check(systems.length === new Set(records.map((r) => r.hostname)).size, "system count mismatch");

// Every value in a default row, compared one field at a time.
const FIELDS = [
  ["pl_rade", (p) => p.physical.radius_earth, "physical.radius"],
  ["pl_bmasse", (p) => p.physical.mass_earth, "physical.mass"],
  ["pl_dens", (p) => p.physical.density, "physical.density"],
  ["pl_eqt", (p) => p.climate.equilibrium_temperature_kelvin, "climate.equilibrium_temperature"],
  ["pl_insol", (p) => p.climate.insolation_earth, "climate.insolation"],
  ["pl_orbper", (p) => p.orbit.period_days, "orbit.period"],
  ["pl_orbsmax", (p) => p.orbit.semi_major_axis_au, "orbit.semi_major_axis"],
  ["pl_orbeccen", (p) => p.orbit.eccentricity, "orbit.eccentricity"],
  ["sy_dist", (p) => p.location.distance_parsecs, "location.distance"],
  ["ra", (p) => p.location.ra],
  ["dec", (p) => p.location.dec],
  ["st_teff", (p) => p.host_star.temperature_kelvin, "host_star.temperature"],
  ["st_rad", (p) => p.host_star.radius_solar, "host_star.radius"],
  ["st_mass", (p) => p.host_star.mass_solar, "host_star.mass"],
  ["disc_year", (p) => p.discovery.year],
];

let compared = 0;
let blanksKeptNull = 0;
let gapFillsVerified = 0;
let invented = 0;
const rowById = new Map(records.map((row) => [row.rowid, row]));

for (const row of defaults) {
  const planet = byName.get(row.pl_name);
  if (!planet) {
    fail(`missing planet ${row.pl_name}`);
    continue;
  }
  check(planet.hostname === row.hostname, `host mismatch for ${row.pl_name}`);
  check(planet.discovery.method === row.discoverymethod, `method mismatch for ${row.pl_name}`);
  check(String(planet.provenance.default_rowid) === row.rowid, `rowid mismatch for ${row.pl_name}`);

  for (const [column, read, gapPath] of FIELDS) {
    const value = read(planet);
    if (row[column] !== "") {
      compared += 1;
      check(value === Number(row[column]), `${row.pl_name} ${column}: ${value} != ${row[column]}`);
    } else if (value === null) {
      blanksKeptNull += 1;
    } else {
      const fill = gapPath && planet.provenance.gap_filled[gapPath];
      if (!fill) {
        invented += 1;
        fail(`${row.pl_name} ${column} has ${value} with no source row`);
        continue;
      }
      const donor = rowById.get(String(fill.rowid));
      check(donor?.pl_name === row.pl_name, `${row.pl_name} ${column} filled from another planet`);
      check(Number(donor?.[column]) === value, `${row.pl_name} ${column} fill value differs`);
      gapFillsVerified += 1;
    }
  }

  const parsecs = planet.location.distance_parsecs;
  const lightYears = planet.location.distance_light_years;
  if (parsecs === null) check(lightYears === null, `${row.pl_name} has years without parsecs`);
  else check(Math.abs(lightYears - parsecs * 3.26156) < 0.001, `${row.pl_name} conversion wrong`);
}

for (const system of systems) {
  for (const id of system.planet_ids) {
    const planet = planets.find((candidate) => candidate.id === id);
    check(planet?.system_id === system.id, `${id} is not in system ${system.id}`);
  }
}
const inSystems = systems.reduce((sum, system) => sum + system.planet_ids.length, 0);
check(inSystems === planets.length, `systems hold ${inSystems} of ${planets.length} planets`);
check(index.planets.length === planets.length, "browser index is missing planets");
check(index.systems.length === systems.length, "browser index is missing systems");

const stats = load("data/processed/catalog_stats.json");
check(stats.planets === names.size, "stats planet count mismatch");
check(stats.systems === new Set(records.map((r) => r.hostname)).size, "stats system count mismatch");
const confirmedNames = new Set(
  records.filter((r) => r.soltype === "Published Confirmed").map((r) => r.pl_name),
);
check(stats.confirmed === confirmedNames.size, "stats confirmed mismatch");

// A published limit must never stand in for a measurement.
const LIMIT_COLUMNS = {
  "physical.radius": "pl_radelim", "physical.mass": "pl_bmasselim", "physical.density": "pl_denslim",
  "climate.equilibrium_temperature": "pl_eqtlim", "climate.insolation": "pl_insollim",
  "orbit.period": "pl_orbperlim", "orbit.semi_major_axis": "pl_orbsmaxlim",
  "orbit.eccentricity": "pl_orbeccenlim", "host_star.temperature": "st_tefflim",
  "host_star.radius": "st_radlim", "host_star.mass": "st_masslim", "host_star.luminosity": "st_lumlim",
};
for (const planet of planets) {
  for (const [path, fill] of Object.entries(planet.provenance.gap_filled)) {
    const flag = rowById.get(String(fill.rowid))?.[LIMIT_COLUMNS[path]];
    check(!flag || flag === "0", `${planet.pl_name} ${path} was filled from a limit`);
  }
}

// Observatory counts, recounted from the raw rows.
const observatoryData = load("public/data/observatories.json");
for (const item of [...observatoryData.observatories, ...observatoryData.ground]) {
  const names = item.facilities ?? [item.facility];
  const rows = defaults.filter((row) => names.includes(row.disc_facility));
  check(item.discoveries.planets === rows.length, `${item.id} planet count mismatch`);
  check(
    item.discoveries.systemCount === new Set(rows.map((row) => row.hostname)).size,
    `${item.id} system count mismatch`,
  );
}
const attributed = [...observatoryData.observatories, ...observatoryData.ground]
  .reduce((sum, item) => sum + item.discoveries.planets, 0);
const rest = observatoryData.unattributed.reduce((sum, row) => sum + row.planets, 0);
check(attributed + rest === defaults.length, "observatories and other facilities don't sum to the catalog");

const TARGETS = ["TRAPPIST-1", "Kepler-452", "Proxima Cen", "TOI-789"];
const targets = Object.fromEntries(
  TARGETS.map((host) => {
    const system = systems.find((candidate) => candidate.hostname === host);
    const rows = defaults.filter((row) => row.hostname === host);
    check(system && system.planets.length === rows.length, `target ${host} is incomplete`);
    return [host, system?.planets ?? null];
  }),
);

const incomplete = planets
  .filter((p) => p.physical.radius_earth === null && p.physical.mass_earth === null)
  .slice(0, 5)
  .map((p) => p.pl_name);

const result = {
  passed: !failures.total,
  failures: failures.total ?? 0,
  first_failures: [...failures],
  default_values_compared: compared,
  blanks_kept_null: blanksKeptNull,
  gap_fills_verified_against_source_rows: gapFillsVerified,
  values_with_no_source: invented,
  planets_in_systems: inSystems,
  target_systems: targets,
  example_planets_with_no_size_or_mass: incomplete,
};

const reportPath = join(root, "data/processed/validation_report.json");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
report.validation = result;
writeFileSync(reportPath, JSON.stringify(report, null, 2));

const { column_descriptions, ...summary } = report;
console.log(JSON.stringify({
  ...result,
  sizes_kb: Object.fromEntries(
    ["data/processed/exoplanets.json", "data/processed/planetary_systems.json", "public/data/catalog-index.json"]
      .map((file) => [file, Math.round(statSync(join(root, file)).size / 1024)]),
  ),
  source: summary.source,
  imported: { ...summary.imported, systems_where_catalog_count_differs_from_sy_pnum: summary.imported.systems_where_catalog_count_differs_from_sy_pnum.length },
  missing: summary.missing,
  conversions: summary.conversions,
  outliers_kept: Object.fromEntries(Object.entries(summary.outliers_kept).map(([k, v]) => [k, v.length])),
  problems: summary.problems,
}, null, 2));
process.exit(result.passed ? 0 : 1);
