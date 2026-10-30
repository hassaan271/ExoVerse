import Link from "next/link";
import { PlanetPortrait } from "@/components/planet/PlanetPortrait";
import type { PlanetSummary } from "@/types/planet";
import styles from "./PlanetRows.module.css";

/** A system's planets. With `onSelect` they pick; otherwise they link out. */
export function PlanetRows({
  planets,
  selectedId,
  onSelect,
}: {
  planets: PlanetSummary[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className={styles.rows}>
      {planets.map((planet) => {
        const content = (
          <>
            <PlanetPortrait planet={planet} className={styles.portrait} />
            <span className={styles.text}>
              <span className={styles.name}>{planet.name}</span>
              <span className={styles.category}>{planet.sizeClass}</span>
            </span>
          </>
        );
        return (
          <li key={planet.id}>
            {onSelect ? (
              <button
                type="button"
                className={styles.row}
                aria-pressed={planet.id === selectedId}
                onClick={() => onSelect(planet.id)}
              >
                {content}
              </button>
            ) : (
              <Link href={`/planets/${planet.id}`} className={styles.row}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
