export const UNKNOWN = "Not available";

export function formatValue(
  value: number | null | undefined,
  unit: string,
  limit?: "upper" | "lower",
): string {
  if (value === null || value === undefined) return UNKNOWN;
  const prefix = limit === "upper" ? "< " : limit === "lower" ? "> " : "";
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return `${prefix}${number}${unit ? ` ${unit}` : ""}`;
}
