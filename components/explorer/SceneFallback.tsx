"use client";

import { useState } from "react";
import { StarField } from "@/components/shared/StarField";
import styles from "./SceneFallback.module.css";

/**
 * Stars show at once, so a 3D view is never an empty black box. Pass `ready` to
 * fade the cover away over the scene once it has drawn.
 */
export function SceneLoading({ label, ready = false }: { label: string; ready?: boolean }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div
      className={styles.cover}
      role="status"
      data-ready={ready}
      onTransitionEnd={() => ready && setGone(true)}
    >
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
