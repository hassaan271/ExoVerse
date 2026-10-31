/**
 * Turns the NASA Exoplanet Archive CSV into the catalog the app reads.
 *
 *   node scripts/build-catalog.mjs [path/to/source.csv]
 *
 * Rules: one record per planet, taken from the row NASA flags default_flag=1.
 * A value missing from that row may be filled from the newest other publication
 * for the same planet, and is then recorded in `provenance.gap_filled`. Nothing
 * is invented, and a blank stays null. Run again whenever the source changes.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readNasaCsv } from "./lib/nasaCsv.mjs";
import { EARTH_RADII_PER_JUPITER_RADIUS, resolveRadius } from "./lib/radius.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "data/raw/nasa_exoplanets.csv");
const PROCESSED = join(root, "data/processed");
const PUBLIC_DATA = join(root, "public/data");
const LIGHT_YEARS_PER_PARSEC = 3.26156;

const source = process.argv[2];
mkdirSync(dirname(RAW), { recursive: true });
mkdirSync(PROCESSED, { recursive: true });
mkdirSync(PUBLIC_DATA, { recursive: true });
if (source) copyFileSync(source, RAW);
if (!existsSync(RAW)) throw new Error(`No source file at ${RAW}`);

const { columns, records, descriptions, retrieved, malformed } = readNasaCsv(RAW);

// ---- Helpers ----------------------------------------------------------------

const number = (raw) => (raw === "" || raw === undefined ? null : Number(raw));
const text = (raw) => (raw === "" || raw === undefined ? null : raw);
const round = (value, places = 4) =>
  value === null ? null : Number(value.toFixed(places));

const slugify = (name) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  yacute: "ý", ograve: "ò", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  auml: "ä", ouml: "ö", uuml: "ü", ccedil: "ç", egrave: "è", agrave: "à", atilde: "ã",
  otilde: "õ", acirc: "â", ecirc: "ê", ocirc: "ô", oslash: "ø", aring: "å", szlig: "ß",
  scaron: "š", ccaron: "č", zcaron: "ž", Scaron: "Š", Ccaron: "Č", Zcaron: "Ž",
  Aacute: "Á", Eacute: "É", Oacute: "Ó", Ouml: "Ö", Uuml: "Ü", Auml: "Ä",
};
const unknownEntities = new Set();

function decodeEntities(value) {
  return value.replace(/&(#\d+|[a-zA-Z]+);/g, (whole, entity) => {
    if (entity[0] === "#") return String.fromCodePoint(Number(entity.slice(1)));
    if (ENTITIES[entity]) return ENTITIES[entity];
    unknownEntities.add(entity);
    return whole;
  });
}

/** NASA stores references as an <a> tag. Keeps the citation text and its link. */
function reference(raw) {
  if (!raw) return null;
  const url = raw.match(/href=([^\s>]+)/)?.[1] ?? null;
  const label = raw.replace(/<[^>]*>/g, "").trim();
  return { text: decodeEntities(label), url };
}

/** NASA's two-sided uncertainty, kept with its signs. Null when it gives none. */
const uncertainty = (row, upper, lower) => {
  const [high, low] = [number(row[upper]), number(row[lower])];
  return high === null && low === null ? null : { upper: high, lower: low };
};

const limitOf = (raw) =>
  raw === "1" ? "upper" : raw === "-1" ? "lower" : null;

// Groups of columns that must always travel together from a single row.
const GAP_FILL_GROUPS = [
  { path: "physical.radius", columns: ["pl_rade", "pl_radj", "pl_radeerr1", "pl_radeerr2"], limit: "pl_radelim" },
  { path: "physical.mass", columns: ["pl_bmasse", "pl_bmassj", "pl_bmassprov", "pl_bmasseerr1", "pl_bmasseerr2"], limit: "pl_bmasselim" },
  { path: "physical.density", columns: ["pl_dens"], limit: "pl_denslim" },
  { path: "climate.equilibrium_temperature", columns: ["pl_eqt", "pl_eqterr1", "pl_eqterr2"], limit: "pl_eqtlim" },
  { path: "climate.insolation", columns: ["pl_insol", "pl_insolerr1", "pl_insolerr2"], limit: "pl_insollim" },
  { path: "orbit.period", columns: ["pl_orbper"], limit: "pl_orbperlim" },
  { path: "orbit.semi_major_axis", columns: ["pl_orbsmax", "pl_orbsmaxerr1", "pl_orbsmaxerr2"], limit: "pl_orbsmaxlim" },
  { path: "orbit.eccentricity", columns: ["pl_orbeccen", "pl_orbeccenerr1", "pl_orbeccenerr2"], limit: "pl_orbeccenlim" },
  { path: "orbit.inclination", columns: ["pl_orbincl"], limit: "pl_orbincllim" },
  { path: "orbit.argument_of_periastron", columns: ["pl_orblper"], limit: "pl_orblperlim" },
  { path: "host_star.temperature", columns: ["st_teff", "st_tefferr1", "st_tefferr2"], limit: "st_tefflim" },
  { path: "host_star.radius", columns: ["st_rad"], limit: "st_radlim" },
  { path: "host_star.mass", columns: ["st_mass"], limit: "st_masslim" },
  { path: "host_star.metallicity", columns: ["st_met", "st_metratio"], limit: "st_metlim" },
  { path: "host_star.luminosity", columns: ["st_lum", "st_lumerr1", "st_lumerr2"], limit: "st_lumlim" },
  { path: "host_star.age", columns: ["st_age"], limit: "st_agelim" },
  { path: "host_star.spectral_type", columns: ["st_spectype"] },
  { path: "location.distance", columns: ["sy_dist", "sy_disterr1", "sy_disterr2"] },
];

/** Size class is ExoVerse's own label, derived from radius, or mass if no radius. */
function sizeClass(radius, mass) {
  if (radius !== null) {
    if (radius < 1.25) return "Earth-sized";
    if (radius < 2) return "Super-Earth";
    return radius < 6 ? "Neptune-sized" : "Jupiter-sized";
  }
  if (mass !== null) {
    if (mass < 2) return "Earth-sized";
    if (mass < 10) return "Super-Earth";
    return mass < 50 ? "Neptune-sized" : "Jupiter-sized";
  }
  return "Unclassified";
}

// ---- Group rows by planet ----------------------------------------------------

const byPlanet = new Map();
for (const row of records) {
  const group = byPlanet.get(row.pl_name) ?? [];
  group.push(row);
  byPlanet.set(row.pl_name, group);
}

const exactDuplicateGroups = new Map();
for (const row of records) {
  const { rowid, ...rest } = row;
  const key = JSON.stringify(rest);
  exactDuplicateGroups.set(key, [...(exactDuplicateGroups.get(key) ?? []), rowid]);
}
const exactDuplicates = [...exactDuplicateGroups.values()].filter((ids) => ids.length > 1);

const usedIds = new Map();
const problems = { planets_without_default: [], planets_with_several_defaults: [], id_collisions: [] };

const stableId = (name) => {
  const base = slugify(name);
  const seen = usedIds.get(base);
  if (seen && seen !== name) problems.id_collisions.push([seen, name]);
  usedIds.set(base, name);
  return base;
};

// ---- Build planet records ----------------------------------------------------

const planets = [];
const gapFillCounts = {};
const rejectedDonors = [];

/**
 * A blank default axis must not be filled from a row that contradicts the
 * planet's own period, as a misassigned value would. A factor of two leaves room
 * for any real measurement. With no period or star mass there is nothing to test.
 */
function keplerAgrees(row, planet) {
  const days = number(row.pl_orbper) ?? number(planet.pl_orbper);
  const mass = number(row.st_mass) ?? number(planet.st_mass);
  if (days === null || mass === null) return true;
  const expected = Math.cbrt(mass * (days / 365.25) ** 2);
  const ratio = number(row.pl_orbsmax) / expected;
  return ratio > 0.5 && ratio < 2;
}

for (const [name, rows] of byPlanet) {
  const defaults = rows.filter((row) => row.default_flag === "1");
  if (defaults.length === 0) problems.planets_without_default.push(name);
  if (defaults.length > 1) problems.planets_with_several_defaults.push(name);
  const primary = defaults[0] ?? rows[0];

  const alternates = rows
    .filter((row) => row !== primary)
    .sort((a, b) => (b.pl_pubdate ?? "").localeCompare(a.pl_pubdate ?? ""));

  const merged = { ...primary };
  const gapFilled = {};
  const limits = {};

  for (const group of GAP_FILL_GROUPS) {
    const [lead] = group.columns;
    if (primary[lead] !== "") {
      const limit = group.limit ? limitOf(primary[group.limit]) : null;
      if (limit) limits[group.path] = limit;
      continue;
    }
    const donor = alternates.find((row) => {
      if (row[lead] === "" || (group.limit && limitOf(row[group.limit]))) return false;
      if (group.path !== "orbit.semi_major_axis" || keplerAgrees(row, merged)) return true;
      rejectedDonors.push([name, Number(row.rowid), number(row.pl_orbsmax)]);
      return false;
    });
    if (!donor) continue;
    for (const column of group.columns) merged[column] = donor[column];
    gapFilled[group.path] = {
      rowid: Number(donor.rowid),
      publication_date: text(donor.pl_pubdate),
      reference: reference(donor.pl_refname) ?? reference(donor.st_refname) ?? reference(donor.sy_refname),
    };
    gapFillCounts[group.path] = (gapFillCounts[group.path] ?? 0) + 1;
  }

  const { radius, source: radiusSource } = resolveRadius(
    number(merged.pl_rade),
    number(merged.pl_radj),
  );
  const mass = number(merged.pl_bmasse);
  const massProvenance = text(merged.pl_bmassprov);
  const reportedDensity = number(merged.pl_dens);
  // Only a true mass gives a density. Msini is a lower limit, and a published
  // limit on either value would give a limit, not a density.
  const calculatedDensity =
    reportedDensity === null && radius && mass && massProvenance === "Mass" &&
    !limits["physical.mass"] && !limits["physical.radius"]
      ? round((mass / radius ** 3) * 5.513, 3)
      : null;
  const parsecs = number(merged.sy_dist);

  // Blank columns are dropped here only: blank in the raw file means null.
  const original = Object.fromEntries(
    Object.entries(primary).filter(([, value]) => value !== ""),
  );

  planets.push({
    id: stableId(name),
    pl_name: name,
    hostname: primary.hostname,
    system_id: slugify(primary.hostname),
    pl_letter: text(primary.pl_letter),
    size_class: sizeClass(radius, mass),
    physical: {
      radius_earth: radius,
      radius_jupiter: number(merged.pl_radj),
      radius_source: radiusSource,
      mass_earth: mass,
      mass_jupiter: number(merged.pl_bmassj),
      mass_provenance: massProvenance,
      density: reportedDensity,
      density_calculated: calculatedDensity,
    },
    climate: {
      equilibrium_temperature_kelvin: number(merged.pl_eqt),
      insolation_earth: number(merged.pl_insol),
    },
    orbit: {
      period_days: number(merged.pl_orbper),
      semi_major_axis_au: number(merged.pl_orbsmax),
      eccentricity: number(merged.pl_orbeccen),
      inclination_degrees: number(merged.pl_orbincl),
      argument_of_periastron_degrees: number(merged.pl_orblper),
    },
    location: {
      distance_parsecs: parsecs,
      distance_light_years: parsecs === null ? null : round(parsecs * LIGHT_YEARS_PER_PARSEC, 3),
      ra: number(primary.ra),
      dec: number(primary.dec),
      ra_sexagesimal: text(primary.rastr),
      dec_sexagesimal: text(primary.decstr),
      galactic_longitude: number(primary.glon),
      galactic_latitude: number(primary.glat),
    },
    host_star: {
      temperature_kelvin: number(merged.st_teff),
      radius_solar: number(merged.st_rad),
      mass_solar: number(merged.st_mass),
      spectral_type: text(merged.st_spectype),
      metallicity_dex: number(merged.st_met),
      metallicity_ratio: text(merged.st_metratio),
      luminosity_log_solar: number(merged.st_lum),
      age_gyr: number(merged.st_age),
    },
    discovery: {
      method: text(primary.discoverymethod),
      year: number(primary.disc_year),
      facility: text(primary.disc_facility),
      telescope: text(primary.disc_telescope),
      instrument: text(primary.disc_instrument),
      locale: text(primary.disc_locale),
      reference: reference(primary.disc_refname),
    },
    uncertainties: {
      radius_earth: uncertainty(merged, "pl_radeerr1", "pl_radeerr2"),
      mass_earth: uncertainty(merged, "pl_bmasseerr1", "pl_bmasseerr2"),
      equilibrium_temperature: uncertainty(merged, "pl_eqterr1", "pl_eqterr2"),
      insolation: uncertainty(merged, "pl_insolerr1", "pl_insolerr2"),
      semi_major_axis: uncertainty(merged, "pl_orbsmaxerr1", "pl_orbsmaxerr2"),
      eccentricity: uncertainty(merged, "pl_orbeccenerr1", "pl_orbeccenerr2"),
      star_temperature: uncertainty(merged, "st_tefferr1", "st_tefferr2"),
      star_luminosity: uncertainty(merged, "st_lumerr1", "st_lumerr2"),
      distance_parsecs: uncertainty(merged, "sy_disterr1", "sy_disterr2"),
    },
    atmosphere: {
      transmission_spectra: number(primary.pl_ntranspec) ?? 0,
      eclipse_spectra: number(primary.pl_nespec) ?? 0,
      direct_imaging_spectra: number(primary.pl_ndispec) ?? 0,
    },
    status: {
      solution_type: text(primary.soltype),
      // soltype describes one row. A planet is confirmed if any row confirms it.
      confirmed: rows.some((row) => row.soltype === "Published Confirmed"),
      controversial: primary.pl_controv_flag === "1",
      circumbinary: primary.cb_flag === "1",
    },
    system: {
      stars: number(primary.sy_snum),
      planets: number(primary.sy_pnum),
      moons: number(primary.sy_mnum),
    },
    provenance: {
      default_rowid: Number(primary.rowid),
      planet_reference: reference(primary.pl_refname),
      star_reference: reference(primary.st_refname),
      system_reference: reference(primary.sy_refname),
      publication_date: text(primary.pl_pubdate),
      last_update: text(primary.rowupdate),
      release_date: text(primary.releasedate),
      nasa_row_count: rows.length,
      alternate_rowids: alternates.map((row) => Number(row.rowid)),
      limits,
      gap_filled: gapFilled,
    },
    nasa: original,
  });
}

planets.sort((a, b) => a.pl_name.localeCompare(b.pl_name, "en", { numeric: true }));

// ---- Group planets into systems ----------------------------------------------

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const systemGroups = new Map();
for (const planet of planets) {
  const group = systemGroups.get(planet.system_id) ?? [];
  group.push(planet);
  systemGroups.set(planet.system_id, group);
}

const systems = [...systemGroups.entries()].map(([id, members]) => {
  const ordered = [...members].sort(
    (a, b) =>
      (a.orbit.semi_major_axis_au ?? a.orbit.period_days ?? Infinity) -
      (b.orbit.semi_major_axis_au ?? b.orbit.period_days ?? Infinity),
  );
  const pick = (read) => mostCommon(members.map(read));
  const luminosity = pick((planet) => planet.host_star.luminosity_log_solar);
  return {
    id,
    hostname: members[0].hostname,
    planets: ordered.map((planet) => planet.pl_name),
    planet_ids: ordered.map((planet) => planet.id),
    planets_in_catalog: members.length,
    nasa_sy_pnum: pick((planet) => planet.system.planets),
    stars: pick((planet) => planet.system.stars),
    circumbinary: members.some((planet) => planet.status.circumbinary),
    location: {
      distance_parsecs: pick((planet) => planet.location.distance_parsecs),
      distance_light_years: pick((planet) => planet.location.distance_light_years),
      ra: pick((planet) => planet.location.ra),
      dec: pick((planet) => planet.location.dec),
      galactic_longitude: pick((planet) => planet.location.galactic_longitude),
      galactic_latitude: pick((planet) => planet.location.galactic_latitude),
    },
    host_star: {
      temperature_kelvin: pick((planet) => planet.host_star.temperature_kelvin),
      radius_solar: pick((planet) => planet.host_star.radius_solar),
      mass_solar: pick((planet) => planet.host_star.mass_solar),
      spectral_type: pick((planet) => planet.host_star.spectral_type),
      luminosity_log_solar: luminosity,
      luminosity_uncertainty:
        members.find((planet) => planet.host_star.luminosity_log_solar === luminosity)
          ?.uncertainties.star_luminosity ?? null,
    },
  };
});
systems.sort((a, b) => a.hostname.localeCompare(b.hostname, "en", { numeric: true }));

// ---- Report ------------------------------------------------------------------

const count = (test) => planets.filter(test).length;
const blankInDefaultRows = (column) =>
  planets.filter((planet) => planet.nasa[column] === undefined).length;

const outliers = {
  density_over_30_g_cm3: planets
    .filter((planet) => (planet.physical.density ?? 0) > 30)
    .map((planet) => [planet.pl_name, planet.physical.density]),
  radius_over_30_earth: planets
    .filter((planet) => (planet.physical.radius_earth ?? 0) > 30)
    .map((planet) => [planet.pl_name, planet.physical.radius_earth]),
  semi_major_axis_over_1000_au: planets
    .filter((planet) => (planet.orbit.semi_major_axis_au ?? 0) > 1000)
    .map((planet) => [planet.pl_name, planet.orbit.semi_major_axis_au]),
};

const metadata = {
  source: "NASA Exoplanet Archive",
  source_url: "https://exoplanetarchive.ipac.caltech.edu/",
  source_table: "PS (Planetary Systems)",
  source_table_note:
    "The supplied file is the PS table, not PSCompPars. PS holds one row per publication, so each planet here uses its default_flag=1 row, and gaps are filled from other publications with provenance recorded.",
  source_file: "data/raw/nasa_exoplanets.csv",
  retrieved: retrieved,
  source_bytes: statSync(RAW).size,
  total_records_processed: records.length,
  total_records_validated: planets.length,
  records_with_missing_values: count((planet) =>
    [
      planet.physical.radius_earth,
      planet.physical.mass_earth,
      planet.climate.equilibrium_temperature_kelvin,
      planet.orbit.period_days,
      planet.orbit.semi_major_axis_au,
      planet.location.distance_parsecs,
    ].some((value) => value === null),
  ),
  parsec_to_light_year: LIGHT_YEARS_PER_PARSEC,
};

const report = {
  metadata,
  source: {
    columns: columns.length,
    rows: records.length,
    malformed_rows: malformed,
    default_rows: records.filter((row) => row.default_flag === "1").length,
    alternate_rows: records.filter((row) => row.default_flag === "0").length,
    exact_duplicate_row_groups: exactDuplicates.length,
    exact_duplicate_rows_beyond_first: exactDuplicates.reduce((sum, ids) => sum + ids.length - 1, 0),
    exact_duplicate_rowids: exactDuplicates,
  },
  imported: {
    planets: planets.length,
    systems: systems.length,
    single_planet_systems: systems.filter((s) => s.planets_in_catalog === 1).length,
    multi_planet_systems: systems.filter((s) => s.planets_in_catalog > 1).length,
    systems_where_catalog_count_differs_from_sy_pnum: systems
      .filter((s) => s.planets_in_catalog !== s.nasa_sy_pnum)
      .map((s) => [s.hostname, s.planets_in_catalog, s.nasa_sy_pnum]),
    controversial_planets: count((planet) => planet.status.controversial),
    circumbinary_planets: count((planet) => planet.status.circumbinary),
    confirmed_planets: count((planet) => planet.status.confirmed),
    default_row_from_a_candidate_stage_solution: count(
      (planet) => planet.status.solution_type !== "Published Confirmed",
    ),
  },
  missing: {
    blank_in_default_row: {
      radius: blankInDefaultRows("pl_rade"),
      mass: blankInDefaultRows("pl_bmasse"),
      density: blankInDefaultRows("pl_dens"),
      equilibrium_temperature: blankInDefaultRows("pl_eqt"),
      orbital_period: blankInDefaultRows("pl_orbper"),
      semi_major_axis: blankInDefaultRows("pl_orbsmax"),
      eccentricity: blankInDefaultRows("pl_orbeccen"),
      distance: blankInDefaultRows("sy_dist"),
      stellar_temperature: blankInDefaultRows("st_teff"),
    },
    still_null_after_gap_fill: {
      radius: count((p) => p.physical.radius_earth === null),
      mass: count((p) => p.physical.mass_earth === null),
      density_reported_or_calculated: count(
        (p) => p.physical.density === null && p.physical.density_calculated === null,
      ),
      equilibrium_temperature: count((p) => p.climate.equilibrium_temperature_kelvin === null),
      orbital_period: count((p) => p.orbit.period_days === null),
      semi_major_axis: count((p) => p.orbit.semi_major_axis_au === null),
      eccentricity: count((p) => p.orbit.eccentricity === null),
      distance: count((p) => p.location.distance_parsecs === null),
      stellar_temperature: count((p) => p.host_star.temperature_kelvin === null),
      both_radius_and_mass: count(
        (p) => p.physical.radius_earth === null && p.physical.mass_earth === null,
      ),
    },
    values_filled_from_other_publications: gapFillCounts,
  },
  radius_consistency: {
    earth_radii_per_jupiter_radius: EARTH_RADII_PER_JUPITER_RADIUS,
    both_fields: count((p) => p.nasa.pl_rade !== undefined && p.nasa.pl_radj !== undefined),
    only_pl_rade: count((p) => p.nasa.pl_rade !== undefined && p.nasa.pl_radj === undefined),
    only_pl_radj: count((p) => p.nasa.pl_rade === undefined && p.nasa.pl_radj !== undefined),
    largest_relative_gap: Math.max(
      0,
      ...planets
        .filter((p) => p.nasa.pl_rade !== undefined && p.nasa.pl_radj !== undefined)
        .map(
          (p) =>
            Math.abs(Number(p.nasa.pl_rade) - Number(p.nasa.pl_radj) * EARTH_RADII_PER_JUPITER_RADIUS) /
            Number(p.nasa.pl_rade),
        ),
    ),
  },
  conversions: {
    distance_parsecs_to_light_years: count((p) => p.location.distance_light_years !== null),
    density_calculated_from_radius_and_mass: count((p) => p.physical.density_calculated !== null),
  },
  outliers_kept: outliers,
  problems: {
    ...problems,
    unknown_html_entities: [...unknownEntities],
    semi_major_axis_rows_rejected_by_kepler: rejectedDonors,
  },
  column_descriptions: descriptions,
};

// ---- Write -------------------------------------------------------------------

writeFileSync(join(PROCESSED, "exoplanets.json"), JSON.stringify({ metadata, planets }));
writeFileSync(join(PROCESSED, "planetary_systems.json"), JSON.stringify({ metadata, systems }));
writeFileSync(join(PROCESSED, "validation_report.json"), JSON.stringify(report, null, 2));

// Bit order must match METRIC_PATHS in lib/planetSummary.ts.
const METRIC_PATHS = [
  "physical.radius", "physical.mass", "physical.density",
  "climate.equilibrium_temperature", "orbit.period", "orbit.semi_major_axis",
  "orbit.eccentricity", "host_star.temperature", "location.distance",
];
const metricMask = (entries) =>
  METRIC_PATHS.reduce((mask, path, bit) => (entries[path] ? mask | (1 << bit) : mask), 0);

// The browser gets a compact index: flat arrays, only what lists, filters, the
// galaxy and portraits need. Full records stay on the server.
const systemIndex = new Map(systems.map((system, index) => [system.id, index]));
const index = {
  metadata: {
    source: metadata.source,
    source_table: metadata.source_table,
    retrieved,
    planets: planets.length,
    systems: systems.length,
  },
  systems: systems.map((system) => [
    system.id,
    system.hostname,
    system.host_star.temperature_kelvin,
    system.location.distance_light_years,
    system.location.galactic_longitude,
    system.location.galactic_latitude,
    system.host_star.spectral_type,
    system.location.distance_parsecs,
    system.host_star.radius_solar,
    system.host_star.mass_solar,
  ]),
  planets: planets.map((planet) => [
    planet.id,
    planet.pl_name,
    systemIndex.get(planet.system_id),
    planet.physical.radius_earth,
    planet.physical.mass_earth,
    planet.physical.mass_provenance === "Mass" ? 0 : 1,
    planet.physical.density ?? planet.physical.density_calculated,
    planet.climate.equilibrium_temperature_kelvin,
    planet.orbit.period_days,
    planet.orbit.semi_major_axis_au,
    planet.location.distance_light_years,
    planet.discovery.method,
    planet.discovery.year,
    planet.size_class,
    planet.orbit.eccentricity,
    metricMask(planet.provenance.gap_filled),
    metricMask(planet.provenance.limits),
    planet.physical.density === null && planet.physical.density_calculated !== null ? 1 : 0,
    planet.physical.radius_jupiter,
  ]),
};
writeFileSync(join(PUBLIC_DATA, "catalog-index.json"), JSON.stringify(index));

writeFileSync(
  join(PROCESSED, "catalog_stats.json"),
  JSON.stringify({
    planets: planets.length,
    confirmed: count((planet) => planet.status.confirmed),
    systems: systems.length,
    multiPlanetSystems: systems.filter((system) => system.planets_in_catalog > 1).length,
    systemsWithPosition: systems.filter(
      (system) =>
        system.location.distance_parsecs !== null &&
        system.location.galactic_longitude !== null,
    ).length,
    retrieved,
  }),
);

console.log(
  `${records.length} rows -> ${planets.length} planets in ${systems.length} systems.`,
);
