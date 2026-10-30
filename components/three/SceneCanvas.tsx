"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./SceneCanvas.module.css";

class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function canUseWebGL() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

interface SceneCanvasProps extends Omit<CanvasProps, "fallback"> {
  /** Shown when WebGL is missing, fails or loses its context. */
  fallback: ReactNode;
}

/**
 * Every 3D view goes through here, for one set of renderer defaults, one
 * failure path, and a render loop that stops while the view can't be seen.
 */
export function SceneCanvas({ fallback, children, onCreated, ...props }: SceneCanvasProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    setSupported(canUseWebGL());
  }, []);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry.isIntersecting),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (supported === false || lost) return <>{fallback}</>;

  return (
    <div ref={holder} className={styles.holder}>
      {supported && (
        <SceneBoundary fallback={fallback}>
          <Canvas
            frameloop={onScreen ? "always" : "never"}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            {...props}
            onCreated={(state) => {
              state.gl.domElement.addEventListener("webglcontextlost", () =>
                setLost(true),
              );
              onCreated?.(state);
            }}
          >
            {children}
          </Canvas>
        </SceneBoundary>
      )}
    </div>
  );
}
