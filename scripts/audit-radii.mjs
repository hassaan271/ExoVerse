/** Audits NASA radius fields: node scripts/audit-radii.mjs */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readNasaCsv } from "./lib/nasaCsv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { records } = readNasaCsv(join(root, "data/raw/nasa_exoplanets.csv"));
const JUPITER = 11.209;
const defaults = records.filter((row) => row.default_flag === "1");

const both = defaults.filter((r) => r.pl_rade && r.pl_radj);
const off = both
  .map((r) => ({
    name: r.pl_name,
    gap: Math.abs(Number(r.pl_rade) - Number(r.pl_radj) * JUPITER) / Number(r.pl_rade),
  }))
  .sort((a, b) => b.gap - a.gap);
const radii = defaults.flatMap((r) => (r.pl_rade ? Number(r.pl_rade) : [])).sort((a, b) => a - b);
const pick = (q) => radii[Math.floor(radii.length * q)];

console.log(JSON.stringify({
  default_rows: defaults.length,
  both_fields: both.length,
  only_pl_rade: defaults.filter((r) => r.pl_rade && !r.pl_radj).length,
  only_pl_radj: defaults.filter((r) => !r.pl_rade && r.pl_radj).length,
  neither: defaults.filter((r) => !r.pl_rade && !r.pl_radj).length,
  largest_relative_gap_rade_vs_radj: Number(off[0].gap.toFixed(4)),
  worst: off.slice(0, 3).map((o) => [o.name, Number(o.gap.toFixed(4))]),
  over_1_percent: off.filter((o) => o.gap > 0.01).length,
  upper_or_lower_limit_radii: defaults.filter((r) => r.pl_radelim && r.pl_radelim !== "0").length,
  with_uncertainty: defaults.filter((r) => r.pl_radeerr1).length,
  percentiles_earth_radii: { min: radii[0], p10: pick(0.1), median: pick(0.5), p90: pick(0.9), max: radii.at(-1) },
  any_row_only_radj: records.filter((r) => !r.pl_rade && r.pl_radj).length,
}, null, 2));
