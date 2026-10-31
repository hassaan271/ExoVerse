import { formatValue } from "@/lib/format";
import type { SortKey } from "@/lib/filterPlanets";
import type { PlanetSummary, SystemSummary } from "@/types/planet";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./SystemList.module.css";

const count = (total: number) => (total === 1 ? "1 planet" : `${total} planets`);

export function FeaturedSystemList({
  systems,
  selectedId,
  onSelect,
}: {
  systems: SystemSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className={styles.list}>
      <LiquidIndicator as="li" />
      {systems.map((system) => (
        <li key={system.id}>
          <button
            type="button"
            className={styles.row}
            aria-pressed={system.id === selectedId}
            onClick={() => onSelect(system.id)}
          >
            <span className={styles.name}>{system.hostname}</span>
            <span className={styles.detail}>{count(system.planets.length)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function sortDetail(planet: PlanetSummary, sort: SortKey) {
  if (sort === "distance") return formatValue(planet.distanceLy, "light-years");
  if (sort === "radius") return formatValue(planet.radiusEarth, "× Earth");
  if (sort === "temperature") return formatValue(planet.temperatureK, "K");
  if (sort === "year") return planet.year ?? "Not available";
  return planet.sizeClass;
}

/** Only the visible page is in the DOM, however long the result list is. */
export function PlanetList({
  planets,
  sort,
  selectedSystemId,
  onSelect,
}: {
  planets: PlanetSummary[];
  sort: SortKey;
  selectedSystemId: string;
  onSelect: (systemId: string) => void;
}) {
  return (
    <ul className={styles.list}>
      <LiquidIndicator as="li" />
      {planets.map((planet) => (
        <li key={planet.id}>
          <button
            type="button"
            className={styles.row}
            aria-pressed={planet.systemId === selectedSystemId}
            onClick={() => onSelect(planet.systemId)}
          >
            <span className={styles.name}>{planet.name}</span>
            <span className={styles.detail}>
              {planet.hostname}, {sortDetail(planet, sort)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
