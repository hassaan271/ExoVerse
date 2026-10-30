import { formatValue, UNKNOWN } from "@/lib/format";
import type { GapFill, PlanetRecord } from "@/types/planet";

export type FactOrigin = "nasa" | "other-publication" | "calculated";

export interface Fact {
  label: string;
  value: string;
  origin: FactOrigin;
  /** True for a measured number, which the panels may roll. */
  numeric?: boolean;
  /** Set when the value came from a publication other than NASA's default. */
  fill?: GapFill;
}

export interface FactGroup {
  title: string;
  facts: Fact[];
}

/**
 * The one place that decides how a record reads, used by every panel. Each
 * value keeps its origin, so NASA's default values, values from other
 * publications and our own calculations can't be mistaken for each other.
 */
export function planetFactGroups(planet: PlanetRecord): FactGroup[] {
  const { limits, gap_filled: filled } = planet.provenance;

  const fact = (label: string, value: number | null, unit: string, path: string): Fact => ({
    label,
    value: formatValue(value, unit, limits[path]),
    numeric: value !== null,
    origin: filled[path] ? "other-publication" : "nasa",
    fill: filled[path],
  });

  const text = (label: string, value: string | number | null, path?: string): Fact => ({
    label,
    value: value === null ? UNKNOWN : String(value),
    origin: path && filled[path] ? "other-publication" : "nasa",
    fill: path ? filled[path] : undefined,
  });

  const { density, density_calculated: calculatedDensity } = planet.physical;
  const massLabel = planet.physical.mass_provenance === "Mass" ? "Mass" : "Minimum mass";

  return [
    {
      title: "Planet",
      facts: [
        fact("Radius", planet.physical.radius_earth, "× Earth", "physical.radius"),
        fact(massLabel, planet.physical.mass_earth, "× Earth", "physical.mass"),
        density === null && calculatedDensity !== null
          ? {
              label: "Density",
              value: formatValue(calculatedDensity, "g/cm³"),
              numeric: true,
              origin: "calculated",
            }
          : fact("Density", density, "g/cm³", "physical.density"),
        fact(
          "Equilibrium temperature",
          planet.climate.equilibrium_temperature_kelvin,
          "K",
          "climate.equilibrium_temperature",
        ),
        fact("Insolation", planet.climate.insolation_earth, "× Earth", "climate.insolation"),
      ],
    },
    {
      title: "Orbit",
      facts: [
        fact("Orbital period", planet.orbit.period_days, "days", "orbit.period"),
        fact("Orbital distance", planet.orbit.semi_major_axis_au, "AU", "orbit.semi_major_axis"),
        fact("Eccentricity", planet.orbit.eccentricity, "", "orbit.eccentricity"),
        fact("Inclination", planet.orbit.inclination_degrees, "°", "orbit.inclination"),
      ],
    },
    {
      title: "Host star",
      facts: [
        text("Name", planet.hostname),
        text("Spectral type", planet.host_star.spectral_type, "host_star.spectral_type"),
        fact("Temperature", planet.host_star.temperature_kelvin, "K", "host_star.temperature"),
        fact("Radius", planet.host_star.radius_solar, "× Sun", "host_star.radius"),
        fact("Mass", planet.host_star.mass_solar, "× Sun", "host_star.mass"),
        fact("Distance from Earth", planet.location.distance_parsecs, "parsecs", "location.distance"),
        {
          label: "In light-years",
          value: formatValue(planet.location.distance_light_years, "light-years"),
          numeric: planet.location.distance_light_years !== null,
          origin: planet.location.distance_light_years === null ? "nasa" : "calculated",
        },
      ],
    },
    {
      title: "Discovery",
      facts: [
        text("Method", planet.discovery.method),
        text("Year", planet.discovery.year),
        text("Facility", planet.discovery.facility),
      ],
    },
  ];
}
