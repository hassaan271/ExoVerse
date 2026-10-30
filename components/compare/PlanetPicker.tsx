"use client";

import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { filterPlanets, NO_FILTERS } from "@/lib/filterPlanets";
import type { PlanetSummary } from "@/types/planet";
import styles from "./PlanetPicker.module.css";

const MAX_RESULTS = 8;

/** A searchable combobox over the whole catalog. */
export function PlanetPicker({
  label,
  planets,
  selected,
  onSelect,
}: {
  label: string;
  planets: PlanetSummary[];
  selected: PlanetSummary;
  onSelect: (planet: PlanetSummary) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);

  const results = useMemo(
    () =>
      deferred.trim()
        ? filterPlanets(planets, { ...NO_FILTERS, query: deferred }).slice(0, MAX_RESULTS)
        : [],
    [planets, deferred],
  );

  const choose = (planet: PlanetSummary) => {
    onSelect(planet);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className={styles.picker}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.field}>
        <Icon name="search" size={18} />
        <input
          ref={input}
          id={id}
          className="field"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={selected.name}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              choose(results[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>

      {open && deferred.trim() !== "" && (
        <ul id={`${id}-list`} role="listbox" className={`glass ${styles.list}`}>
          {results.map((planet, index) => (
            <li
              key={planet.id}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              // Fires before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(planet);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{planet.name}</span>
              <span className={styles.host}>{planet.hostname}</span>
            </li>
          ))}
          {results.length === 0 && <li className={styles.none}>No planets match.</li>}
        </ul>
      )}
    </div>
  );
}
