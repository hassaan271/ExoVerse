"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SceneLoading, SceneUnavailable } from "@/components/explorer/SceneFallback";
import type { SceneView } from "@/components/three/ObservatoryScene";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import {
  type DiscoveredSystem,
  type GroundSite,
  type Observatory,
  type ObservatoryData,
  type ObservatoryModel,
  type ObservatoryStatus,
  useObservatories,
} from "@/lib/observatories";
import { layOutObservatories } from "@/lib/observatoryLayout";
import { replaceUrl } from "@/lib/replaceUrl";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import styles from "./ObservatoryExplorer.module.css";

const ObservatoryScene = dynamic(() => import("@/components/three/ObservatoryScene"), {
  ssr: false,
});

const FILTERS: { value: ObservatoryStatus | "planets"; label: string }[] = [
  { value: "planets", label: "Found planets" },
  { value: "current", label: "Current" },
  { value: "future", label: "Future" },
  { value: "historical", label: "Historical" },
  { value: "ground", label: "Ground" },
];

const LABELLED = ["hubble", "webb", "tess", "kepler", "spitzer", "roman"];
const SYSTEMS_SHOWN = 30;
const NO_MODEL: ObservatoryModel = { kind: "none" };
const STATUS_TEXT: Record<ObservatoryStatus, string> = {
  current: "Current mission",
  future: "Future mission",
  historical: "Historical mission",
  ground: "Ground observatory",
};

type Item = (Observatory & { kindOf: "mission" }) | (GroundSite & { kindOf: "ground"; status: "ground"; short: string });

/** Without WebGL there is no Earth to wait for. */
function WhenUnavailable({ onUnavailable }: { onUnavailable: () => void }) {
  useEffect(onUnavailable, [onUnavailable]);
  return null;
}

function ModelCredit({ model }: { model: ObservatoryModel }) {
  if (model.kind === "official") {
    return (
      <p className={styles.credit}>
        3D model: <a href={model.page} target="_blank" rel="noreferrer">{model.credit}</a>.{" "}
        {model.note ?? "Source file unmodified."} ExoVerse is not affiliated with or endorsed by NASA.
      </p>
    );
  }
  if (model.kind === "reconstruction") {
    return (
      <p className={styles.credit}>
        Artistic reconstruction of the general shape. Not an official engineering model, and proportions are approximate.
      </p>
    );
  }
  return <p className={styles.credit}>No 3D model yet, so this mission is shown as a marker.</p>;
}

function Discoveries({ item }: { item: Item }) {
  const { discoveries } = item;
  const systems = discoveries.systems.slice(0, SYSTEMS_SHOWN);
  const methods = Object.entries(discoveries.methods).sort((a, b) => b[1] - a[1]);

  if (discoveries.planets === 0) {
    return (
      <p className={styles.note}>
        The NASA Exoplanet Archive credits no planet discoveries to this observatory.
      </p>
    );
  }

  return (
    <>
      <dl className={styles.stats}>
        <div>
          <dd><AnimatedNumber value={discoveries.planets} precision={0} animationKey={item.id} /></dd>
          <dt>Planets discovered</dt>
        </div>
        <div>
          <dd><AnimatedNumber value={discoveries.systemCount} precision={0} animationKey={item.id} /></dd>
          <dt>Planetary systems</dt>
        </div>
      </dl>
      <p className={styles.note}>
        {discoveries.firstYear === discoveries.lastYear
          ? `Discovered in ${discoveries.firstYear}`
          : `Discovered ${discoveries.firstYear} to ${discoveries.lastYear}`}
        {", by "}
        {methods.map(([method]) => method.toLowerCase()).join(", ")}.
      </p>
      <ul className={styles.systems}>
        {systems.map((system: DiscoveredSystem) => (
          <li key={system[0]}>
            <Link href={`/explore/systems/${system[0]}`} className={styles.systemLink}>
              <span>{system[1]}</span>
              <span className={styles.count}>
                {system[2]} {system[2] === 1 ? "planet" : "planets"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {discoveries.systems.length > SYSTEMS_SHOWN && (
        <p className={styles.note}>
          The {SYSTEMS_SHOWN} with the most planets, of{" "}
          {discoveries.systems.length.toLocaleString("en-US")}. All appear on the sky view.
        </p>
      )}
    </>
  );
}

function Details({
  item,
  view,
  onView,
  placed,
  modelState,
}: {
  item: Item;
  view: SceneView;
  onView: (view: SceneView) => void;
  placed: boolean;
  modelState: "loading" | "ready" | "failed";
}) {
  const mission = item.kindOf === "mission" ? item : null;
  const atmosphere = mission?.science.filter((note) => note.kind === "atmosphere") ?? [];
  const followUp = mission?.science.filter((note) => note.kind === "follow-up") ?? [];

  return (
    <aside className={`glass fade-in ${styles.details}`} aria-label={`${item.name} details`}>
      <h2 className={styles.name}>{item.name}</h2>
      <p className={styles.meta}>
        {STATUS_TEXT[item.status]}
        {mission ? `, ${mission.agency}` : `, ${(item as GroundSite).country}`}
      </p>

      {placed && (
        <div className={styles.views} role="group" aria-label="View">
          {(mission?.model.kind === "none" || !mission
            ? (["map", "sky"] as const)
            : (["spacecraft", "sky", "map"] as const)
          ).map((value) => (
            <button
              key={value}
              type="button"
              className={styles.view}
              aria-pressed={view === value}
              onClick={() => onView(value)}
            >
              {value === "spacecraft" ? "Spacecraft" : value === "sky" ? "Connections" : "Map"}
            </button>
          ))}
        </div>
      )}

      {mission && <p className={styles.summary}>{mission.summary}</p>}

      <dl className={styles.facts}>
        {mission ? (
          <>
            <div><dt>Status</dt><dd>{[mission.started, mission.end].filter(Boolean).join(". ")}</dd></div>
            <div><dt>Location</dt><dd>{mission.orbit}</dd></div>
            {mission.instruments.length > 0 && (
              <div><dt>Instruments</dt><dd>{mission.instruments.join(", ")}</dd></div>
            )}
          </>
        ) : (
          <div><dt>Location</dt><dd>{(item as GroundSite).country}</dd></div>
        )}
      </dl>

      <section className={styles.block}>
        <h3 className={styles.heading}>Planet discoveries</h3>
        <Discoveries item={item} />
      </section>

      {mission && (
        <section className={styles.block}>
          <h3 className={styles.heading}>Atmospheric characterization</h3>
          {atmosphere.length > 0 ? (
            <ul className={styles.science}>
              {atmosphere.map((note) => (
                <li key={note.target}>
                  <Link href={`/explore/systems/${note.systemId}`} className={styles.scienceTarget}>{note.target}</Link>
                  <p>{note.text} <a href={note.source} target="_blank" rel="noreferrer">Source</a></p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>Not recorded in ExoVerse.</p>
          )}
          <h3 className={styles.heading}>Follow-up observations</h3>
          {followUp.length > 0 ? (
            <ul className={styles.science}>
              {followUp.map((note) => (
                <li key={note.target}>{note.target}: {note.text}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>
              Not recorded in ExoVerse. The archive file lists discoveries only, and these
              never count toward the totals above.
            </p>
          )}
        </section>
      )}

      {mission && (
        <>
          {modelState === "failed" ? (
            <p className={styles.credit}>The 3D model didn't load.</p>
          ) : (
            <ModelCredit model={mission.model} />
          )}
          {mission.extra && (
            <p className={styles.credit}>
              Not in NASA's Observatories directory. Listed because the archive credits it with discoveries.
            </p>
          )}
          <a href={mission.url} target="_blank" rel="noreferrer" className="button button-secondary">
            Mission page
          </a>
        </>
      )}
    </aside>
  );
}

function Explorer({ data }: { data: ObservatoryData }) {
  const params = useSearchParams();
  const router = useRouter();
  const placedItems = useMemo(() => layOutObservatories(data.observatories, data.ground), [data]);
  const items = useMemo<Item[]>(
    () => [
      ...data.observatories.map((o) => ({ ...o, kindOf: "mission" as const })),
      ...data.ground.map((g) => ({ ...g, kindOf: "ground" as const, status: "ground" as const, short: g.name })),
    ],
    [data],
  );

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("planets");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const requested = params.get("id");
    return items.some(({ id }) => id === requested) ? requested : null;
  });
  const [view, setView] = useState<SceneView>("spacecraft");
  const [modelState, setModelState] = useState<"loading" | "ready" | "failed">("loading");
  const [earthReady, setEarthReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const selected = items.find(({ id }) => id === selectedId) ?? null;
  const selectedPlace = placedItems.find(({ id }) => id === selectedId) ?? null;
  const model = selected?.kindOf === "mission" ? selected.model : NO_MODEL;
  const systems = selected?.discoveries.systems ?? [];

  const select = useCallback((id: string) => {
    const next = items.find((item) => item.id === id);
    setSelectedId(id);
    setModelState("loading");
    setView(next?.kindOf === "mission" && next.model.kind !== "none" ? "spacecraft" : "sky");
    replaceUrl(`/observatories?id=${encodeURIComponent(id)}`);
  }, [items]);

  const close = () => {
    setSelectedId(null);
    replaceUrl("/observatories");
  };

  const onModelLoaded = useCallback((failed: boolean) => setModelState(failed ? "failed" : "ready"), []);
  const onEarthReady = useCallback(() => setEarthReady(true), []);
  const openSystem = useCallback((id: string) => {
    router.push(`/explore/systems/${id}`);
  }, [router]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (words) return `${item.name} ${item.short}`.toLowerCase().includes(words);
        return filter === "planets" ? item.discoveries.planets > 0 && item.kindOf === "mission" : item.status === filter;
      })
      .sort((a, b) => b.discoveries.planets - a.discoveries.planets);
  }, [filter, items, query]);

  const otherPlanets = data.unattributed.reduce((sum, row) => sum + row.planets, 0);

  return (
    <div className={styles.shell}>
      <div className={styles.scene}>
        <SceneLoading label="Preparing the mission map" ready={earthReady} />
        <ObservatoryScene
          items={placedItems}
          selected={selectedPlace}
          model={model}
          systems={systems}
          view={view}
          reducedMotion={reducedMotion}
          labelled={LABELLED}
          onSelect={select}
          onSelectSystem={openSystem}
          onModelLoaded={onModelLoaded}
          onEarthReady={onEarthReady}
          fallback={
            <>
              <WhenUnavailable onUnavailable={onEarthReady} />
              <SceneUnavailable>
                This device can't show the 3D mission map. The missions and their
                discoveries are still listed here.
              </SceneUnavailable>
            </>
          }
        />
      </div>

      <aside className={`glass ${styles.browse}`} aria-label="Observatories">
        <h1 className={styles.title}>Observatories</h1>
        <p className={styles.note}>
          The telescopes behind the catalog, and the planets each one found.
        </p>
        <input
          className="field"
          type="search"
          placeholder="Search missions"
          aria-label="Search missions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.filters} role="group" aria-label="Filter missions">
          <LiquidIndicator />
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.filter}
              aria-pressed={filter === option.value && !query}
              onClick={() => {
                setFilter(option.value);
                setQuery("");
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <ul className={styles.list}>
          <LiquidIndicator as="li" />
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.row}
                aria-pressed={item.id === selectedId}
                onClick={() => select(item.id)}
              >
                <span>{item.short}</span>
                <span className={styles.count}>
                  {item.discoveries.planets > 0
                    ? item.discoveries.planets.toLocaleString("en-US")
                    : item.status === "future" ? "Planned" : ""}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className={styles.note}>No missions match. Try another name.</li>}
        </ul>
        <p className={styles.credit}>
          {otherPlanets.toLocaleString("en-US")} of {data.totalPlanets.toLocaleString("en-US")} planets
          are credited to surveys and sites not listed here, including{" "}
          {data.unattributed[0].planets} to multiple observatories.
        </p>
      </aside>

      {selected && (
        <div className={styles.detailsHolder}>
          <button type="button" className={styles.close} onClick={close} aria-label="Close details">
            Close
          </button>
          <Details
            key={selected.id}
            item={selected}
            view={view}
            onView={setView}
            placed={selectedPlace !== null}
            modelState={modelState}
          />
        </div>
      )}

      <p className={`glass ${styles.legend}`}>
        Schematic map, not to scale. Positions are illustrative, not live. Lines show discoveries, not travel paths.
      </p>
    </div>
  );
}

export function ObservatoryExplorer() {
  const { data, failed, retry } = useObservatories();

  if (failed) {
    return (
      <div className={styles.failure}>
        <p>The observatory data didn't load. Check your connection and try again.</p>
        <button type="button" className="button button-secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.waiting}>
        <SceneLoading label="Loading observatories" />
      </div>
    );
  }
  return <Explorer data={data} />;
}
