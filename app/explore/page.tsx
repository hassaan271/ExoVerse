import type { Metadata } from "next";
import { Suspense } from "react";
import { SceneLoading } from "@/components/explorer/SceneFallback";
import { ExplorerShell } from "@/components/explorer/ExplorerShell";
import { SiteHeader } from "@/components/navigation/SiteHeader";

export const metadata: Metadata = {
  title: "Explore | ExoVerse",
  description: "Move through a 3D galaxy of planetary systems and open any planet.",
};

export default function ExplorePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<SceneLoading label="Loading the galaxy" />}>
          <ExplorerShell />
        </Suspense>
      </main>
    </>
  );
}
