import type { CSSProperties } from "react";
import Link from "next/link";
import { SelectionReporter } from "@/components/ai/SelectionReporter";
import { HabitabilityAssessment } from "@/components/habitability/HabitabilityAssessment";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { SampleDataNote } from "@/components/shared/SampleDataNote";
import { formatDistance, formatValue, UNKNOWN } from "@/lib/format";
import type { HabitabilityPlanet, HabitabilitySystem } from "@/lib/habitability";
import { getPlanetVisual } from "@/lib/planet-visuals/forPlanet";
import { planetFactGroups } from "@/lib/planetFacts";
import { describePlanet, toPlanetSummary } from "@/lib/planetSummary";
import { EARTH } from "@/lib/referenceBodies";
import type { PlanetRecord, Reference, SystemRecord } from "@/types/planet";
import { FactList } from "./FactList";
import styles from "./PlanetDashboard.module.css";
import { PlanetViewer } from "./PlanetViewer";

/** Matches the details column, which the planet is framed against. */
const DETAILS_WIDTH = 576;

/** How far along its gauge a planet sits, beside the notch for Earth's own value. */
interface Gauge {
  planet: number;
  earth: number;
}

const clampShare = (share: number) => Math.min(Math.max(share, 0.015), 1);

function linearGauge(value: number | null, earth: number, max: number): Gauge | undefined {
  if (value === null) return undefined;
  return { planet: clampShare(value / max), earth: earth / max };
}

/** Planets span orders of magnitude, so size and mass read on a log scale. */
function logGauge(value: number | null, earth: number, min: number, max: number): Gauge | undefined {
  if (value === null || value <= 0) return undefined;
  const share = (of: number) => Math.log(of / min) / Math.log(max / min);
  return { planet: clampShare(share(value)), earth: share(earth) };
}

function KeyFigure({ label, value, gauge }: { label: string; value: string; gauge?: Gauge }) {
  return (
    <div className={`well ${styles.figure}`}>
      <p className={styles.figureLabel}>{label}</p>
      <p className={styles.figureValue} data-unknown={value === UNKNOWN || undefined}>
        {value === UNKNOWN ? value : <AnimatedNumber value={value} />}
      </p>
      {gauge && (
        <div
          className={styles.gauge}
          aria-hidden="true"
          style={{ "--planet": gauge.planet, "--earth": gauge.earth } as CSSProperties}
        />
      )}
    </div>
  );
}

function Citation({ label, reference }: { label: string; reference: Reference | null }) {
  if (!reference) return null;
  return (
    <li>
      {label}:{" "}
      {reference.url ? <a href={reference.url}>{reference.text}</a> : reference.text}
    </li>
  );
}

export function PlanetDashboard({
  planet,
  system,
  siblings,
  observatoryId,
  habitability,
  systemHabitability,
}: {
  planet: PlanetRecord;
  system: SystemRecord | undefined;
  siblings: PlanetRecord[];
  observatoryId: string | null;
  habitability: HabitabilityPlanet | null;
  systemHabitability: HabitabilitySystem | null;
}) {
  const summary = toPlanetSummary(planet);
  const visual = getPlanetVisual(summary);
  const { limits, planet_reference, star_reference, system_reference } = planet.provenance;
  const { discovery, status, physical, climate } = planet;
  const distance = formatDistance(
    planet.location.distance_light_years,
    planet.location.distance_parsecs,
    planet.uncertainties.distance_parsecs,
  );

  const density = physical.density ?? physical.density_calculated;

  return (
    <div className={styles.dashboard}>
      <SelectionReporter planetId={planet.id} systemId={planet.system_id} />
      <div className={styles.stage}>
        <PlanetViewer planet={summary} clearRight={DETAILS_WIDTH} />
      </div>

      <div className={styles.details}>
        <header className={`glass liquid-in ${styles.hero}`}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href={`/explore?system=${planet.system_id}`}>Galaxy</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/explore/systems/${planet.system_id}`}>{planet.hostname}</Link>
          </nav>
          <h1 className={styles.name}>{planet.pl_name}</h1>
          <p className={styles.host}>
            {planet.size_class} orbiting {planet.hostname}
          </p>
          <p className={styles.summary}>{describePlanet(summary)}</p>
          <div className={styles.actions}>
            <Link href={`/compare?mode=earth&a=${planet.id}`} className="button button-primary">
              Compare with Earth
            </Link>
            {observatoryId && (
              <Link href={`/observatories?id=${observatoryId}`} className="button button-secondary">
                See {discovery.facility}
              </Link>
            )}
          </div>
        </header>

        {status.controversial && (
          <p className={`plate ${styles.warning}`}>
            NASA flags this planet as controversial: its existence or properties are
            disputed in the published literature.
          </p>
        )}
        {status.solution_type !== "Published Confirmed" && (
          <p className={`plate ${styles.warning}`}>
            Confirmed planet. NASA's default values for it come from an earlier
            candidate-stage solution ({status.solution_type ?? "type not given"}).
          </p>
        )}

        <section className={`glass liquid-in ${styles.readout}`} aria-label="Key measurements">
          <div className={`well ${styles.distance}`}>
            <p className={styles.figureLabel}>Distance from Earth</p>
            <p className={styles.distanceValue}>{distance.value}</p>
            {distance.detail && <p className={styles.distanceDetail}>{distance.detail}</p>}
            <p className={styles.distanceDetail}>
              Distance to the {planet.hostname} planetary system, not a separate measurement
              of this planet.
            </p>
          </div>
          <KeyFigure
            label="Radius"
            value={formatValue(physical.radius_earth, "× Earth", limits["physical.radius"])}
            gauge={limits["physical.radius"] ? undefined : logGauge(physical.radius_earth, EARTH.radiusEarth!, 0.3, 30)}
          />
          <KeyFigure
            label={physical.mass_provenance === "Mass" ? "Mass" : "Minimum mass"}
            value={formatValue(physical.mass_earth, "× Earth", limits["physical.mass"])}
            gauge={limits["physical.mass"] ? undefined : logGauge(physical.mass_earth, EARTH.massEarth!, 0.1, 15000)}
          />
          <KeyFigure
            label="Equilibrium temperature"
            value={formatValue(
              climate.equilibrium_temperature_kelvin,
              "K",
              limits["climate.equilibrium_temperature"],
            )}
            gauge={
              limits["climate.equilibrium_temperature"]
                ? undefined
                : linearGauge(climate.equilibrium_temperature_kelvin, EARTH.temperatureK!, 3000)
            }
          />
          <KeyFigure
            label="Density"
            value={formatValue(density, "g/cm³", limits["physical.density"])}
            gauge={limits["physical.density"] ? undefined : linearGauge(density, EARTH.density!, 25)}
          />
          <p className={styles.gaugeNote}>The notch on each gauge marks Earth.</p>
        </section>

        {habitability && (
          <div className={`plate ${styles.tile}`}>
            <HabitabilityAssessment planet={habitability} system={systemHabitability} />
          </div>
        )}

        {planetFactGroups(planet).map((group) => (
          <section key={group.title} className={`plate ${styles.tile}`}>
            <h2 className={styles.groupTitle}>{group.title}</h2>
            <FactList facts={group.facts} />
          </section>
        ))}

        <section className={`plate ${styles.tile}`}>
          <h2 className={styles.groupTitle}>Sources</h2>
          <ul className={styles.sources}>
            <Citation label="Planet parameters" reference={planet_reference} />
            <Citation label="Stellar parameters" reference={star_reference} />
            <Citation label="System parameters" reference={system_reference} />
            <Citation label="Discovery" reference={discovery.reference} />
          </ul>
          <p className={styles.note}>
            Values come from the NASA Exoplanet Archive, using NASA's default parameter
            set for this planet ({planet.provenance.nasa_row_count}{" "}
            {planet.provenance.nasa_row_count === 1 ? "publication" : "publications"} on
            record, last updated {planet.provenance.last_update ?? "date not available"}).
          </p>
        </section>

        <section className={`plate ${styles.tile}`}>
          <h2 className={styles.groupTitle}>About this image</h2>
          <SampleDataNote>
            Artistic visualization, not an observation of {planet.pl_name}. It uses the{" "}
            {visual.presetLabel.toLowerCase()} preset, chosen from {visual.basis.join(", ")}.
            Surface, clouds and atmosphere are invented.
          </SampleDataNote>
        </section>

        {siblings.length > 1 && (
          <nav aria-label={`Other planets of ${planet.hostname}`} className={`plate ${styles.tile}`}>
            <h2 className={styles.groupTitle}>Other planets here</h2>
            <ul className={styles.siblings}>
              {siblings
                .filter((sibling) => sibling.id !== planet.id)
                .map((sibling) => (
                  <li key={sibling.id}>
                    <Link href={`/planets/${sibling.id}`}>{sibling.pl_name}</Link>
                  </li>
                ))}
            </ul>
          </nav>
        )}

        {system && system.planets_in_catalog !== system.nasa_sy_pnum && (
          <p className={styles.note}>
            NASA counts {system.nasa_sy_pnum} planets in this system, and this catalog
            holds {system.planets_in_catalog}.
          </p>
        )}
      </div>
    </div>
  );
}
