import type { CatalogStats } from "@/types/planet";
import styles from "./PlatformIntro.module.css";

const REASONS = [
  {
    title: "Planets are common",
    text: "Most stars are thought to host planets, so the night sky is full of worlds we are only starting to map.",
  },
  {
    title: "No two systems match",
    text: "Giants hugging their stars and tight families of small worlds look nothing like our Solar System.",
  },
  {
    title: "Measurements tell the story",
    text: "Radius, mass and orbit reveal what a planet may be made of, and how it came to be there.",
  },
];

export function PlatformIntro({ stats }: { stats: CatalogStats }) {
  return (
    <section id="discover" className={styles.section}>
      <div>
        <h2 className={styles.title}>Why explore exoplanets</h2>
        <p className={styles.lede}>
          NASA&rsquo;s archive lists {stats.planets.toLocaleString("en-US")} planets
          around other stars. ExoVerse turns those records into places you can move
          through, compare and understand.
        </p>
      </div>

      <ul className={styles.reasons}>
        {REASONS.map(({ title, text }) => (
          <li key={title} className={styles.reason}>
            <h3 className={styles.name}>{title}</h3>
            <p className={styles.text}>{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
