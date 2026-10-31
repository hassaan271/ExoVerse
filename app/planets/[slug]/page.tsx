import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { PlanetDashboard } from "@/components/planet/PlanetDashboard";
import {
  getObservatoryId,
  getPlanetHabitability,
  getPlanetRecord,
  getPlanetRecordsInSystem,
  getSystemHabitability,
  getSystemRecord,
} from "@/lib/catalog.server";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${getPlanetRecord(slug)?.pl_name ?? "Planet"} | ExoVerse` };
}

/** One route for every planet, rendered on request from its catalog record. */
export default async function PlanetPage({ params }: PageProps) {
  const { slug } = await params;
  const planet = getPlanetRecord(slug);
  if (!planet) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <PlanetDashboard
          key={planet.id}
          planet={planet}
          system={getSystemRecord(planet.system_id)}
          siblings={getPlanetRecordsInSystem(planet.system_id)}
          observatoryId={getObservatoryId(planet.discovery.facility)}
          habitability={getPlanetHabitability(planet.id)}
          systemHabitability={getSystemHabitability(planet.system_id)}
        />
      </main>
    </>
  );
}
