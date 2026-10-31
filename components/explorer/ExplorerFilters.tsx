import { Icon } from "@/components/shared/Icon";
import {
  DISTANCE_OPTIONS,
  type PlanetFilters,
  SIZE_CLASSES,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  type SortKey,
  TEMPERATURE_OPTIONS,
} from "@/lib/filterPlanets";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./ExplorerFilters.module.css";

interface ExplorerFiltersProps {
  filters: PlanetFilters;
  methods: string[];
  sort: SortKey;
  onChange: (filters: PlanetFilters) => void;
  onSortChange: (sort: SortKey) => void;
}

export function ExplorerFilters({
  filters,
  methods,
  sort,
  onChange,
  onSortChange,
}: ExplorerFiltersProps) {
  const selects = [
    { key: "size", label: "Planet radius", options: SIZE_OPTIONS },
    { key: "temperature", label: "Temperature", options: TEMPERATURE_OPTIONS },
    { key: "distance", label: "Distance from Earth", options: DISTANCE_OPTIONS },
    {
      key: "method",
      label: "Discovery method",
      options: methods.map((method) => ({ value: method, label: method })),
    },
  ] as const;

  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        <span className="visually-hidden">Search by planet or host star name</span>
        <Icon name="search" size={18} />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Search planets or stars"
          autoComplete="off"
          className="field"
        />
      </label>

      <div className={styles.categories} role="group" aria-label="Size class">
        <LiquidIndicator />
        {SIZE_CLASSES.map((sizeClass) => (
          <button
            key={sizeClass}
            type="button"
            className={styles.chip}
            aria-pressed={filters.sizeClass === sizeClass}
            onClick={() =>
              onChange({
                ...filters,
                sizeClass: filters.sizeClass === sizeClass ? "" : sizeClass,
              })
            }
          >
            {sizeClass}
          </button>
        ))}
      </div>

      <details className={styles.more}>
        <summary>Filters and sorting</summary>
        {selects.map(({ key, label, options }) => (
          <label key={key} className={styles.select}>
            <span>{label}</span>
            <select
              value={filters[key]}
              onChange={(event) => onChange({ ...filters, [key]: event.target.value })}
              className="field"
            >
              <option value="">Any</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className={styles.select}>
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="field"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
}
