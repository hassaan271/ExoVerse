import { CinematicIntro } from "@/components/landing/CinematicIntro";
import { FeaturedPlanets } from "@/components/landing/FeaturedPlanets";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingCta } from "@/components/landing/LandingCta";
import { PlatformIntro } from "@/components/landing/PlatformIntro";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CatalogStatsBar } from "@/components/shared/CatalogStatsBar";
import { getCatalogStats, getFeaturedPlanets } from "@/lib/catalog.server";
import styles from "./page.module.css";

/** Re-read shortly after the catalog changes, without a rebuild. */
export const revalidate = 300;

export default function HomePage() {
  const stats = getCatalogStats();

  return (
    <CinematicIntro
      fallbackSrc="/images/milky-way-arrival.jpg"
      after={
        <>
          <main>
            <section className={styles.stats} aria-label="The catalog in numbers">
              <CatalogStatsBar stats={stats} />
              <p className={styles.source}>
                {stats.confirmed.toLocaleString("en-US")} confirmed planets, from the NASA
                Exoplanet Archive.
              </p>
            </section>
            <FeaturedPlanets planets={getFeaturedPlanets()} totalPlanets={stats.planets} />
            <PlatformIntro stats={stats} />
            <LandingCta />
          </main>
          <SiteFooter />
        </>
      }
    >
      <HeroSection />
    </CinematicIntro>
  );
}
