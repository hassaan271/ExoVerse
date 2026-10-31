"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SceneLoading } from "@/components/explorer/SceneFallback";
import { clearSelection, reportSelection } from "@/lib/ai/appContext";
import {
  type HabitabilityPlanet,
  type HabitabilitySystem,
  HZ_MODEL,
  type HzZone,
  INDICATOR_COUNT,
  REASON_TEXT,
  ZONE_LABEL,
  ZONE_ORDER,
} from "@/lib/habitability";
import { type HabitabilityData, useHabitability } from "@/lib/habitabilityData";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./HabitabilityExplorer.module.css";

const PAGE_SIZE = 40;
const STAR_CLASSES = ["B or hotter", "A", "F", "G", "K", "M or cooler"];

type SortKey = "zone" | "flux" | "radius" | "temperature" | "completeness";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "zone", label: "Habitable-zone position" },
  { value: "flux", label: "Closest to Earth's stellar flux" },
  { value: "radius", label: "Planet radius" },
  { value: "temperature", label: "Equilibrium temperature" },
  { value: "completeness", label: "Data completeness" },
];

const format = (value: number | null, unit: string, digits = 3) =>
  value === null ? "Not available" : `${value.toLocaleString("en-US", { maximumSignificantDigits: digits })}${unit}`;

/** Missing values sort last, whichever way the list runs. */
const ascending = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;

function comparator(sort: SortKey) {
  const rank = (planet: HabitabilityPlanet) => ZONE_ORDER.indexOf(planet.zone);
  const flux = (planet: HabitabilityPlanet) =>
    planet.insolation === null ? null : Math.abs(Math.log(planet.insolation));
  return (a: HabitabilityPlanet, b: HabitabilityPlanet) => {
    if (sort === "flux") return ascending(flux(a), flux(b));
    if (sort === "radius") return ascending(a.radiusEarth, b.radiusEarth);
    if (sort === "temperature") return ascending(a.equilibriumK, b.equilibriumK);
    if (sort === "completeness") return b.completeness - a.completeness;
    return rank(a) - rank(b) || b.completeness - a.completeness;
  };
}

function PlanetRow({ planet }: { planet: HabitabilityPlanet }) {
  return (
    <li className={styles.planet}>
      <Link href={`/planets/${planet.id}`} className={styles.planetName}>{planet.name}</Link>
      <span className={styles.zone} data-zone={planet.zone}>{ZONE_LABEL[planet.zone]}</span>
      <span className={styles.values}>
        {format(planet.radiusEarth, " R⊕")}, {format(planet.insolation, " S⊕")},{" "}
        {planet.equilibriumK === null ? "Teq not available" : `Teq ${format(planet.equilibriumK, " K", 4)}`},{" "}
        {planet.completeness} of {INDICATOR_COUNT} inputs
      </span>
      {planet.reasons.length > 0 && (
        <span className={styles.reasons}>
          {planet.reasons.map((reason) => REASON_TEXT[reason]).join(" ")}
        </span>
      )}
    </li>
  );
}

function SystemCard({
  system,
  planets,
  open = false,
}: {
  system: HabitabilitySystem;
  planets: HabitabilityPlanet[];
  open?: boolean;
}) {
  const { counts } = system;
  const zoneText = system.zone
    ? `Conservative ${system.zone.conservativeInner.toPrecision(3)} to ${system.zone.conservativeOuter.toPrecision(3)} AU${system.indicative ? " (indicative)" : ""}`
    : "Zone not calculable";

  return (
    <li className={styles.system}>
      <details open={open}>
        <summary className={styles.summary}>
          <span className={styles.systemName}>{system.hostname}</span>
          <span className={styles.meta}>
            {system.planets} confirmed {system.planets === 1 ? "planet" : "planets"},{" "}
            {system.candidates} candidates. {format(system.teff, " K", 4)},{" "}
            {system.logLuminosity === null
              ? "luminosity not available"
              : `${format(10 ** system.logLuminosity, " L☉")}${system.luminositySource === "derived" ? " (calculated)" : ""}`}
            . {zoneText}.
          </span>
          <span className={styles.counts}>
            <span>{counts.conservative} conservative</span>
            <span>{counts.optimistic} optimistic only</span>
            <span>{counts.outside} outside</span>
            <span>{counts.uncertain} uncertain</span>
            <span>{counts.insufficient} can't be assessed</span>
            <span>{Math.round(system.completeness * 100)}% data complete</span>
          </span>
        </summary>
        <ul className={styles.planets}>
          {planets.map((planet) => <PlanetRow key={planet.id} planet={planet} />)}
        </ul>
        <Link href={`/explore/systems/${system.id}`} className="button button-secondary">
          Open 3D system
        </Link>
      </details>
    </li>
  );
}

function Method({ data }: { data: HabitabilityData }) {
  const { summary } = data;
  return (
    <details id="method" className={`plate ${styles.method}`}>
      <summary className={styles.methodTitle}>How this works, and what it can't tell you</summary>
      <div className={styles.methodBody}>
        <p>
          This is a first-order screen of orbit and starlight. A planet inside a habitable
          zone is not known to be habitable, and nothing here shows liquid water, an
          atmosphere or life. NASA's TOI-789 c catalog page gives planet data but no
          habitable-zone classification, so these results are ExoVerse's own calculation
          and are not NASA products.
        </p>
        <h3>Source</h3>
        <p>
          NASA Exoplanet Archive, {summary.source.table} table, retrieved {summary.source.retrieved},{" "}
          {summary.source.rows.toLocaleString("en-US")} rows, using each planet's default row.
          Blank values may be filled from another publication for the same planet, recorded
          on the planet page. A published limit is never used as a measurement.
        </p>
        <h3>Model</h3>
        <p>
          <a href={summary.model.url} target="_blank" rel="noreferrer">{summary.model.citation}</a>,
          for a 1 Earth-mass planet. S_eff = S_sun + aT + bT² + cT³ + dT⁴, with T = Teff − {HZ_MODEL.solarTeff} K,
          and r = √(L / S_eff) AU. Conservative zone: Runaway Greenhouse to Maximum Greenhouse.
          Optimistic zone: Recent Venus to Early Mars. The model assumes an Earth-like planet with
          an H₂O and CO₂ atmosphere, and it says nothing about tidal locking, stellar activity
          or a planet's composition.
        </p>
        <h3>Fields used</h3>
        <p>
          st_teff, st_lum, st_rad, st_mass, pl_orbsmax, pl_orbper, pl_orbeccen, pl_insol, pl_eqt,
          pl_rade, pl_bmasse, their uncertainties and limit flags, cb_flag, and the spectra counts
          pl_ntranspec, pl_nespec and pl_ndispec.
        </p>
        <h3>How a planet is classified</h3>
        <ul>
          <li>Its semi-major axis is compared with four boundaries for its star. All planets of a host share one star value, using the value most often published across them.</li>
          <li>If its eccentric orbit, or any published uncertainty, reaches a boundary, it's uncertain rather than forced into a class.</li>
          <li>Stars outside {summary.model.minTeff} K to {summary.model.maxTeff} K are out of the model's range. Their boundaries are indicative, and their planets are uncertain.</li>
          <li>Planets orbiting two stars can't be assessed with this single-star model.</li>
          <li>If NASA's listed insolation conflicts with L/a² by more than a factor of two, the inputs disagree and the planet stays uncertain.</li>
          <li>Missing data never counts against a planet.</li>
          <li>There is no combined score, because no single number could be defended.</li>
        </ul>
        <h3>Calculated inputs</h3>
        <p>
          NASA's luminosity covers {summary.luminosity.nasa.toLocaleString("en-US")} systems. For{" "}
          {summary.luminosity.derived.toLocaleString("en-US")} more it's calculated from the star's radius
          and temperature, and {summary.luminosity.none.toLocaleString("en-US")} have neither. A missing
          semi-major axis is calculated from the period and star mass where possible. Calculated inputs are
          labelled on each planet.
        </p>
        <h3>Candidates</h3>
        <p>
          The Planetary Systems table lists confirmed planets, so candidate counts are zero here.
          Some planets' default values come from a candidate-stage solution. They're confirmed
          planets, and the filter below lets you exclude them.
        </p>
      </div>
    </details>
  );
}

function Explorer({ data }: { data: HabitabilityData }) {
  const { summary, systems, planets } = data;
  const [view, setView] = useState<"systems" | "planets">("systems");
  const [zone, setZone] = useState<HzZone | "all">("conservative");
  const [starType, setStarType] = useState("");
  const [query, setQuery] = useState("");
  const [radiusMax, setRadiusMax] = useState("");
  const [radiusMin, setRadiusMin] = useState("");
  const [tempMin, setTempMin] = useState("");
  const [tempMax, setTempMax] = useState("");
  const [includeCandidateStage, setIncludeCandidateStage] = useState(true);
  const [sort, setSort] = useState<SortKey>("zone");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const systemById = useMemo(() => new Map(systems.map((system) => [system.id, system])), [systems]);
  const planetsById = useMemo(() => new Map(planets.map((planet) => [planet.id, planet])), [planets]);

  // A link from the AI or elsewhere can open one planet's or system's results.
  const params = useSearchParams();
  const focusPlanet = planetsById.get(params.get("planet") ?? "") ?? null;
  const focusSystem = systemById.get(focusPlanet?.systemId ?? params.get("system") ?? "") ?? null;

  useEffect(() => {
    if (!focusSystem) return;
    reportSelection({ planetId: focusPlanet?.id ?? null, systemId: focusSystem.id });
    return clearSelection;
  }, [focusPlanet, focusSystem]);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    const within = (value: number | null, low: string, high: string) => {
      if (low === "" && high === "") return true;
      if (value === null) return false;
      return (low === "" || value >= Number(low)) && (high === "" || value <= Number(high));
    };
    return planets
      .filter((planet) => {
        if (focusSystem) return planet.systemId === focusSystem.id;
        if (zone !== "all" && planet.zone !== zone) return false;
        if (!includeCandidateStage && !planet.defaultSolutionConfirmed) return false;
        if (starType && systemById.get(planet.systemId)?.starClass !== starType) return false;
        if (words && !`${planet.name} ${planet.hostname}`.toLowerCase().includes(words)) return false;
        return within(planet.radiusEarth, radiusMin, radiusMax) && within(planet.equilibriumK, tempMin, tempMax);
      })
      .sort(comparator(sort));
  }, [focusSystem, includeCandidateStage, planets, query, radiusMax, radiusMin, sort, starType, systemById, tempMax, tempMin, zone]);

  const matchedSystems = useMemo(() => {
    const groups = new Map<string, HabitabilityPlanet[]>();
    for (const planet of matches) {
      if (!groups.has(planet.systemId)) groups.set(planet.systemId, []);
      groups.get(planet.systemId)?.push(planet);
    }
    return [...groups.entries()].flatMap(([id]) => systemById.get(id) ?? []);
  }, [matches, systemById]);

  const total = view === "systems" ? matchedSystems.length : matches.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Habitability Explorer</h1>
        <p className={styles.lede}>
          Which known planets orbit where liquid water could exist on a surface, given a
          suitable atmosphere. This screens orbits and starlight. It doesn't detect water,
          atmospheres or life.
        </p>
      </header>

      <div className={`glass ${styles.totals}`} role="group" aria-label="Filter by habitable-zone position">
        <LiquidIndicator />
        <button type="button" className={styles.total} aria-pressed={zone === "all"} onClick={() => { setZone("all"); setVisible(PAGE_SIZE); }}>
          <strong>{planets.length.toLocaleString("en-US")}</strong>
          <span>All planets</span>
        </button>
        {ZONE_ORDER.map((value) => (
          <button key={value} type="button" className={styles.total} aria-pressed={zone === value} onClick={() => { setZone(value); setVisible(PAGE_SIZE); }}>
            <strong>{summary.totals[value].toLocaleString("en-US")}</strong>
            <span>{ZONE_LABEL[value]}</span>
          </button>
        ))}
      </div>

      <Method data={data} />

      {focusSystem && (
        <p className={styles.count}>
          Showing {focusPlanet?.name ?? focusSystem.hostname}.{" "}
          <Link href="/habitability" className={styles.planetName}>Show all systems</Link>
        </p>
      )}

      <div className={`plate ${styles.filters}`}>
        <input className="field" type="search" placeholder="Search planets or stars" aria-label="Search planets or stars" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className={styles.filter}>Radius, Earth radii
          <span className={styles.range}>
            <input className="field" inputMode="decimal" placeholder="Min" aria-label="Minimum radius" value={radiusMin} onChange={(event) => setRadiusMin(event.target.value)} />
            <input className="field" inputMode="decimal" placeholder="Max" aria-label="Maximum radius" value={radiusMax} onChange={(event) => setRadiusMax(event.target.value)} />
          </span>
        </label>
        <label className={styles.filter}>Equilibrium temperature, K
          <span className={styles.range}>
            <input className="field" inputMode="decimal" placeholder="Min" aria-label="Minimum temperature" value={tempMin} onChange={(event) => setTempMin(event.target.value)} />
            <input className="field" inputMode="decimal" placeholder="Max" aria-label="Maximum temperature" value={tempMax} onChange={(event) => setTempMax(event.target.value)} />
          </span>
        </label>
        <label className={styles.filter}>Star class, from temperature
          <select className="field" value={starType} onChange={(event) => setStarType(event.target.value)}>
            <option value="">All</option>
            {STAR_CLASSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className={styles.filter}>Sort by
          <select className="field" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={includeCandidateStage} onChange={(event) => setIncludeCandidateStage(event.target.checked)} />
          Include planets whose default values come from a candidate-stage solution
        </label>
      </div>

      <div className={styles.bar}>
        <div className={styles.tabs} role="group" aria-label="View">
          <LiquidIndicator />
          {(["systems", "planets"] as const).map((value) => (
            <button key={value} type="button" className={styles.tab} aria-pressed={view === value} onClick={() => { setView(value); setVisible(PAGE_SIZE); }}>
              {value === "systems" ? "Systems" : "Planets"}
            </button>
          ))}
        </div>
        <p className={styles.count}>
          {total.toLocaleString("en-US")} {view} match
          {view === "systems" ? `, of ${summary.systems.toLocaleString("en-US")}. ${summary.systemsWithAnyAssessment.toLocaleString("en-US")} systems have at least one planet that can be assessed.` : "."}
        </p>
      </div>

      {total === 0 && <p className={styles.empty}>No matches. Try widening the filters.</p>}

      {view === "systems" ? (
        <ul className={styles.list}>
          {matchedSystems.slice(0, visible).map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              planets={system.planetIds.flatMap((id) => planetsById.get(id) ?? [])}
              open={system.id === focusSystem?.id}
            />
          ))}
        </ul>
      ) : (
        <ul className={`plate ${styles.planetList}`}>
          {matches.slice(0, visible).map((planet) => <PlanetRow key={planet.id} planet={planet} />)}
        </ul>
      )}

      {total > visible && (
        <button type="button" className="button button-secondary" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </div>
  );
}

export function HabitabilityExplorer() {
  const { data, failed, retry } = useHabitability();

  if (failed) {
    return (
      <div className={styles.waiting}>
        <p>The habitability data didn't load. Check your connection and try again.</p>
        <button type="button" className="button button-secondary" onClick={retry}>Try again</button>
      </div>
    );
  }
  if (!data) {
    return <div className={styles.waiting}><SceneLoading label="Loading assessments" /></div>;
  }
  return <Explorer data={data} />;
}
