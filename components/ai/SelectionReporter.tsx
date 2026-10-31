"use client";

import { useEffect } from "react";
import { clearSelection, reportSelection } from "@/lib/ai/appContext";

/** Lets a server-rendered page tell the AI what it is showing. */
export function SelectionReporter({ planetId, systemId }: { planetId: string; systemId: string }) {
  useEffect(() => {
    reportSelection({ planetId, systemId });
    return clearSelection;
  }, [planetId, systemId]);
  return null;
}
