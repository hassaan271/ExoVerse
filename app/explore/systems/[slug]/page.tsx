import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SystemExplorer } from "@/components/explorer/SystemExplorer";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { getPlanetRecordsInSystem, getSystemRecord } from "@/lib/catalog.server";
import type { PlanetRecord } from "@/types/planet";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${getSystemRecord(slug)?.hostname ?? "System"} | ExoVerse` };
}

/** The raw NASA columns aren't needed in the browser, so they stay here. */
const withoutRawColumns = (planet: PlanetRecord): PlanetRecord => ({ ...planet, nasa: {} });

export default async function SystemPage({ params }: PageProps) {
  const { slug } = await params;
  const system = getSystemRecord(slug);
  if (!system) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <SystemExplorer
          system={system}
          planets={getPlanetRecordsInSystem(slug).map(withoutRawColumns)}
        />
      </main>
    </>
  );
}
