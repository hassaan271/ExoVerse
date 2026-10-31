"use client";

import { type RefObject, useLayoutEffect } from "react";
import styles from "./SceneLabels.module.css";
import type { LabelSlot } from "./useScreenPicking";

export interface SceneLabel {
  key: string;
  text: string;
  /** Index of the point this label follows, or -1 while it has none. */
  point: number;
  selected?: boolean;
  /** Sits left of its point, to clear a label that shares the spot. */
  side?: "left";
  onClick?: () => void;
}

/**
 * Real buttons over the canvas, so labelled markers work from the keyboard and
 * with screen readers. useScreenPicking moves them each frame.
 */
export function SceneLabels({
  labels,
  slots,
}: {
  labels: SceneLabel[];
  slots: RefObject<LabelSlot[]>;
}) {
  // After commit, not during render: a frame can run between the two, and a
  // longer list would show it empty slots.
  useLayoutEffect(() => {
    slots.current.length = labels.length;
  }, [labels.length, slots]);

  return (
    <div className={styles.layer}>
      {labels.map((label, index) => {
        const ref = (element: HTMLElement | null) => {
          slots.current[index] = { element, point: label.point };
        };
        const shared = {
          ref,
          className: styles.label,
          // Hidden until the first frame gives it a position.
          style: { visibility: "hidden" as const },
          "data-selected": label.selected || undefined,
          "data-side": label.side,
        };
        return label.onClick ? (
          <button key={label.key} type="button" onClick={label.onClick} {...shared}>
            {label.text}
          </button>
        ) : (
          <span key={label.key} {...shared}>
            {label.text}
          </span>
        );
      })}
    </div>
  );
}
