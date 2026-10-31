/**
 * Habitable-zone screening. Pure functions with no imports, shared by the data
 * build and the interface.
 *
 * Model: Kopparapu et al. 2014, ApJL 787 L29, Table 1 and Eq. 4, for a 1 Earth
 * mass planet. Conservative zone: Runaway Greenhouse to Maximum Greenhouse.
 * Optimistic zone: Recent Venus to Early Mars. Fitted for 2600 K to 7200 K.
 *
 * The habitable zone is a first-order screen for where surface liquid water could
 * exist given a suitable atmosphere. It says nothing about whether a planet has
 * an atmosphere, water or life, and nothing here should be read as if it did.
 */
export const HZ_MODEL = {
  citation: "Kopparapu et al. 2014, ApJL 787, L29",
  url: "https://arxiv.org/abs/1404.5292",
  minTeff: 2600,
  maxTeff: 7200,
  solarTeff: 5780,
};

const LIMITS = {
  recentVenus: { sun: 1.776, a: 2.136e-4, b: 2.533e-8, c: -1.332e-11, d: -3.097e-15 },
  runawayGreenhouse: { sun: 1.107, a: 1.332e-4, b: 1.58e-8, c: -8.308e-12, d: -1.931e-15 },
  maximumGreenhouse: { sun: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 },
  earlyMars: { sun: 0.32, a: 5.547e-5, b: 1.526e-9, c: -2.874e-12, d: -5.011e-16 },
};

export type HzZone = "conservative" | "optimistic" | "outside" | "uncertain" | "insufficient";

/** Best first, so sorting by zone surfaces the screening's strongest results. */
export const ZONE_ORDER: HzZone[] = ["conservative", "optimistic", "uncertain", "outside", "insufficient"];

export const ZONE_LABEL: Record<HzZone, string> = {
  conservative: "Conservative habitable zone",
  optimistic: "Optimistic habitable zone only",
  outside: "Outside the habitable zone",
  uncertain: "Uncertain",
  insufficient: "Insufficient data",
};

export interface HzBoundaries {
  optimisticInner: number;
  conservativeInner: number;
  conservativeOuter: number;
  optimisticOuter: number;
}

export type ReasonCode =
  | "circumbinary" | "no-temperature" | "no-luminosity" | "no-orbit"
  | "temperature-out-of-range" | "orbit-limit" | "eccentric-crossing"
  | "uncertainty-crossing" | "flux-conflict" | "eccentricity-unknown"
  | "luminosity-derived" | "orbit-derived";

export const REASON_TEXT: Record<ReasonCode, string> = {
  circumbinary: "It orbits two stars, and this single-star model doesn't apply.",
  "no-temperature": "The star's temperature isn't available.",
  "no-luminosity": "The star's luminosity isn't available and can't be derived from its radius and temperature.",
  "no-orbit": "Its orbital distance isn't available and can't be derived from its period and the star's mass.",
  "temperature-out-of-range": "The star is outside the model's 2600 K to 7200 K range, so the boundaries shown are indicative only.",
  "orbit-limit": "Its orbital distance is published only as a limit.",
  "eccentric-crossing": "Its eccentric orbit crosses a habitable-zone boundary.",
  "uncertainty-crossing": "The measurement uncertainty overlaps a habitable-zone boundary.",
  "flux-conflict": "NASA's listed insolation disagrees with this star's luminosity and orbital distance, so one of the inputs may be wrong.",
  "eccentricity-unknown": "Eccentricity isn't available, so the orbit's full range is unknown.",
  "luminosity-derived": "Luminosity was calculated from the star's radius and temperature, because NASA lists none.",
  "orbit-derived": "Orbital distance was calculated from the period and the star's mass, because NASA lists none.",
};

export interface Bound {
  upper: number | null;
  lower: number | null;
}

/** Effective stellar flux at a boundary, relative to Earth's. */
function effectiveFlux(limit: (typeof LIMITS)["earlyMars"], teff: number) {
  const t = teff - HZ_MODEL.solarTeff;
  return limit.sun + limit.a * t + limit.b * t ** 2 + limit.c * t ** 3 + limit.d * t ** 4;
}

/** r = sqrt(L / S_eff), in AU, with L in solar units. */
export function habitableZone(teff: number, logLuminosity: number): HzBoundaries {
  const luminosity = 10 ** logLuminosity;
  const radius = (limit: (typeof LIMITS)["earlyMars"]) =>
    Math.sqrt(luminosity / effectiveFlux(limit, teff));
  return {
    optimisticInner: radius(LIMITS.recentVenus),
    conservativeInner: radius(LIMITS.runawayGreenhouse),
    conservativeOuter: radius(LIMITS.maximumGreenhouse),
    optimisticOuter: radius(LIMITS.earlyMars),
  };
}

/** Stefan-Boltzmann, for a star with a radius and temperature but no luminosity. */
export function luminosityFromRadius(radiusSolar: number, teff: number) {
  return 2 * Math.log10(radiusSolar) + 4 * Math.log10(teff / 5772);
}

/** Kepler's third law: a in AU from a period in days and a star mass in Suns. */
export function semiMajorAxisFromPeriod(periodDays: number, massSolar: number) {
  return Math.cbrt(massSolar * (periodDays / 365.25) ** 2);
}

function zoneAt(distance: number, zone: HzBoundaries): HzZone {
  if (distance >= zone.conservativeInner && distance <= zone.conservativeOuter) return "conservative";
  if (distance >= zone.optimisticInner && distance <= zone.optimisticOuter) return "optimistic";
  return "outside";
}

const boundaryList = (zone: HzBoundaries) => [
  zone.optimisticInner, zone.conservativeInner, zone.conservativeOuter, zone.optimisticOuter,
];

export interface StarInput {
  teff: number | null;
  /** log10(L / Lsun), as in NASA's st_lum. */
  logLuminosity: number | null;
  /** NASA's uncertainty on logLuminosity. */
  luminosityError: Bound | null;
  radiusSolar: number | null;
  massSolar: number | null;
}

export interface OrbitInput {
  semiMajorAxis: number | null;
  semiMajorAxisError: Bound | null;
  semiMajorAxisIsLimit: boolean;
  eccentricity: number | null;
  eccentricityError: Bound | null;
  /** "upper" means the true value is at most this; "lower", at least. */
  eccentricityLimit: "upper" | "lower" | null;
  periodDays: number | null;
  circumbinary: boolean;
  /** NASA's pl_insol, used only to cross-check, in Earth flux. */
  insolation: number | null;
}

/** Inputs this far from pl_insol can't both be right. */
const FLUX_TOLERANCE = 2;

export interface ResolvedStar {
  teff: number | null;
  logLuminosity: number | null;
  luminositySource: "nasa" | "derived" | null;
  /** Null when the star lacks what the model needs. */
  zone: HzBoundaries | null;
  /** True when the star is out of the model's range, so nothing is classified by it. */
  indicative: boolean;
}

/** One star, one zone: every planet of a host is judged against the same bands. */
export function resolveStar(star: StarInput): ResolvedStar {
  const { teff, radiusSolar } = star;
  const derived =
    star.logLuminosity === null && teff !== null && radiusSolar !== null
      ? luminosityFromRadius(radiusSolar, teff)
      : null;
  const logLuminosity = star.logLuminosity ?? derived;
  const luminositySource = star.logLuminosity !== null ? "nasa" : derived !== null ? "derived" : null;
  if (teff === null || logLuminosity === null) {
    return { teff, logLuminosity, luminositySource, zone: null, indicative: false };
  }
  const inRange = teff >= HZ_MODEL.minTeff && teff <= HZ_MODEL.maxTeff;
  // Out of range, the nearest valid temperature gives a labelled sketch only.
  const fitted = Math.min(Math.max(teff, HZ_MODEL.minTeff), HZ_MODEL.maxTeff);
  return {
    teff,
    logLuminosity,
    luminositySource,
    zone: habitableZone(fitted, logLuminosity),
    indicative: !inRange,
  };
}

export interface Assessment {
  zone: HzZone;
  /** Where the semi-major axis alone falls, before ranges are considered. */
  nominalZone: HzZone | null;
  reasons: ReasonCode[];
  semiMajorAxis: number | null;
  semiMajorAxisSource: "nasa" | "derived" | null;
  periastron: number | null;
  apastron: number | null;
}

export function assessPlanet(orbit: OrbitInput, star: StarInput, resolved = resolveStar(star)): Assessment {
  const reasons: ReasonCode[] = [];
  const derivedAxis =
    orbit.semiMajorAxis === null && orbit.periodDays !== null && star.massSolar !== null
      ? semiMajorAxisFromPeriod(orbit.periodDays, star.massSolar)
      : null;
  const axis = orbit.semiMajorAxis ?? derivedAxis;
  const semiMajorAxisSource = orbit.semiMajorAxis !== null ? "nasa" : derivedAxis !== null ? "derived" : null;
  const e = orbit.eccentricity;
  const periastron = axis === null || e === null ? null : axis * (1 - e);
  const apastron = axis === null || e === null ? null : axis * (1 + e);
  const result = (zone: HzZone, nominalZone: HzZone | null = null): Assessment => ({
    zone, nominalZone, reasons, semiMajorAxis: axis, semiMajorAxisSource, periastron, apastron,
  });

  if (orbit.circumbinary) reasons.push("circumbinary");
  if (resolved.teff === null) reasons.push("no-temperature");
  else if (resolved.logLuminosity === null) reasons.push("no-luminosity");
  if (axis === null) reasons.push("no-orbit");
  if (reasons.length > 0) return result("insufficient");

  if (resolved.luminositySource === "derived") reasons.push("luminosity-derived");
  if (semiMajorAxisSource === "derived") reasons.push("orbit-derived");

  const zone = resolved.zone as HzBoundaries;
  const nominal = zoneAt(axis as number, zone);

  if (resolved.indicative) {
    reasons.push("temperature-out-of-range");
    return result("uncertain", nominal);
  }
  if (orbit.semiMajorAxisIsLimit) {
    reasons.push("orbit-limit");
    return result("uncertain", nominal);
  }
  if (orbit.insolation !== null) {
    const expected = 10 ** (resolved.logLuminosity as number) / (axis as number) ** 2;
    const ratio = orbit.insolation / expected;
    // Only a conflict that could change the class matters: pl_insol implies its
    // own distance, and the two may simply land in the same zone.
    const fluxDistance = Math.sqrt(10 ** (resolved.logLuminosity as number) / orbit.insolation);
    if ((ratio > FLUX_TOLERANCE || ratio < 1 / FLUX_TOLERANCE) && zoneAt(fluxDistance, zone) !== nominal) {
      reasons.push("flux-conflict");
      return result("uncertain", nominal);
    }
  }

  const a = axis as number;
  const reach = e === null ? 0 : e;
  const spans = (low: number, high: number, boundaries: number[][]) =>
    boundaries.some(([from, to]) => high >= from && low <= to);

  // The orbit itself, against sharp boundaries.
  const sharp = boundaryList(zone).map((value) => [value, value]);
  const crossesByOrbit = reach > 0 && spans(a * (1 - reach), a * (1 + reach), sharp);

  // The same again, with every published uncertainty at its widest.
  const up = Math.abs(orbit.semiMajorAxisError?.upper ?? 0);
  const down = Math.abs(orbit.semiMajorAxisError?.lower ?? 0);
  const eHigh =
    orbit.eccentricityLimit === "lower" ? 1 : Math.min(reach + Math.abs(orbit.eccentricityError?.upper ?? 0), 0.99);
  const luminosityUp = Math.abs(star.luminosityError?.upper ?? 0);
  const luminosityDown = Math.abs(star.luminosityError?.lower ?? 0);
  const blurred = boundaryList(zone).map((value) => [
    value * 10 ** (-luminosityDown / 2),
    value * 10 ** (luminosityUp / 2),
  ]);
  const crossesByError = spans((a - down) * (1 - eHigh), (a + up) * (1 + eHigh), blurred);

  if (e === null) reasons.push("eccentricity-unknown");
  if (crossesByOrbit) reasons.push("eccentric-crossing");
  else if (crossesByError) reasons.push("uncertainty-crossing");

  return result(crossesByOrbit || crossesByError ? "uncertain" : nominal, nominal);
}

/** Star class from temperature, because most records have no spectral type. */
export function starClass(teff: number | null) {
  if (teff === null) return null;
  if (teff >= 10000) return "B or hotter";
  if (teff >= 7500) return "A";
  if (teff >= 6000) return "F";
  if (teff >= 5200) return "G";
  if (teff >= 3700) return "K";
  return "M or cooler";
}

export interface HabitabilityPlanet {
  id: string;
  name: string;
  systemId: string;
  hostname: string;
  zone: HzZone;
  nominalZone: HzZone | null;
  reasons: ReasonCode[];
  semiMajorAxis: number | null;
  semiMajorAxisSource: "nasa" | "derived" | null;
  periastron: number | null;
  apastron: number | null;
  eccentricity: number | null;
  radiusEarth: number | null;
  massEarth: number | null;
  massIsMinimum: boolean;
  insolation: number | null;
  equilibriumK: number | null;
  periodDays: number | null;
  spectra: { transmission: number; eclipse: number; directImaging: number };
  /** Of the eight inputs and indicators the assessment can use. */
  completeness: number;
  /** False when NASA's default values come from a candidate-stage solution. */
  defaultSolutionConfirmed: boolean;
  controversial: boolean;
}

export interface HabitabilitySystem {
  id: string;
  hostname: string;
  teff: number | null;
  logLuminosity: number | null;
  luminositySource: "nasa" | "derived" | null;
  starClass: string | null;
  zone: HzBoundaries | null;
  indicative: boolean;
  circumbinary: boolean;
  planets: number;
  /** NASA's table holds confirmed planets, so this is 0 for this source. */
  candidates: number;
  counts: Record<HzZone, number>;
  /** Share of this system's possible inputs that are available, 0 to 1. */
  completeness: number;
  planetIds: string[];
}

export const INDICATOR_COUNT = 8;

export function completenessOf(fields: unknown[]) {
  return fields.filter((value) => value !== null && value !== undefined).length;
}

export type IndicatorStatus = "Available" | "Not available" | "Uncertain" | "Not yet characterized";

export interface Indicator {
  key: string;
  label: string;
  status: IndicatorStatus;
  value: string;
  note: string;
}

const number = (value: number, digits = 3) =>
  value.toLocaleString("en-US", { maximumSignificantDigits: digits });

function sizeRange(radius: number) {
  if (radius < 0.8) return "smaller than Earth";
  if (radius <= 1.25) return "about Earth's size";
  if (radius <= 2) return "a super-Earth size";
  if (radius <= 6) return "a sub-Neptune to Neptune size";
  return "a gas-giant size";
}

const spectraTotal = ({ spectra }: HabitabilityPlanet) =>
  spectra.transmission + spectra.eclipse + spectra.directImaging;

/** Separate indicators, deliberately not combined into a score. */
export function indicators(planet: HabitabilityPlanet): Indicator[] {
  const { zone, radiusEarth, insolation, equilibriumK, semiMajorAxis, periodDays, eccentricity } = planet;
  const total = spectraTotal(planet);
  return [
    {
      key: "zone",
      label: "Habitable-zone position",
      status: zone === "insufficient" ? "Not available" : zone === "uncertain" ? "Uncertain" : "Available",
      value: ZONE_LABEL[zone],
      note: planet.reasons.map((reason) => REASON_TEXT[reason]).join(" ") || "Based on its orbital distance and the star's luminosity and temperature.",
    },
    {
      key: "size",
      label: "Planet size",
      status: radiusEarth === null ? "Not available" : "Available",
      value: radiusEarth === null ? "Radius not available" : `${number(radiusEarth)} Earth radii`,
      note: radiusEarth === null ? "NASA lists no radius." : `This is ${sizeRange(radiusEarth)}. Radius alone doesn't show that a planet is rocky.`,
    },
    {
      key: "flux",
      label: "Stellar energy received",
      status: insolation === null ? "Not available" : "Available",
      value: insolation === null ? "Not available" : `${number(insolation)} S⊕`,
      note: "Starlight reaching the planet, relative to what Earth receives from the Sun.",
    },
    {
      key: "temperature",
      label: "Equilibrium temperature",
      status: equilibriumK === null ? "Not available" : "Available",
      value: equilibriumK === null ? "Not available" : `${number(equilibriumK, 4)} K (${number(equilibriumK - 273.15, 4)} °C)`,
      note: "An estimate for a black body heated only by its star, not a measured surface temperature.",
    },
    {
      key: "orbit",
      label: "Orbit",
      status: semiMajorAxis === null && periodDays === null ? "Not available" : "Available",
      value: [
        semiMajorAxis === null ? null : `${number(semiMajorAxis)} AU`,
        periodDays === null ? null : `${number(periodDays)} days`,
        eccentricity === null ? null : `eccentricity ${number(eccentricity, 2)}`,
      ].filter(Boolean).join(", ") || "Not available",
      note: eccentricity === null ? "Eccentricity isn't available." : "From the semi-major axis, period and eccentricity on record.",
    },
    {
      key: "atmosphere",
      label: "Atmospheric evidence",
      status: total > 0 ? "Available" : "Not yet characterized",
      value: total > 0 ? `${total} published ${total === 1 ? "spectrum" : "spectra"}` : "No published spectra in this catalog",
      note: total > 0
        ? "The archive holds spectra for this planet. A spectrum on record isn't by itself a detected atmosphere."
        : "No atmosphere should be assumed from its size or temperature.",
    },
  ];
}

/** A plain summary built only from the values this planet actually has. */
export function explain(planet: HabitabilityPlanet, system: HabitabilitySystem | undefined) {
  const parts: string[] = [];
  if (planet.insolation !== null) {
    parts.push(`This planet receives about ${number(planet.insolation)} times the stellar energy Earth receives.`);
  }
  const axis = planet.semiMajorAxis === null ? null : `${number(planet.semiMajorAxis)} AU`;
  if (planet.zone === "conservative" || planet.zone === "optimistic" || planet.zone === "outside") {
    const where = {
      conservative: "inside the conservative habitable zone",
      optimistic: "inside the optimistic habitable zone but outside the conservative boundary",
      outside: "outside the optimistic habitable zone",
    }[planet.zone];
    parts.push(`Its orbit, at ${axis}, lies ${where}.`);
  } else if (planet.zone === "uncertain") {
    parts.push(`Its position can't be classified firmly. ${planet.reasons.map((reason) => REASON_TEXT[reason]).join(" ")}`);
  } else {
    parts.push(`It can't be assessed yet. ${planet.reasons.map((reason) => REASON_TEXT[reason]).join(" ")}`);
  }
  if (system?.zone && planet.zone !== "insufficient" && !system.indicative) {
    parts.push(`For this star, the conservative zone runs from ${number(system.zone.conservativeInner)} to ${number(system.zone.conservativeOuter)} AU.`);
  }
  parts.push(
    spectraTotal(planet) > 0
      ? "Spectra exist for it, but its surface conditions have not been confirmed."
      : "Its atmosphere and surface conditions have not been characterized.",
  );
  return parts.join(" ");
}
