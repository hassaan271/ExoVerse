/**
 * Turns whatever is known about a planet into render parameters. This module
 * has no Three.js dependency, so pages can use it without loading the engine.
 *
 * Every preset is an artistic choice, not a statement about composition. The
 * `basis` list records exactly which facts picked it, and the UI shows that.
 * Palettes deliberately avoid blue seas and green land: no input here can
 * support showing oceans or life.
 */
export type VisualPreset =
  | "rocky"
  | "gas-giant"
  | "ice-giant"
  | "frozen"
  | "hot-rocky"
  | "unknown"
  | "earth";

export interface PlanetVisualInput {
  name: string;
  radiusEarth?: number | null;
  massEarth?: number | null;
  massIsMinimum?: boolean;
  densityGcm3?: number | null;
  equilibriumTempK?: number | null;
  starTempK?: number | null;
  /** An explicit classification wins over the rules below. */
  classification?: VisualPreset | null;
  /** Earth and Jupiter are known worlds, so their looks aren't guessed. */
  referenceBody?: "earth" | "jupiter";
}

export interface PlanetVisual {
  preset: VisualPreset;
  presetLabel: string;
  /** 0 to 1, derived from the name so a planet always looks the same. */
  seed: number;
  palette: [string, string, string, string, string];
  atmosphereColor: string;
  atmosphereStrength: number;
  atmosphereScale: number;
  cloudAmount: number;
  cloudColor: string;
  bumpStrength: number;
  specular: number;
  lava: number;
  /** Radians per second, purely for display. */
  spinRate: number;
  tiltRadians: number;
  starLightColor: string;
  basis: string[];
}

export const PRESET_ID: Record<VisualPreset, number> = {
  rocky: 0,
  "gas-giant": 1,
  "ice-giant": 2,
  frozen: 3,
  "hot-rocky": 4,
  unknown: 5,
  earth: 6,
};

const PRESET_LABEL: Record<VisualPreset, string> = {
  rocky: "Rocky world",
  "gas-giant": "Gas giant",
  "ice-giant": "Ice giant",
  frozen: "Frozen world",
  "hot-rocky": "Hot rocky world",
  unknown: "Unknown world",
  earth: "Stylised Earth",
};

type Palette = PlanetVisual["palette"];

const PALETTES: Record<VisualPreset, Palette[]> = {
  rocky: [
    ["#2a211d", "#5a4336", "#8d6a4f", "#b99573", "#ded0bd"],
    ["#22242a", "#4a4b50", "#77736e", "#a59c8e", "#d8d2c6"],
    ["#2c1a18", "#663529", "#9c5a3c", "#c48c62", "#e6cdaa"],
  ],
  "gas-giant": [
    ["#5e3a2b", "#a4714a", "#d8b48a", "#efe0c4", "#b4553a"],
    ["#4b3a4e", "#8a6a78", "#c9a68e", "#ecd9bf", "#9c4b52"],
    ["#44352a", "#857052", "#bda67c", "#e8dbb9", "#8e6236"],
  ],
  "ice-giant": [
    ["#1d3f6e", "#3475a8", "#5fb0cc", "#a4e0e2", "#e8fbf8"],
    ["#26337c", "#4a5fc0", "#7a97e0", "#a9cdf0", "#e6f3ff"],
  ],
  frozen: [
    ["#31465e", "#6d8ca6", "#a6c0d2", "#d6e4ec", "#f6fbfe"],
    ["#3e4560", "#7f88a8", "#b5bbd2", "#dcdfea", "#fbfbff"],
  ],
  "hot-rocky": [
    ["#0e0a0a", "#241714", "#40241b", "#6a3a26", "#a86a42"],
    ["#100c10", "#2a1a1e", "#472627", "#74403a", "#ad7558"],
  ],
  unknown: [
    ["#242634", "#44475c", "#6c6f86", "#9799ad", "#c6c7d4"],
    ["#262434", "#4a4260", "#716a88", "#9b95ad", "#c9c6d6"],
  ],
  earth: [["#08233f", "#124a7a", "#566640", "#94845e", "#f4f7f9"]],
};

const JUPITER_PALETTE: Palette = ["#6b4a35", "#b0896a", "#dcc7a8", "#f1e8d8", "#b5583a"];

const HOT_GIANT_PALETTE: Palette = [
  "#2a1212",
  "#6e2a1c",
  "#b45a2a",
  "#e8a860",
  "#fff0c8",
];

const ATMOSPHERE: Record<VisualPreset, [string, number, number]> = {
  rocky: ["#9fb6e0", 0.7, 1.035],
  "gas-giant": ["#e8c9a0", 0.8, 1.05],
  "ice-giant": ["#8fe2f0", 1.05, 1.06],
  frozen: ["#bcd8f4", 0.5, 1.025],
  "hot-rocky": ["#ff8a4a", 0.65, 1.025],
  unknown: ["#a7a2d2", 0.4, 1.03],
  earth: ["#8fb8ff", 1, 1.035],
};

const CLOUD_AMOUNT: Record<VisualPreset, number> = {
  rocky: 0.35,
  "gas-giant": 0,
  "ice-giant": 0.4,
  frozen: 0.18,
  "hot-rocky": 0,
  unknown: 0.3,
  earth: 0.6,
};

/** FNV-1a, so the seed survives reloads and needs no stored state. */
export function seedFromName(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Without this finishing mix, names one letter apart ("Kepler-186 b" and
  // "Kepler-186 f") land on almost the same seed and look like twins.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

const SPECTRAL_TEMPERATURE: Record<string, number> = {
  O: 35000,
  B: 15000,
  A: 8500,
  F: 6500,
  G: 5600,
  K: 4400,
  M: 3200,
  L: 1900,
  T: 1100,
};

/**
 * A star's display colour: from measured temperature if known, otherwise from
 * the spectral letter, otherwise null. A colour approximation, not an image.
 */
export function starColor(kelvin: number | null, spectralType: string | null) {
  const fromType = spectralType ? SPECTRAL_TEMPERATURE[spectralType.trim()[0]] : undefined;
  const temperature = kelvin ?? fromType;
  return temperature ? starColorFromTemperature(temperature) : null;
}

/** Approximate colour of a star's light. Tanner Helland's blackbody fit. */
export function starColorFromTemperature(kelvin: number | null | undefined): string {
  if (!kelvin) return "#fff4e6";
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  const red = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.133;
  const green =
    t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const hex = (value: number) =>
    Math.round(Math.min(Math.max(value, 0), 255))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(red)}${hex(green)}${hex(blue)}`;
}

function choosePreset(input: PlanetVisualInput): { preset: VisualPreset; basis: string[] } {
  const { radiusEarth: radius, massEarth: mass, densityGcm3: density } = input;
  const temp = input.equilibriumTempK;

  if (input.classification) {
    return { preset: input.classification, basis: ["its classification"] };
  }

  const basis: string[] = [];
  if (radius != null) basis.push(`radius of ${radius} Earths`);
  else if (mass != null) {
    basis.push(`${input.massIsMinimum ? "minimum mass" : "mass"} of ${mass} Earths`);
  }
  else return { preset: "unknown", basis: ["no known size or mass"] };

  const isGiant = radius != null ? radius >= 6 : (mass as number) >= 50;
  const isMidSized =
    radius != null ? radius >= 2 : (mass as number) >= 10;

  if (isGiant) return { preset: "gas-giant", basis };
  if (isMidSized) {
    if (density != null) basis.push(`density of ${density.toFixed(1)} g/cm³`);
    return { preset: "ice-giant", basis };
  }

  if (temp != null) basis.push(`temperature of ${temp} K`);
  if (temp != null && temp >= 800) return { preset: "hot-rocky", basis };
  if (temp != null && temp < 200) return { preset: "frozen", basis };
  return { preset: "rocky", basis };
}

export function resolvePlanetVisual(input: PlanetVisualInput): PlanetVisual {
  const seed = seedFromName(input.name);
  const { preset, basis } =
    input.referenceBody === "earth"
      ? { preset: "earth" as const, basis: ["its status as a known reference body"] }
      : input.referenceBody === "jupiter"
        ? { preset: "gas-giant" as const, basis: ["its status as a known reference body"] }
        : choosePreset(input);
  const variants = PALETTES[preset];
  const isHotGiant = preset === "gas-giant" && (input.equilibriumTempK ?? 0) >= 1000;
  const palette =
    input.referenceBody === "jupiter"
      ? JUPITER_PALETTE
      : isHotGiant
        ? HOT_GIANT_PALETTE
        : variants[Math.floor(seed * variants.length) % variants.length];
  const [atmosphereColor, atmosphereStrength, atmosphereScale] = ATMOSPHERE[preset];
  const isSolid = preset === "rocky" || preset === "frozen" || preset === "hot-rocky";

  return {
    preset,
    presetLabel: PRESET_LABEL[preset],
    seed,
    palette,
    atmosphereColor: isHotGiant ? "#ffb070" : atmosphereColor,
    atmosphereStrength,
    atmosphereScale,
    cloudAmount: CLOUD_AMOUNT[preset],
    cloudColor: preset === "ice-giant" ? "#eefcff" : "#f2eee8",
    bumpStrength: isSolid ? 7 : preset === "unknown" || preset === "earth" ? 3 : 0.6,
    specular: preset === "frozen" ? 0.5 : preset === "ice-giant" ? 0.18 : 0.06,
    lava: preset === "hot-rocky" ? 1 : 0,
    spinRate: 0.05 + seed * 0.05,
    tiltRadians: (seed - 0.5) * 0.7,
    starLightColor: starColorFromTemperature(input.starTempK),
    basis,
  };
}
