import type { Metadata } from "next";
import { Suspense } from "react";
import { HabitabilityExplorer } from "@/components/habitability/HabitabilityExplorer";
import { SiteHeader } from "@/components/navigation/SiteHeader";

export const metadata: Metadata = {
  title: "Habitability Explorer | ExoVerse",
  description:
    "Screen known planetary systems against habitable-zone models, with every assumption and missing value shown.",
};

export default function HabitabilityPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense>
          <HabitabilityExplorer />
        </Suspense>
      </main>
    </>
  );
}
