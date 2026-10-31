import Link from "next/link";
import {
  explain,
  type HabitabilityPlanet,
  type HabitabilitySystem,
  INDICATOR_COUNT,
  indicators,
  ZONE_LABEL,
} from "@/lib/habitability";
import styles from "./HabitabilityAssessment.module.css";

const au = (value: number) => `${value.toLocaleString("en-US", { maximumSignificantDigits: 3 })} AU`;

/** Works on the server and in the system panel: it only reads prepared results. */
export function HabitabilityAssessment({
  planet,
  system,
  compact = false,
}: {
  planet: HabitabilityPlanet;
  system: HabitabilitySystem | null;
  compact?: boolean;
}) {
  const zone = system?.zone ?? null;

  return (
    <section className={styles.section} aria-label="Habitability assessment">
      <h2 className={styles.title}>Habitability assessment</h2>
      <p className={styles.zone} data-zone={planet.zone}>{ZONE_LABEL[planet.zone]}</p>
      <p className={styles.explain}>{explain(planet, system ?? undefined)}</p>

      <dl className={styles.facts}>
        {zone && (
          <>
            <div>
              <dt>Conservative zone{system?.indicative ? " (indicative)" : ""}</dt>
              <dd>{au(zone.conservativeInner)} to {au(zone.conservativeOuter)}</dd>
            </div>
            <div>
              <dt>Optimistic zone{system?.indicative ? " (indicative)" : ""}</dt>
              <dd>{au(zone.optimisticInner)} to {au(zone.optimisticOuter)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Distance from the star</dt>
          <dd>
            {planet.semiMajorAxis === null ? "Not available" : au(planet.semiMajorAxis)}
            {planet.semiMajorAxisSource === "derived" ? " (calculated)" : ""}
            {planet.periastron !== null && planet.eccentricity !== 0
              ? `, ranging ${au(planet.periastron)} to ${au(planet.apastron as number)}`
              : ""}
          </dd>
        </div>
        {!compact &&
          indicators(planet).map((indicator) => (
            <div key={indicator.key}>
              <dt>{indicator.label}: {indicator.status.toLowerCase()}</dt>
              <dd>
                {indicator.value}
                <span className={styles.note}>{indicator.note}</span>
              </dd>
            </div>
          ))}
        <div>
          <dt>Data completeness</dt>
          <dd>{planet.completeness} of {INDICATOR_COUNT} inputs available</dd>
        </div>
      </dl>

      <p className={styles.note}>
        A screening of orbit and starlight only. It doesn't show that this planet has an
        atmosphere, water or life.{" "}
        <Link href="/habitability#method">How this works</Link>
      </p>
    </section>
  );
}
