import type { Metadata } from "next";
import { Suspense } from "react";
import { SceneLoading } from "@/components/explorer/SceneFallback";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { ObservatoryExplorer } from "@/components/observatories/ObservatoryExplorer";

export const metadata: Metadata = {
  title: "Observatories | ExoVerse",
  description: "The telescopes behind the exoplanet catalog, and the planets each one discovered.",
};

export default function ObservatoriesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<SceneLoading label="Loading observatories" />}>
          <ObservatoryExplorer />
        </Suspense>
      </main>
    </>
  );
}
