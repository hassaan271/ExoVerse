import Link from "next/link";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.brand}>ExoVerse</p>
      <p className={styles.attribution}>
        Planet data comes from the{" "}
        <a href="https://exoplanetarchive.ipac.caltech.edu/">
          NASA Exoplanet Archive
        </a>
        . ExoVerse is an independent project and is not affiliated with or
        endorsed by NASA. Planet images are artistic visualizations.
      </p>
      <nav aria-label="Footer" className={styles.links}>
        <Link href="/explore">Explore</Link>
        <Link href="/compare">Compare</Link>
        <Link href="/about">About</Link>
      </nav>
    </footer>
  );
}
