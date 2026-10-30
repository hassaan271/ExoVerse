import type { ReactNode } from "react";
import { Icon } from "@/components/shared/Icon";
import styles from "./SceneToolbar.module.css";

interface SceneToolbarProps {
  hint: string;
  paused: boolean;
  pauseLabel: string;
  onTogglePause: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  /** Extra controls placed before the buttons. */
  children?: ReactNode;
}

/** The control strip shared by the galaxy, system and planet views. */
export function SceneToolbar({
  hint,
  paused,
  pauseLabel,
  onTogglePause,
  onZoomIn,
  onZoomOut,
  onReset,
  children,
}: SceneToolbarProps) {
  return (
    <div className={`glass ${styles.toolbar}`}>
      {children}
      <p className={styles.hint}>{hint}</p>
      <div className={styles.buttons}>
        {onZoomOut && (
          <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
            <Icon name="minus" />
          </button>
        )}
        {onZoomIn && (
          <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
            <Icon name="plus" />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={`${paused ? "Resume" : "Pause"} ${pauseLabel}`}
          title={`${paused ? "Resume" : "Pause"} ${pauseLabel}`}
          aria-pressed={paused}
          onClick={onTogglePause}
        >
          <Icon name={paused ? "play" : "pause"} />
        </button>
        {onReset && (
          <button type="button" className="icon-button" aria-label="Reset view" title="Reset view" onClick={onReset}>
            <Icon name="reset" />
          </button>
        )}
      </div>
    </div>
  );
}
