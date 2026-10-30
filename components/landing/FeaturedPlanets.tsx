import Link from "next/link";
import { PlanetPortrait } from "@/components/planet/PlanetPortrait";
import { describePlanet } from "@/lib/planetSummary";
import type { PlanetSummary } from "@/types/planet";
import styles from "./FeaturedPlanets.module.css";

export function FeaturedPlanets({ planets }: { planets: PlanetSummary[] }) {
  return (
    <section className={styles.section} aria-labelledby="featured-title">
      <div className={styles.intro}>
        <h2 id="featured-title" className={styles.title}>
          Featured planetary systems
        </h2>
        <p className={styles.note}>
          Measurements are from the NASA Exoplanet Archive. Images are artistic
          visualizations, not photographs.
        </p>
      </div>

      <ul className={styles.grid}>
        {planets.map((planet) => (
          <li key={planet.id} className={`glass ${styles.card}`}>
            <PlanetPortrait planet={planet} className={styles.portrait} />
            <div className={styles.body}>
              <h3 className={styles.name}>{planet.hostname}</h3>
              <p className={styles.meta}>
                {planet.name}, {planet.sizeClass}
              </p>
              <p className={styles.summary}>{describePlanet(planet)}</p>
              <Link
                href={`/explore/systems/${planet.systemId}`}
                className={`button button-secondary ${styles.link}`}
                aria-label={`Explore the ${planet.hostname} system`}
              >
                Explore system
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
