"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { PlanetSearch } from "@/components/shared/PlanetSearch";
import { useIntroPhase } from "./CinematicIntro";
import styles from "./HeroSection.module.css";

/** One staged reveal: each layer starts this many seconds after "arriving". */
const delay = (seconds: number) =>
  ({ "--delay": `${seconds}s` }) as CSSProperties;

export function HeroSection() {
  const phase = useIntroPhase();

  return (
    <div className={styles.hero} data-phase={phase}>
      <div data-reveal className={styles.reveal} style={delay(0.75)}>
        <SiteHeader overlay />
      </div>

      <div className={styles.copy} data-depth>
        <h1 data-reveal className={`${styles.heading} ${styles.reveal}`} style={delay(0.15)}>
          Explore Worlds Beyond Our Solar System.
        </h1>
        <p data-reveal className={`${styles.lede} ${styles.reveal}`} style={delay(0.35)}>
          Discover distant worlds, explore planetary systems and understand the
          universe through real NASA data and AI-powered scientific exploration.
        </p>
        <div data-reveal className={`${styles.actions} ${styles.reveal}`} style={delay(0.55)}>
          <Link href="/explore" className="button button-primary">
            Explore Exoplanets
          </Link>
          <Link href="#discover" className="button button-secondary">
            Discover ExoVerse
          </Link>
        </div>
        <div data-reveal className={styles.reveal} style={delay(0.7)}>
          <PlanetSearch />
        </div>
      </div>
    </div>
  );
}
