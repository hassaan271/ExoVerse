import type { ReactNode } from "react";
import styles from "./SampleDataNote.module.css";

/** Shown wherever demonstration values appear, so nobody reads them as NASA data. */
export function SampleDataNote({ children }: { children?: ReactNode }) {
  return (
    <p className={styles.note}>
      {children ?? "Demonstration values, not NASA measurements."}
    </p>
  );
}
