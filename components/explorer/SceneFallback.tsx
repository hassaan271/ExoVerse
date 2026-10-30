import { StarField } from "@/components/shared/StarField";
import styles from "./SceneFallback.module.css";

/** Stars show at once, so a 3D view is never an empty black box. */
export function SceneLoading({ label }: { label: string }) {
  return (
    <div className={styles.cover} role="status">
      <StarField density={1.6} />
      <p className={styles.message}>{label}</p>
    </div>
  );
}

export function SceneUnavailable({ children }: { children: string }) {
  return (
    <div className={styles.cover}>
      <StarField density={1.6} />
      <p className={styles.message}>{children}</p>
    </div>
  );
}
