"use client";

import { useCallback, useEffect, useState } from "react";
import type { HabitabilityPlanet, HabitabilitySystem, HzZone } from "@/lib/habitability";

export interface HabitabilityData {
  summary: {
    model: { citation: string; url: string; minTeff: number; maxTeff: number };
    source: { table: string; retrieved: string; rows: number };
    totals: Record<HzZone, number>;
    systems: number;
    systemsWithAnyAssessment: number;
    luminosity: { nasa: number; derived: number; none: number };
  };
  systems: HabitabilitySystem[];
  planets: HabitabilityPlanet[];
}

let cached: Promise<HabitabilityData> | null = null;

function load() {
  cached ??= fetch("/data/habitability.json").then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  });
  return cached;
}

export function useHabitability() {
  const [data, setData] = useState<HabitabilityData | null>(null);
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
