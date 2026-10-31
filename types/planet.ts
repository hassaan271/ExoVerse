/**
 * The app's data shapes. `PlanetRecord` and `SystemRecord` match the JSON that
 * scripts/build-catalog.mjs writes from the NASA Exoplanet Archive CSV. A null
 * always means NASA has no value, never zero.
 */
export type SizeClass =
  | "Earth-sized"
  | "Super-Earth"
  | "Neptune-sized"
  | "Jupiter-sized"
  | "Unclassified";

export interface Reference {
  text: string;
  url: string | null;
}

export interface GapFill {
  rowid: number;
  publication_date: string | null;
  reference: Reference | null;
}

export interface Uncertainty {
  upper: number | null;
  lower: number | null;
}

export interface PlanetRecord {
  id: string;
  pl_name: string;
  hostname: string;
  system_id: string;
  pl_letter: string | null;
  /** ExoVerse's own label, derived from radius or mass. Not a NASA field. */
  size_class: SizeClass;
  physical: {
    radius_earth: number | null;
    radius_jupiter: number | null;
    /** Which NASA column gave radius_earth. */
    radius_source: "pl_rade" | "pl_radj" | null;
    mass_earth: number | null;
    mass_jupiter: number | null;
    mass_provenance: string | null;
    density: number | null;
    density_calculated: number | null;
  };
  climate: {
    equilibrium_temperature_kelvin: number | null;
    insolation_earth: number | null;
  };
  orbit: {
    period_days: number | null;
    semi_major_axis_au: number | null;
    eccentricity: number | null;
    inclination_degrees: number | null;
    argument_of_periastron_degrees: number | null;
  };
  location: {
    distance_parsecs: number | null;
    distance_light_years: number | null;
    ra: number | null;
    dec: number | null;
    ra_sexagesimal: string | null;
    dec_sexagesimal: string | null;
    galactic_longitude: number | null;
    galactic_latitude: number | null;
  };
  host_star: {
    temperature_kelvin: number | null;
    radius_solar: number | null;
    mass_solar: number | null;
    spectral_type: string | null;
    metallicity_dex: number | null;
    metallicity_ratio: string | null;
    luminosity_log_solar: number | null;
    age_gyr: number | null;
  };
  discovery: {
    method: string | null;
    year: number | null;
    facility: string | null;
    telescope: string | null;
    instrument: string | null;
    locale: string | null;
    reference: Reference | null;
  };
  /** NASA's two-sided uncertainties, from the same row as each value. */
  uncertainties: Record<
    | "radius_earth" | "mass_earth" | "equilibrium_temperature" | "insolation"
    | "semi_major_axis" | "eccentricity" | "star_temperature" | "star_luminosity"
    | "distance_parsecs",
    Uncertainty | null
  >;
  /** Published spectra on record. A count, not a detection of anything. */
  atmosphere: {
    transmission_spectra: number;
    eclipse_spectra: number;
    direct_imaging_spectra: number;
  };
  status: {
    solution_type: string | null;
    /** True when any NASA row for this planet is Published Confirmed. */
    confirmed: boolean;
    controversial: boolean;
    circumbinary: boolean;
  };
  system: {
    stars: number | null;
    planets: number | null;
    moons: number | null;
  };
  provenance: {
    default_rowid: number;
    planet_reference: Reference | null;
    star_reference: Reference | null;
    system_reference: Reference | null;
    publication_date: string | null;
    last_update: string | null;
    release_date: string | null;
    nasa_row_count: number;
    alternate_rowids: number[];
    limits: Record<string, "upper" | "lower">;
    gap_filled: Record<string, GapFill>;
  };
  /** The default row's non-blank columns, exactly as NASA wrote them. */
  nasa: Record<string, string>;
}

export interface SystemRecord {
  id: string;
  hostname: string;
  planets: string[];
  planet_ids: string[];
  planets_in_catalog: number;
  nasa_sy_pnum: number | null;
  stars: number | null;
  circumbinary: boolean;
  location: {
    distance_parsecs: number | null;
    distance_light_years: number | null;
    ra: number | null;
    dec: number | null;
    galactic_longitude: number | null;
    galactic_latitude: number | null;
  };
  host_star: {
    temperature_kelvin: number | null;
    radius_solar: number | null;
    mass_solar: number | null;
    spectral_type: string | null;
    luminosity_log_solar: number | null;
    luminosity_uncertainty: Uncertainty | null;
  };
}

/** The light form used in lists, the galaxy and the rendering engine. */
export interface PlanetSummary {
  id: string;
  name: string;
  hostname: string;
  systemId: string;
  radiusEarth: number | null;
  radiusJupiter: number | null;
  massEarth: number | null;
  /** True when the mass is Msini, a lower limit. */
  massIsMinimum: boolean;
  density: number | null;
  temperatureK: number | null;
  starTemperatureK: number | null;
  periodDays: number | null;
  semiMajorAxisAu: number | null;
  distanceLy: number | null;
  method: string | null;
  year: number | null;
  sizeClass: SizeClass;
  eccentricity: number | null;
  /** Bits follow METRIC_PATHS: value came from a non-default publication. */
  gapFilledMask: number;
  /** Bits follow METRIC_PATHS: value is an upper or lower limit. */
  limitMask: number;
  densityIsCalculated: boolean;
  /** Set only on Earth and Jupiter, which are not catalog records. */
  referenceBody?: "earth" | "jupiter";
}

export interface SystemSummary {
  id: string;
  hostname: string;
  starTemperatureK: number | null;
  distanceLy: number | null;
  galacticLongitude: number | null;
  galacticLatitude: number | null;
  spectralType: string | null;
  distanceParsecs: number | null;
  starRadiusSolar: number | null;
  starMassSolar: number | null;
  planets: PlanetSummary[];
}

export interface CatalogStats {
  planets: number;
  /** Planets with a Published Confirmed row. Absent in the browser index. */
  confirmed?: number;
  systems: number;
  multiPlanetSystems: number;
  /** Systems with a sky position and a distance, so plotted in 3D. */
  systemsWithPosition: number;
}

export interface Catalog {
  metadata: {
    source: string;
    source_table: string;
    retrieved: string;
    planets: number;
    systems: number;
  };
  systems: SystemSummary[];
  planets: PlanetSummary[];
  methods: string[];
  systemById: Map<string, SystemSummary>;
  planetById: Map<string, PlanetSummary>;
  stats: CatalogStats;
}
