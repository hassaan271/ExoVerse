import Link from "next/link";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { SampleDataNote } from "@/components/shared/SampleDataNote";
import { formatValue, UNKNOWN } from "@/lib/format";
import { getPlanetVisual } from "@/lib/planet-visuals/forPlanet";
import { planetFactGroups } from "@/lib/planetFacts";
import { describePlanet, toPlanetSummary } from "@/lib/planetSummary";
import type { PlanetRecord, Reference, SystemRecord } from "@/types/planet";
import { FactList } from "./FactList";
import styles from "./PlanetDashboard.module.css";
import { PlanetViewer } from "./PlanetViewer";

function KeyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className={`glass ${styles.figure}`}>
      <p className={styles.figureLabel}>{label}</p>
      <p className={styles.figureValue} data-unknown={value === UNKNOWN || undefined}>
        {value === UNKNOWN ? value : <AnimatedNumber value={value} />}
      </p>
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
}: {
  planet: PlanetRecord;
  system: SystemRecord | undefined;
  siblings: PlanetRecord[];
}) {
  const summary = toPlanetSummary(planet);
  const visual = getPlanetVisual(summary);
  const { limits, planet_reference, star_reference, system_reference } = planet.provenance;
  const { discovery, status, physical, climate } = planet;

  return (
    <div className={styles.dashboard}>
      <div className={styles.stage}>
        <PlanetViewer planet={summary} />
      </div>

      <div className={styles.details}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href={`/explore?system=${planet.system_id}`}>Galaxy</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/explore/systems/${planet.system_id}`}>{planet.hostname}</Link>
        </nav>

        <header>
          <h1 className={styles.name}>{planet.pl_name}</h1>
          <p className={styles.host}>
            {planet.size_class} orbiting {planet.hostname}
          </p>
          <p className={styles.summary}>{describePlanet(summary)}</p>
        </header>

        <Link href={`/compare?mode=earth&a=${planet.id}`} className={`button button-secondary ${styles.compare}`}>
          Compare with Earth
        </Link>

        {status.controversial && (
          <p className={styles.warning}>
            NASA flags this planet as controversial: its existence or properties are
            disputed in the published literature.
          </p>
        )}
        {status.solution_type && status.solution_type !== "Published Confirmed" && (
          <p className={styles.warning}>Solution type: {status.solution_type}.</p>
        )}

        <div className={styles.figures}>
          <KeyFigure
            label="Radius"
            value={formatValue(physical.radius_earth, "× Earth", limits["physical.radius"])}
          />
          <KeyFigure
            label={physical.mass_provenance === "Mass" ? "Mass" : "Minimum mass"}
            value={formatValue(physical.mass_earth, "× Earth", limits["physical.mass"])}
          />
          <KeyFigure
            label="Temperature"
            value={formatValue(
              climate.equilibrium_temperature_kelvin,
              "K",
              limits["climate.equilibrium_temperature"],
            )}
          />
          <KeyFigure
            label="Density"
            value={formatValue(
              physical.density ?? physical.density_calculated,
              "g/cm³",
              limits["physical.density"],
            )}
          />
        </div>

        {planetFactGroups(planet).map((group) => (
          <section key={group.title} className={styles.group}>
            <h2 className={styles.groupTitle}>{group.title}</h2>
            <FactList facts={group.facts} />
          </section>
        ))}

        <section className={styles.group}>
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

        <section className={styles.group}>
          <h2 className={styles.groupTitle}>About this image</h2>
          <SampleDataNote>
            Artistic visualization, not an observation of {planet.pl_name}. It uses the{" "}
            {visual.presetLabel.toLowerCase()} preset, chosen from {visual.basis.join(", ")}.
            Surface, clouds and atmosphere are invented.
          </SampleDataNote>
        </section>

        {siblings.length > 1 && (
          <nav aria-label={`Other planets of ${planet.hostname}`} className={styles.group}>
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
