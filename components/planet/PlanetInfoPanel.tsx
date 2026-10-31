import { FactList } from "@/components/planet/FactList";
import { planetFactGroups } from "@/lib/planetFacts";
import type { PlanetRecord } from "@/types/planet";
import styles from "./PlanetInfoPanel.module.css";

/** The compact panel. It fills itself from any catalog record. */
export function PlanetInfoPanel({ planet }: { planet: PlanetRecord }) {
  return (
    <article className={`fade-in ${styles.panel}`} aria-labelledby={`${planet.id}-title`}>
      <header>
        <h2 id={`${planet.id}-title`} className={styles.name}>
          {planet.pl_name}
        </h2>
        <p className={styles.category}>
          {planet.size_class} orbiting {planet.hostname}
        </p>
      </header>

      {planetFactGroups(planet).map((group) => (
        <FactList key={group.title} facts={group.facts} />
      ))}
    </article>
  );
}
