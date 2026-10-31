export const UNKNOWN = "Not available";

/** Readable, not falsely precise. The full value stays in the record. */
function roundDistance(lightYears: number) {
  const rounded = lightYears < 100 ? Number(lightYears.toFixed(1)) : Number(lightYears.toPrecision(3));
  return rounded.toLocaleString("en-US");
}

export interface DistanceText {
  value: string;
  detail: string | null;
}

/**
 * sy_dist is the distance to the system, so every planet there shares it.
 * Light-years were converted once, in the catalog build, and are only rounded here.
 */
export function formatDistance(
  lightYears: number | null,
  parsecs: number | null,
  uncertainty: { upper: number | null; lower: number | null } | null,
): DistanceText {
  if (lightYears === null || parsecs === null) {
    return { value: "Distance currently unavailable", detail: null };
  }
  const range =
    uncertainty && uncertainty.upper !== null && uncertainty.lower !== null
      ? ` (+${uncertainty.upper.toLocaleString("en-US", { maximumSignificantDigits: 3 })} / ${uncertainty.lower.toLocaleString("en-US", { maximumSignificantDigits: 3 }).replace("-", "−")})`
      : "";
  return {
    value: `Approximately ${roundDistance(lightYears)} light-years`,
    detail: `${parsecs.toLocaleString("en-US", { maximumFractionDigits: 3 })} parsecs${range}`,
  };
}

const SINGULAR: Record<string, string> = {
  "Earth radii": "Earth radius",
  "Earth masses": "Earth mass",
  "light-years": "light-year",
  days: "day",
};

export function formatValue(
  value: number | null | undefined,
  unit: string,
  limit?: "upper" | "lower",
): string {
  if (value === null || value === undefined) return UNKNOWN;
  const prefix = limit === "upper" ? "< " : limit === "lower" ? "> " : "";
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const label = value === 1 ? (SINGULAR[unit] ?? unit) : unit;
  return `${prefix}${number}${label ? ` ${label}` : ""}`;
}
