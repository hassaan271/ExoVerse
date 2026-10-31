import { formatValue, UNKNOWN } from "@/lib/format";
import { radiusFromMass } from "@/lib/planetScale";
import { hasMetricBit, type MetricPath } from "@/lib/planetSummary";
import type { PlanetSummary } from "@/types/planet";

export const NOT_APPLICABLE = "Not applicable";

export type ValueOrigin = "default" | "other-publication" | "calculated" | "reference";

export interface ComparedValue {
  text: string;
  value: number | null;
  origin: ValueOrigin;
  /** An upper or lower limit, or Msini, can't be compared as a measurement. */
  bound: boolean;
}

export interface MetricDifference {
  absolute: string;
  /** Share of the larger value each side fills, for the neutral bars. */
  shareA: number;
  shareB: number;
  sentence: string;
}

export interface ComparisonRow {
  key: string;
  label: string;
  a: ComparedValue;
  b: ComparedValue;
  difference: MetricDifference | null;
  /** Says why there is no difference, when there isn't one. */
  reason: string | null;
}

interface Metric {
  key: string;
  label: string;
  unit: string;
  path: MetricPath;
  read: (planet: PlanetSummary) => number | null;
  /** Words for the larger and smaller side, e.g. "larger" and "smaller". */
  more: string;
  less: string;
  /** A ratio means nothing for eccentricity, so it reports the gap only. */
  ratio: boolean;
  /** Prefix for the sentence, e.g. "orbits", defaulting to "is". */
  verb?: string;
}

const METRICS: Metric[] = [
  { key: "radius", label: "Planet radius", unit: "Earth radii", path: "physical.radius", read: (p) => p.radiusEarth, more: "larger", less: "smaller", ratio: true },
  { key: "mass", label: "Mass", unit: "Earth masses", path: "physical.mass", read: (p) => p.massEarth, more: "heavier", less: "lighter", ratio: true },
  { key: "density", label: "Density", unit: "g/cm³", path: "physical.density", read: (p) => p.density, more: "denser", less: "less dense", ratio: true },
  { key: "temperature", label: "Equilibrium temperature", unit: "K", path: "climate.equilibrium_temperature", read: (p) => p.temperatureK, more: "hotter", less: "cooler", ratio: true },
  { key: "period", label: "Orbital period", unit: "days", path: "orbit.period", read: (p) => p.periodDays, more: "slower", less: "faster", ratio: true, verb: "orbits" },
  { key: "axis", label: "Semi-major axis", unit: "AU", path: "orbit.semi_major_axis", read: (p) => p.semiMajorAxisAu, more: "farther from its star", less: "closer to its star", ratio: true, verb: "orbits" },
  { key: "eccentricity", label: "Eccentricity", unit: "", path: "orbit.eccentricity", read: (p) => p.eccentricity, more: "more elongated", less: "less elongated", ratio: false, verb: "has a" },
  { key: "star", label: "Host-star temperature", unit: "K", path: "host_star.temperature", read: (p) => p.starTemperatureK, more: "a hotter star", less: "a cooler star", ratio: true, verb: "orbits" },
  { key: "distance", label: "Distance from Earth", unit: "light-years", path: "location.distance", read: (p) => p.distanceLy, more: "farther away", less: "nearer", ratio: true },
];

function compared(planet: PlanetSummary, metric: Metric): ComparedValue {
  const value = metric.read(planet);
  if (planet.referenceBody && metric.key === "distance") {
    return { text: NOT_APPLICABLE, value: null, origin: "reference", bound: false };
  }

  const limited = hasMetricBit(planet.limitMask, metric.path);
  const minimum = metric.key === "mass" && planet.massIsMinimum;
  const origin: ValueOrigin = planet.referenceBody
    ? "reference"
    : metric.key === "density" && planet.densityIsCalculated
      ? "calculated"
      : hasMetricBit(planet.gapFilledMask, metric.path)
        ? "other-publication"
        : "default";

  if (value === null) return { text: UNKNOWN, value: null, origin: "default", bound: false };

  return {
    text: `${minimum ? "≥ " : limited ? "Limit: " : ""}${formatValue(value, metric.unit)}`,
    value,
    origin,
    bound: limited || (minimum && value !== null),
  };
}

function ratioPhrase(larger: number, smaller: number) {
  const times = larger / smaller;
  if (times >= 2) {
    return `${times.toLocaleString("en-US", { maximumFractionDigits: 1 })} times`;
  }
  return `${((times - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function differenceOf(
  metric: Metric,
  a: ComparedValue,
  b: ComparedValue,
  nameA: string,
  nameB: string,
): MetricDifference | null {
  if (a.value === null || b.value === null) return null;
  const gap = Math.abs(a.value - b.value);
  const absolute = formatValue(gap, metric.unit);
  const larger = Math.max(a.value, b.value);
  const shareA = larger === 0 ? 0 : a.value / larger;
  const shareB = larger === 0 ? 0 : b.value / larger;

  if (gap === 0) {
    return { absolute, shareA, shareB, sentence: "The two values are the same." };
  }

  const [leader, other] = a.value > b.value ? [nameA, nameB] : [nameB, nameA];
  const smaller = Math.min(a.value, b.value);

  if (!metric.ratio || smaller === 0) {
    const phrase = metric.key === "eccentricity" ? `${metric.more} orbit` : metric.more;
    return { absolute, shareA, shareB, sentence: `${leader} ${metric.verb ?? "is"} ${phrase} than ${other}.` };
  }

  const amount = ratioPhrase(larger, smaller);
  const sentence =
    metric.key === "star"
      ? `${leader}'s star is ${amount} hotter than ${other}'s.`
      : metric.key === "period"
        ? `${leader}'s orbit takes ${amount} longer than ${other}'s.`
        : metric.key === "axis"
          ? `${leader} orbits ${amount} farther out than ${other}.`
          : `${leader} is ${amount} ${metric.more} than ${other}.`;
  return { absolute, shareA, shareB, sentence };
}

export type SizeBasis = "measured" | "estimated" | "unknown";

export interface CompareSizes {
  /** Radius in Earth radii, or null when neither radius nor mass can give one. */
  a: number | null;
  b: number | null;
  basisA: SizeBasis;
  basisB: SizeBasis;
  /** True when both planets have a size, measured or estimated. */
  toScale: boolean;
}

/** A measured radius if NASA has one, otherwise an estimate from a usable mass. */
function sizeOf(planet: PlanetSummary): { radius: number | null; basis: SizeBasis } {
  if (planet.radiusEarth !== null) return { radius: planet.radiusEarth, basis: "measured" };
  if (planet.massEarth === null || hasMetricBit(planet.limitMask, "physical.mass")) {
    return { radius: null, basis: "unknown" };
  }
  return { radius: radiusFromMass(planet.massEarth), basis: "estimated" };
}

/** True sizes, untouched. The scene applies one shared scale to both. */
export function compareSizes(a: PlanetSummary, b: PlanetSummary): CompareSizes {
  const left = sizeOf(a);
  const right = sizeOf(b);
  return {
    a: left.radius,
    b: right.radius,
    basisA: left.basis,
    basisB: right.basis,
    toScale: left.radius !== null && right.radius !== null,
  };
}

/** The label under a planet in the 3D comparison. */
export function radiusLabel(planet: PlanetSummary) {
  const { radius, basis } = sizeOf(planet);
  if (radius === null) {
    return { size: "Size unknown", detail: "Illustrative size, not to scale" };
  }
  const text = radius.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (basis === "estimated") {
    return {
      size: `About ${text} × Earth radius`,
      detail: `Estimated from ${planet.massIsMinimum ? "minimum mass" : "mass"}`,
    };
  }
  const jupiter = planet.radiusJupiter;
  return {
    size: `${text} × Earth radius`,
    detail: `${formatValue(radius, "R⊕")}${
      jupiter === null ? "" : `, ${jupiter.toLocaleString("en-US", { maximumFractionDigits: 3 })} RJ`
    }`,
  };
}

export function comparePlanets(a: PlanetSummary, b: PlanetSummary): ComparisonRow[] {
  const rows: ComparisonRow[] = METRICS.map((metric) => {
    const left = compared(a, metric);
    const right = compared(b, metric);
    const bound = left.bound || right.bound;
    const missing = left.value === null || right.value === null;
    return {
      key: metric.key,
      label: metric.label,
      a: left,
      b: right,
      difference: bound || missing ? null : differenceOf(metric, left, right, a.name, b.name),
      reason: left.text === NOT_APPLICABLE || right.text === NOT_APPLICABLE
        ? "Not applicable to a Solar System planet."
        : missing
          ? "Can't compare: a value is missing."
          : bound
            ? "Can't compare exactly: one value is a limit, not a measurement."
            : null,
    };
  });

  const method = (planet: PlanetSummary): ComparedValue => ({
    text: planet.referenceBody ? NOT_APPLICABLE : (planet.method ?? UNKNOWN),
    value: null,
    origin: planet.referenceBody ? "reference" : "default",
    bound: false,
  });

  rows.push({
    key: "method",
    label: "Discovery method",
    a: method(a),
    b: method(b),
    difference: null,
    reason: null,
  });
  return rows;
}

/** The sentence under the 3D comparison. It always says what is not measured. */
export function scaleNote(a: PlanetSummary, b: PlanetSummary, sizes: CompareSizes) {
  const named = (basis: SizeBasis) =>
    [sizes.basisA === basis ? a.name : null, sizes.basisB === basis ? b.name : null]
      .filter(Boolean)
      .join(" and ");

  if (!sizes.toScale) {
    return `NASA lists no radius or usable mass for ${named("unknown")}, so it is drawn at an illustrative size, not to scale.`;
  }

  const estimated = named("estimated");
  const ratio = Math.max(sizes.a!, sizes.b!) / Math.min(sizes.a!, sizes.b!);
  const larger = sizes.a! >= sizes.b! ? a : b;
  const times = ratio.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const comparison =
    ratio > 1
      ? `Same physical scale. ${larger.name} has ${estimated ? "about " : ""}${times} times the radius.`
      : "Same physical scale. Both have the same radius.";
  return estimated
    ? `${comparison} NASA lists no radius for ${estimated}, so its size is estimated from mass.`
    : comparison;
}

/**
 * The structured input for a future "Explain this comparison" feature. ExoVerse
 * has no AI integration yet. Send this, and only this, so a model sees the same
 * values and the same missing fields as the table, and can't fill gaps.
 */
export function comparisonPayload(a: PlanetSummary, b: PlanetSummary) {
  return {
    planetA: { name: a.name, hostStar: a.hostname, referenceBody: Boolean(a.referenceBody) },
    planetB: { name: b.name, hostStar: b.hostname, referenceBody: Boolean(b.referenceBody) },
    rows: comparePlanets(a, b).map((row) => ({
      parameter: row.label,
      planetA: row.a.text,
      planetB: row.b.text,
      difference: row.difference?.sentence ?? row.reason,
    })),
  };
}
