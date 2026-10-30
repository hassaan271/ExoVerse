/**
 * Audits the coordinates and orbits the 3D views depend on, from the raw CSV.
 *
 *   node scripts/audit-positions.mjs
 *
 * Prints JSON and writes data/processed/position_audit.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readNasaCsv } from "./lib/nasaCsv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { columns, records } = readNasaCsv(join(root, "data/raw/nasa_exoplanets.csv"));
const defaults = records.filter((row) => row.default_flag === "1");
const { systems } = JSON.parse(
  readFileSync(join(root, "data/processed/planetary_systems.json"), "utf8"),
);

const radians = (degrees) => (degrees * Math.PI) / 180;
const degrees = (value) => (value * 180) / Math.PI;

// J2000 equatorial to galactic rotation (Hipparcos and Gaia convention).
const EQUATORIAL_TO_GALACTIC = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

function galacticFromRaDec(ra, dec) {
  const r = radians(ra);
  const d = radians(dec);
  const v = [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
  const [x, y, z] = EQUATORIAL_TO_GALACTIC.map(
    (row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2],
  );
  return { l: (degrees(Math.atan2(y, x)) + 360) % 360, b: degrees(Math.asin(z)) };
}

const separation = (l1, b1, l2, b2) => {
  const a = radians(b1);
  const c = radians(b2);
  const cosine =
    Math.sin(a) * Math.sin(c) + Math.cos(a) * Math.cos(c) * Math.cos(radians(l1 - l2));
  return degrees(Math.acos(Math.min(1, Math.max(-1, cosine))));
};

// 1. Do NASA's ra/dec and glon/glat describe the same directions?
const offsets = defaults.map((row) => {
  const { l, b } = galacticFromRaDec(Number(row.ra), Number(row.dec));
  return { name: row.pl_name, arcsec: separation(l, b, Number(row.glon), Number(row.glat)) * 3600 };
});
offsets.sort((a, b) => b.arcsec - a.arcsec);

// 2. Is sy_dist in parsecs? Parallax in mas gives parsecs as 1000 / parallax.
const parallax = defaults.filter((r) => r.sy_dist && r.sy_plx && Number(r.sy_plx) > 0);
const ratios = parallax.map((r) => Number(r.sy_dist) * (Number(r.sy_plx) / 1000)).sort((a, b) => a - b);

// 3. Does semi-major axis agree with period and stellar mass (Kepler III)?
const kepler = defaults
  .filter((r) => r.pl_orbsmax && r.pl_orbper && r.st_mass)
  .map((r) => {
    const predicted = (Number(r.st_mass) * (Number(r.pl_orbper) / 365.25) ** 2) ** (1 / 3);
    return Number(r.pl_orbsmax) / predicted;
  })
  .sort((a, b) => a - b);

// 4. Hosts: positions shared or conflicting.
const byHost = new Map();
for (const row of defaults) {
  byHost.set(row.hostname, [...(byHost.get(row.hostname) ?? []), row]);
}
const conflicting = [...byHost.entries()].filter(([, rows]) => {
  const distances = new Set(rows.map((r) => r.sy_dist).filter(Boolean));
  const skies = new Set(rows.map((r) => `${r.ra},${r.dec}`));
  return distances.size > 1 || skies.size > 1;
});
const sameSky = new Map();
for (const system of systems) {
  const key = `${system.location.ra?.toFixed(3)},${system.location.dec?.toFixed(3)}`;
  sameSky.set(key, [...(sameSky.get(key) ?? []), system.hostname]);
}

// 5. The app's transform, repeated here from two independent inputs.
const R0 = 8178;
const Z0 = 20.8;
const scene = (l, b, d) => {
  const [cl, sl, cb, sb] = [Math.cos(radians(l)), Math.sin(radians(l)), Math.cos(radians(b)), Math.sin(radians(b))];
  return [d * cb * cl - R0, d * sb + Z0, -d * cb * sl];
};
let largestGapParsecs = 0;
for (const system of systems) {
  const { ra, dec, galactic_longitude: l, galactic_latitude: b, distance_parsecs: d } = system.location;
  if (d === null) continue;
  const viaGalactic = scene(l, b, d);
  const fromEquatorial = galacticFromRaDec(ra, dec);
  const viaEquatorial = scene(fromEquatorial.l, fromEquatorial.b, d);
  largestGapParsecs = Math.max(largestGapParsecs, Math.hypot(
    viaGalactic[0] - viaEquatorial[0], viaGalactic[1] - viaEquatorial[1], viaGalactic[2] - viaEquatorial[2],
  ));
}
const handedness = (() => {
  // Axes (towards centre, rotation, north) must map to a right-handed scene.
  const [x, y, z] = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return cross[0] * z[0] + cross[1] * z[1] + cross[2] * z[2];
})();

const median = (values) => values[Math.floor(values.length / 2)];
const eccentric = defaults.filter((r) => Number(r.pl_orbeccen) > 0.7);

const audit = {
  columns_used: Object.fromEntries(
    ["ra", "dec", "glon", "glat", "sy_dist", "sy_plx", "pl_orbsmax", "pl_orbeccen", "pl_orbper",
      "pl_orblper", "pl_orbincl", "pl_rade", "pl_bmasse", "st_teff", "st_rad", "st_mass", "st_spectype"]
      .map((column) => [column, columns.includes(column)]),
  ),
  default_rows: defaults.length,
  host_stars: byHost.size,
  systems_in_catalog: systems.length,
  sky_coordinates: {
    missing_ra_dec: defaults.filter((r) => !r.ra || !r.dec).length,
    missing_glon_glat: defaults.filter((r) => !r.glon || !r.glat).length,
    ra_range: [Math.min(...defaults.map((r) => +r.ra)), Math.max(...defaults.map((r) => +r.ra))],
    dec_range: [Math.min(...defaults.map((r) => +r.dec)), Math.max(...defaults.map((r) => +r.dec))],
    max_arcsec_between_radec_and_glonglat: Number(offsets[0].arcsec.toFixed(2)),
    median_arcsec: Number(median(offsets.map((o) => o.arcsec).sort((a, b) => a - b)).toFixed(3)),
    disagree_over_60_arcsec: offsets.filter((o) => o.arcsec > 60).length,
  },
  distance: {
    systems_with_distance: systems.filter((s) => s.location.distance_parsecs !== null).length,
    systems_without_distance: systems.filter((s) => s.location.distance_parsecs === null).length,
    range_parsecs: [
      Math.min(...systems.flatMap((s) => s.location.distance_parsecs ?? [])),
      Math.max(...systems.flatMap((s) => s.location.distance_parsecs ?? [])),
    ],
    median_distance_times_parallax_should_be_1: Number(median(ratios).toFixed(4)),
    checked_against_parallax: ratios.length,
  },
  transform: {
    largest_gap_parsecs_between_ra_dec_and_glon_glat_paths: Number(largestGapParsecs.toFixed(4)),
    scene_axes_right_handed: handedness === 1,
    galactic_centre_direction_l0_b0_scene: scene(0, 0, R0),
  },
  hosts: {
    hosts_with_conflicting_position_across_planets: conflicting.length,
    examples: conflicting.slice(0, 5).map(([name]) => name),
    distinct_hostnames_on_same_sky_position: [...sameSky.values()].filter((h) => h.length > 1).length,
  },
  orbits: {
    median_semi_major_axis_over_kepler_prediction: Number(median(kepler).toFixed(3)),
    checked_against_kepler: kepler.length,
    outside_factor_of_2: kepler.filter((k) => k < 0.5 || k > 2).length,
    eccentricity_over_0_7_previously_capped: eccentric.length,
    has_argument_of_periastron: defaults.filter((r) => r.pl_orblper).length,
    has_inclination: defaults.filter((r) => r.pl_orbincl).length,
  },
};

writeFileSync(join(root, "data/processed/position_audit.json"), JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
