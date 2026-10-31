/**
 * Expected boundaries were calculated separately from the published equation,
 * not with this module, so a mistake in the code can't confirm itself.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessPlanet,
  explain,
  habitableZone,
  indicators,
  luminosityFromRadius,
  resolveStar,
  semiMajorAxisFromPeriod,
} from "../lib/habitability.ts";

const near = (actual, expected, places = 4) =>
  assert.ok(Math.abs(actual - expected) < 10 ** -places, `${actual} != ${expected}`);

const sunlike = { teff: 5780, logLuminosity: 0, luminosityError: null, radiusSolar: 1, massSolar: 1 };
const orbit = (fields) => ({
  semiMajorAxis: 1, semiMajorAxisError: null, semiMajorAxisIsLimit: false,
  eccentricity: 0, eccentricityError: null, eccentricityLimit: null,
  periodDays: 365.25, circumbinary: false, insolation: null, ...fields,
});

test("boundaries match the published equation for four stars", () => {
  for (const [teff, logL, expected] of [
    [5780, 0, [0.75038, 0.95044, 1.676, 1.76777]],
    [3000, -2.5, [0.04624, 0.05857, 0.1165, 0.12289]],
    [7000, 0.8, [1.75728, 2.22574, 3.84505, 4.05557]],
    [2600, -3, [0.02613, 0.0331, 0.067, 0.07067]],
  ]) {
    const zone = habitableZone(teff, logL);
    near(zone.optimisticInner, expected[0]);
    near(zone.conservativeInner, expected[1]);
    near(zone.conservativeOuter, expected[2]);
    near(zone.optimisticOuter, expected[3]);
  }
});

test("Earth is in the conservative zone", () => {
  assert.equal(assessPlanet(orbit({}), sunlike).zone, "conservative");
});

test("optimistic-only planet", () => {
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 0.85 }), sunlike).zone, "optimistic");
});

test("planets outside the zone, on both sides", () => {
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 0.3 }), sunlike).zone, "outside");
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 5.2 }), sunlike).zone, "outside");
});

test("an eccentric orbit crossing a boundary is uncertain, keeping its nominal zone", () => {
  const result = assessPlanet(orbit({ semiMajorAxis: 1.3, eccentricity: 0.4 }), sunlike);
  assert.equal(result.zone, "uncertain");
  assert.equal(result.nominalZone, "conservative");
  assert.ok(result.reasons.includes("eccentric-crossing"));
  near(result.periastron, 0.78);
  near(result.apastron, 1.82);
});

test("a small eccentricity that stays inside keeps its class", () => {
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 1.3, eccentricity: 0.1 }), sunlike).zone, "conservative");
});

test("measurement uncertainty overlapping a boundary is uncertain", () => {
  const result = assessPlanet(
    orbit({ semiMajorAxis: 0.97, semiMajorAxisError: { upper: 0.03, lower: -0.03 } }),
    sunlike,
  );
  assert.equal(result.zone, "uncertain");
  assert.ok(result.reasons.includes("uncertainty-crossing"));
});

test("luminosity uncertainty moves the boundaries", () => {
  const star = { ...sunlike, luminosityError: { upper: 0.1, lower: -0.1 } };
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 1.0 }), star).zone, "uncertain");
});

test("a missing star value is insufficient, never a negative result or a Sun-like guess", () => {
  const noLuminosity = { ...sunlike, logLuminosity: null, radiusSolar: null };
  assert.equal(assessPlanet(orbit({}), noLuminosity).zone, "insufficient");
  assert.equal(assessPlanet(orbit({}), { ...sunlike, teff: null }).zone, "insufficient");
});

test("missing orbit is insufficient unless Kepler's law can supply it", () => {
  const none = assessPlanet(orbit({ semiMajorAxis: null, periodDays: null }), sunlike);
  assert.equal(none.zone, "insufficient");
  const derived = assessPlanet(orbit({ semiMajorAxis: null, periodDays: 365.25 }), sunlike);
  assert.equal(derived.semiMajorAxisSource, "derived");
  near(derived.semiMajorAxis, 1);
});

test("unknown eccentricity is not treated as circular fact", () => {
  const result = assessPlanet(orbit({ eccentricity: null }), sunlike);
  assert.equal(result.zone, "conservative");
  assert.ok(result.reasons.includes("eccentricity-unknown"));
  assert.equal(result.periastron, null);
});

test("stars outside 2600 to 7200 K are uncertain and marked indicative", () => {
  const star = { ...sunlike, teff: 2566, logLuminosity: -3.25727 };
  assert.equal(resolveStar(star).indicative, true);
  assert.equal(assessPlanet(orbit({ semiMajorAxis: 0.029 }), star).zone, "uncertain");
});

test("circumbinary planets are not assessed by a single-star model", () => {
  assert.equal(assessPlanet(orbit({ circumbinary: true }), sunlike).zone, "insufficient");
});

test("a limit on orbital distance can't give a firm class", () => {
  assert.equal(assessPlanet(orbit({ semiMajorAxisIsLimit: true }), sunlike).zone, "uncertain");
});

test("inputs that contradict NASA's insolation stay uncertain", () => {
  const result = assessPlanet(orbit({ insolation: 5 }), sunlike);
  assert.equal(result.zone, "uncertain");
  assert.ok(result.reasons.includes("flux-conflict"));
  assert.equal(assessPlanet(orbit({ insolation: 1.2 }), sunlike).zone, "conservative");
});

test("luminosity is derived only with a label", () => {
  near(luminosityFromRadius(1, 5772), 0);
  const star = resolveStar({ ...sunlike, logLuminosity: null });
  assert.equal(star.luminositySource, "derived");
  assert.ok(assessPlanet(orbit({}), { ...sunlike, logLuminosity: null }).reasons.includes("luminosity-derived"));
});

test("Kepler's third law", () => {
  near(semiMajorAxisFromPeriod(365.25, 1), 1);
  near(semiMajorAxisFromPeriod(365.25 * 8, 1), 4);
});

const planet = {
  id: "x", name: "X", systemId: "s", hostname: "S", zone: "conservative", nominalZone: "conservative",
  reasons: [], semiMajorAxis: 1, semiMajorAxisSource: "nasa", periastron: 1, apastron: 1, eccentricity: 0,
  radiusEarth: 1, massEarth: 1, massIsMinimum: false, insolation: 0.9, equilibriumK: 255, periodDays: 365,
  spectra: { transmission: 0, eclipse: 0, directImaging: 0 }, completeness: 8,
  defaultSolutionConfirmed: true, controversial: false,
};

test("no indicator or explanation claims an atmosphere, water or life", () => {
  const text = explain(planet, undefined) + indicators(planet).map((i) => i.value + i.note).join(" ");
  assert.doesNotMatch(text, /has an atmosphere|liquid water (exists|confirmed)|habitable world|life exists/i);
  assert.equal(indicators(planet).find((i) => i.key === "atmosphere").status, "Not yet characterized");
});

test("explanations use only the values a planet has", () => {
  const sparse = { ...planet, insolation: null, zone: "insufficient", reasons: ["no-luminosity"], semiMajorAxis: null };
  const text = explain(sparse, undefined);
  assert.doesNotMatch(text, /stellar energy/);
  assert.match(text, /can't be assessed/);
  assert.notEqual(explain(planet, undefined), explain({ ...planet, insolation: 2 }, undefined));
});
