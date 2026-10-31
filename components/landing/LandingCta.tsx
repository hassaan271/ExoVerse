import Link from "next/link";
import styles from "./LandingCta.module.css";

export function LandingCta() {
  return (
    <section className={styles.cta} aria-labelledby="cta-title">
      <div>
        <h2 id="cta-title" className={styles.title}>
          Choose a world and go
        </h2>
        <p className={styles.text}>
          Fly through the galaxy, or set any exoplanet beside Earth and Jupiter.
        </p>
      </div>
      <div className={styles.actions}>
        <Link href="/explore" className="button button-primary">
          Explore Exoplanets
        </Link>
        <Link href="/compare" className="button button-secondary">
          Compare Planets
        </Link>
      </div>
    </section>
  );
}
