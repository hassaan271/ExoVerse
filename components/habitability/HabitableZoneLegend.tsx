import type { SystemLayout } from "@/lib/galaxyLayout";
import type { HabitabilitySystem } from "@/lib/habitability";
import styles from "./HabitableZoneLegend.module.css";

const au = (value: number) => value.toLocaleString("en-US", { maximumSignificantDigits: 3 });

export function HabitableZoneLegend({
  system,
  layout,
  compressed,
  visible,
  onToggle,
}: {
  system: HabitabilitySystem | null;
  layout: SystemLayout;
  compressed: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  const zone = system?.zone;
  if (!zone) {
    return (
      <p className={`glass ${styles.legend}`}>
        Habitable zone can't be calculated: this star lacks the data it needs.
      </p>
    );
  }
  const widest = Math.max(...layout.orbits.map((orbit) => orbit.semiMajorAxis));
  const beyond = layout.drawDistance(zone.optimisticInner) > widest * 1.6;

  return (
    <div className={`glass ${styles.legend}`}>
      <button type="button" className={styles.toggle} aria-pressed={visible} onClick={onToggle}>
        Habitable zone
      </button>
      {visible && (
        <>
          <p className={styles.key}>
            <span className={styles.swatch} data-band="conservative" />
            Conservative {au(zone.conservativeInner)} to {au(zone.conservativeOuter)} AU
          </p>
          <p className={styles.key}>
            <span className={styles.swatch} data-band="optimistic" />
            Optimistic {au(zone.optimisticInner)} to {au(zone.optimisticOuter)} AU
          </p>
          <p className={styles.note}>
            {system.circumbinary ? "Single-star estimate, for reference: this system's planets orbit two stars. " : ""}
            {system.indicative ? "Indicative only: this star is outside the model's temperature range. " : ""}
            {beyond ? "The zone lies far beyond these orbits. " : ""}
            {compressed ? "Compressed visualization scale." : "Distances to scale."}
          </p>
        </>
      )}
    </div>
  );
}
