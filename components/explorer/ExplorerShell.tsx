"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import { CatalogStatsBar } from "@/components/shared/CatalogStatsBar";
import { DEFAULT_SYSTEM_ID, FEATURED_SYSTEM_IDS, useCatalog } from "@/lib/catalogIndex";
import {
  filterPlanets,
  hasActiveFilters,
  NO_FILTERS,
  type PlanetFilters,
  type SortKey,
  sortPlanets,
} from "@/lib/filterPlanets";
import { formatValue } from "@/lib/format";
import { hasPosition } from "@/lib/galaxyLayout";
import { clearSelection, reportSelection } from "@/lib/ai/appContext";
import { replaceUrl } from "@/lib/replaceUrl";
import type { Catalog } from "@/types/planet";
import { ExplorerFilters } from "./ExplorerFilters";
import styles from "./ExplorerShell.module.css";
import { GalaxyViewport } from "./GalaxyViewport";
import { PlanetRows } from "./PlanetRows";
import { SceneLoading } from "./SceneFallback";
import { FeaturedSystemList, PlanetList } from "./SystemList";

const PAGE_SIZE = 40;
const plural = (total: number, word: string) =>
  `${total.toLocaleString("en-US")} ${word}${total === 1 ? "" : "s"}`;

function Explorer({ catalog }: { catalog: Catalog }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<PlanetFilters>({
    ...NO_FILTERS,
    query: searchParams.get("q") ?? "",
  });
  const [sort, setSort] = useState<SortKey>("name");
  const [browsing, setBrowsing] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [mobileTab, setMobileTab] = useState<"browse" | "system">("browse");

  const deferredFilters = useDeferredValue(filters);
  const { planets, systems, systemById, methods, stats } = catalog;

  // The router doesn't see replaceUrl, so the latest selection is held here.
  const [picked, setPicked] = useState<string | null>(null);
  const requested = picked ?? searchParams.get("system");
  const selected =
    (requested && systemById.get(requested)) || systemById.get(DEFAULT_SYSTEM_ID)!;

  const filtering = hasActiveFilters(deferredFilters);
  const matches = useMemo(
    () => (filtering ? filterPlanets(planets, deferredFilters) : planets),
    [planets, deferredFilters, filtering],
  );
  const sorted = useMemo(() => sortPlanets(matches, sort), [matches, sort]);
  const matching = useMemo(
    () => (filtering ? new Set(matches.map((planet) => planet.systemId)) : null),
    [filtering, matches],
  );

  useEffect(() => setVisible(PAGE_SIZE), [deferredFilters, sort]);

  useEffect(() => {
    reportSelection({ systemId: selected.id });
    return clearSelection;
  }, [selected.id]);

  // The URL records the selection without a navigation, so the scene stays
  // mounted and the link can be shared.
  const selectSystem = useCallback((id: string) => {
    replaceUrl(`/explore?system=${encodeURIComponent(id)}`);
    setPicked(id);
    setMobileTab("system");
  }, []);

  const showList = filtering || browsing;
  const featured = useMemo(
    () => FEATURED_SYSTEM_IDS.flatMap((id) => systemById.get(id) ?? []),
    [systemById],
  );
  const systemCount = matching ? matching.size : systems.length;

  return (
    <div className={styles.shell} data-tab={mobileTab}>
      <div className={styles.scene}>
        <GalaxyViewport
          systems={systems}
          selectedId={selected.id}
          matching={matching}
          onSelect={selectSystem}
        />
      </div>

      <div className={`glass ${styles.stats}`}>
        <CatalogStatsBar stats={stats} />
      </div>

      <div className={`glass ${styles.tabs}`} role="tablist" aria-label="Explorer panels">
        <LiquidIndicator />
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "browse"}
          onClick={() => setMobileTab("browse")}
        >
          Search and filter
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "system"}
          onClick={() => setMobileTab("system")}
        >
          {selected.hostname}
        </button>
      </div>

      <section className={`glass ${styles.browse}`} aria-labelledby="browse-title">
        <div>
          <h1 id="browse-title" className={styles.title}>
            Explore
          </h1>
          <p className={styles.counts} role="status">
            {plural(matches.length, "planet")} in {plural(systemCount, "system")}
          </p>
        </div>
        <div className={styles.statsInline}>
          <CatalogStatsBar stats={stats} />
        </div>
        <ExplorerFilters
          filters={filters}
          methods={methods}
          sort={sort}
          onChange={setFilters}
          onSortChange={(next) => {
            setSort(next);
            setBrowsing(true);
          }}
        />

        {!showList && (
          <>
            <h2 className={styles.listTitle}>Featured systems</h2>
            <FeaturedSystemList
              systems={featured}
              selectedId={selected.id}
              onSelect={selectSystem}
            />
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setBrowsing(true)}
            >
              Browse all {plural(planets.length, "planet")}
            </button>
          </>
        )}

        {showList && sorted.length > 0 && (
          <>
            <PlanetList
              planets={sorted.slice(0, visible)}
              sort={sort}
              selectedSystemId={selected.id}
              onSelect={selectSystem}
            />
            {visible < sorted.length && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
              >
                Show more ({(sorted.length - visible).toLocaleString("en-US")} left)
              </button>
            )}
          </>
        )}

        {showList && sorted.length === 0 && (
          <div className={styles.empty}>
            <p>No planets match these filters.</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setFilters(NO_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <aside className={`glass ${styles.system}`} aria-label="Selected system">
        <div>
          <h2 className={styles.systemName}>{selected.hostname}</h2>
          <p className={styles.star}>
            {selected.spectralType ?? "Spectral type not available"},{" "}
            {selected.distanceLy === null
              ? "distance not available"
              : <AnimatedNumber
                  value={`${formatValue(selected.distanceLy, "light-years")} away`}
                  animationKey={selected.id}
                />}
          </p>
        </div>
        {!hasPosition(selected) && (
          <p className={styles.unavailable}>
            Position unavailable. NASA lists no distance for this star, so it isn't
            placed on the map.
          </p>
        )}
        <PlanetRows planets={selected.planets} />
        <Link href={`/explore/systems/${selected.id}`} className="button button-primary">
          Explore system
        </Link>
      </aside>
    </div>
  );
}

export function ExplorerShell() {
  const { catalog, failed, retry } = useCatalog();

  if (failed) {
    return (
      <div className={styles.loading}>
        <div className={styles.failure}>
          <p>The planet catalog didn't load. Check your connection and try again.</p>
          <button type="button" className="button button-secondary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className={styles.loading}>
        <SceneLoading label="Loading the planet catalog" />
      </div>
    );
  }

  return <Explorer catalog={catalog} />;
}
