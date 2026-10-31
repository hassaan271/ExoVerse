"use client";

import { useCallback, useEffect, useState } from "react";

export type ObservatoryStatus = "current" | "future" | "historical" | "ground";

export type ObservatoryRegion =
  | { kind: "low" | "high" | "tess"; inclination: number; hostedOn?: string }
  | { kind: "l2" | "unassigned" }
  | { kind: "trailing"; offset: number }
  | { kind: "balloon"; lat: number; lon: number };

export type ObservatoryModel =
  | { kind: "official"; file: string; page: string; credit: string; note?: string; yaw?: number }
  | { kind: "reconstruction"; build: string }
  | { kind: "none" };

/** [system id, host star, planets discovered here, ra, dec] */
export type DiscoveredSystem = [string, string, number, number, number];

export interface Discoveries {
  planets: number;
  systemCount: number;
  firstYear: number | null;
  lastYear: number | null;
  methods: Record<string, number>;
  systems: DiscoveredSystem[];
}

export interface ScienceNote {
  kind: "follow-up" | "atmosphere";
  target: string;
  systemId: string;
  text: string;
  source: string;
}

export interface Observatory {
  id: string;
  name: string;
  short: string;
  status: Exclude<ObservatoryStatus, "ground">;
  agency: string;
  started: string;
  end: string | null;
  region: ObservatoryRegion;
  orbit: string;
  summary: string;
  instruments: string[];
  science: ScienceNote[];
  url: string;
  model: ObservatoryModel;
  extra: boolean;
  discoveries: Discoveries;
}

export interface GroundSite {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  discoveries: Discoveries;
}

export interface ObservatoryData {
  observatories: Observatory[];
  ground: GroundSite[];
  unattributed: { facility: string; planets: number }[];
  totalPlanets: number;
}

let cached: Promise<ObservatoryData> | null = null;

function load() {
  cached ??= fetch("/data/observatories.json").then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  });
  return cached;
}

export function useObservatories() {
  const [data, setData] = useState<ObservatoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (loaded) => active && setData(loaded),
      () => {
        cached = null;
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  return { data, failed, retry };
}
