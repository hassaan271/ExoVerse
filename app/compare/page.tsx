import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareExperience } from "@/components/compare/CompareExperience";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";

export const metadata: Metadata = {
  title: "Compare | ExoVerse",
  description: "Compare any exoplanet with Earth, Jupiter or another exoplanet.",
};

export default function ComparePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense>
          <CompareExperience />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
